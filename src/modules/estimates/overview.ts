/**
 * Overview — the Home screen's view of every bridge: all lanes (pedestrian included) in
 * one response, using the app's vocabulary (rising/steady/falling trends, bridge status
 * computed by the backend).
 *
 * Pure mapping from the per-lane estimates; the service gathers the inputs.
 */

import { BridgeStatus, WaitTrend } from '../../common/enums/bridge.enum.js';
import { LaneType } from '../../common/enums/lane.enum.js';
import { describeSchedule } from '../bridges/bridge-schedule.js';
import type { ScheduleDescription } from '../bridges/bridge-schedule.js';
import type { Bridge } from '../bridges/entities/bridge.entity.js';
import type { EstimateResponseEntry, EstimateTrend } from './estimates.service.js';

/** CBP only publishes northbound waits, so every bridge crosses Juárez -> El Paso. */
export type CrossingDirection = 'MX_TO_US';

export interface LaneOverview {
  /** Null when the lane has no estimate (closed or no data). */
  estimatedWaitMinutes: number | null;
  /** Congestion level (low <= 30 min, medium <= 60, high <= 120, saturated above); null without an estimate. */
  status: BridgeStatus | null;
  trend: WaitTrend | null;
  /** Lanes open right now according to CBP; null when unknown. */
  lanesOpen: number | null;
  available: boolean;
  unavailableReason: 'laneClosed' | 'noData' | null;
  confidence: 'low' | 'medium' | 'high';
  /** True for the best bridge in this lane. */
  isBestOption: boolean;
  /** The official data used is older than its freshness window. */
  sourceStale: boolean;
}

export interface BridgeOverview {
  id: string;
  slug: string;
  name: string;
  /** Compact name for tight UI; the full name when no short name is stored. */
  shortName: string;
  direction: CrossingDirection;
  sortOrder: number;
  /** False only when every lane is closed. */
  isOpen: boolean;
  schedule: ScheduleDescription;
  /** Crossing coordinates (OpenStreetMap), for directions; null when the catalog has none. */
  latitude: number | null;
  longitude: number | null;
  lastUpdatedAt: string | null;
  /** Community reports in the last hour, all lanes. */
  recentReportCount: number;
  lanes: Record<LaneType, LaneOverview>;
}

export interface OverviewResponse {
  generatedAt: string;
  bridges: BridgeOverview[];
}

/** The lanes of the overview, in presentation order. */
export const OVERVIEW_LANES: readonly LaneType[] = [
  LaneType.General,
  LaneType.ReadyLane,
  LaneType.Sentri,
  LaneType.Pedestrian,
];

const TREND_MAP: Record<EstimateTrend, WaitTrend> = {
  up: WaitTrend.Rising,
  down: WaitTrend.Falling,
  stable: WaitTrend.Steady,
};

/** /estimates says up/down/stable; the bridge entity and the app say rising/falling/steady. */
export function mapTrend(trend: EstimateTrend): WaitTrend {
  return TREND_MAP[trend];
}

export function buildLaneOverview(entry: EstimateResponseEntry | undefined): LaneOverview {
  if (!entry) {
    return {
      estimatedWaitMinutes: null,
      status: null,
      trend: null,
      lanesOpen: null,
      available: false,
      unavailableReason: 'noData',
      confidence: 'low',
      isBestOption: false,
      sourceStale: false,
    };
  }

  const available = entry.laneAvailable && entry.estimatedWaitMinutes !== undefined;

  return {
    estimatedWaitMinutes: available ? (entry.estimatedWaitMinutes ?? null) : null,
    status: available ? (entry.status as BridgeStatus) : null,
    trend: available ? mapTrend(entry.trend) : null,
    lanesOpen: entry.lanesOpen,
    available,
    unavailableReason: available ? null : (entry.estimateUnavailable ?? 'noData'),
    confidence: entry.confidence,
    isBestOption: entry.isBestOption,
    sourceStale: entry.sourceStale === true,
  };
}

export function buildBridgeOverview(
  bridge: Bridge,
  entriesByLane: Partial<Record<LaneType, EstimateResponseEntry>>,
  recentReportCount: number,
): BridgeOverview {
  const lanes = Object.fromEntries(
    OVERVIEW_LANES.map((lane) => [lane, buildLaneOverview(entriesByLane[lane])]),
  ) as Record<LaneType, LaneOverview>;

  return {
    id: bridge.id,
    slug: bridge.slug,
    name: bridge.name,
    shortName: bridge.shortName ?? bridge.name,
    direction: 'MX_TO_US',
    sortOrder: bridge.sortOrder,
    isOpen: OVERVIEW_LANES.some((lane) => lanes[lane].unavailableReason !== 'laneClosed'),
    schedule: describeSchedule(bridge.opensAt, bridge.closesAt),
    latitude: bridge.latitude,
    longitude: bridge.longitude,
    lastUpdatedAt: bridge.lastUpdatedAt?.toISOString() ?? null,
    recentReportCount,
    lanes,
  };
}
