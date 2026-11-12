/**
 * historical-insights.service.ts
 *
 * What the app shows from history, for every bridge and lane in one answer: the usual wait at
 * this time of day and the best and busiest moments of today's weekday. Both are null until
 * the collected history has enough evidence; nothing is ever estimated to fill a gap.
 */

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LaneType } from '../../../common/enums/lane.enum.js';
import { BridgesService } from '../../bridges/bridges.service.js';
import {
  localSlot,
  pickBestTimes,
  pickUsual,
  type BestTimes,
  type DayProfileBin,
  type EvidenceThresholds,
  type UsualWait,
} from './day-insights.js';
import { HISTORICAL_CLOCK } from './historical-patterns.service.js';
import { HistoricalRepository } from './historical.repository.js';

export interface LaneInsights {
  usual: UsualWait | null;
  bestTimes: BestTimes | null;
}

export interface BridgeInsights {
  bridgeId: string;
  lanes: Record<LaneType, LaneInsights>;
}

export interface InsightsResponse {
  generatedAt: string;
  timezone: string;
  /** Local weekday used (0 = Sunday) and the 30-minute bin of "now". */
  dayOfWeek: number;
  time: string;
  /** False while the historical API is switched off: every figure is then null. */
  historyEnabled: boolean;
  bridges: BridgeInsights[];
}

const INSIGHT_LANES: readonly LaneType[] = [LaneType.General, LaneType.ReadyLane, LaneType.Sentri, LaneType.Pedestrian];

/** History changes slowly (one new slot every 15 minutes at most), so a short cache is enough. */
const CACHE_TTL_MS = 5 * 60_000;

const EMPTY: LaneInsights = { usual: null, bestTimes: null };

@Injectable()
export class HistoricalInsightsService {
  private cache: { value: InsightsResponse; expiresAt: number } | null = null;
  private inFlight: Promise<InsightsResponse> | null = null;

  constructor(
    private readonly repository: HistoricalRepository,
    private readonly bridgesService: BridgesService,
    private readonly configService: ConfigService,
    @Inject(HISTORICAL_CLOCK) private readonly now: () => Date,
  ) {}

  async getInsights(): Promise<InsightsResponse> {
    const moment = this.now().getTime();
    if (this.cache && this.cache.expiresAt > moment) return this.cache.value;

    // Callers that arrive while it is being computed share that one computation.
    this.inFlight ??= this.compute()
      .then((value) => {
        this.cache = { value, expiresAt: this.now().getTime() + CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async compute(): Promise<InsightsResponse> {
    const timezone = this.configService.get<string>('HISTORICAL_TZ') ?? 'America/Ciudad_Juarez';
    const historyEnabled = this.configService.get<string>('HISTORICAL_API_ENABLED') === 'true';
    const thresholds: EvidenceThresholds = {
      minDates: this.configService.get<number>('HISTORICAL_MIN_DATES') ?? 6,
      minCoverage: this.configService.get<number>('HISTORICAL_MIN_COVERAGE_RATIO') ?? 0.7,
    };

    const moment = this.now();
    const slot = localSlot(moment, timezone);
    const bridges = await this.bridgesService.findActive();

    const profiles = new Map<LaneType, Map<string, DayProfileBin[]>>();
    if (historyEnabled) {
      for (const lane of INSIGHT_LANES) {
        const rows = await this.repository.findDayProfile(lane, slot.dayOfWeek, timezone);
        const byBridge = new Map<string, DayProfileBin[]>();
        for (const { bridgeId, ...bin } of rows) {
          byBridge.set(bridgeId, [...(byBridge.get(bridgeId) ?? []), bin]);
        }
        profiles.set(lane, byBridge);
      }
    }

    return {
      generatedAt: moment.toISOString(),
      timezone,
      dayOfWeek: slot.dayOfWeek,
      time: slot.time,
      historyEnabled,
      bridges: bridges.map((bridge) => ({
        bridgeId: bridge.id,
        lanes: Object.fromEntries(
          INSIGHT_LANES.map((lane) => {
            const bins = profiles.get(lane)?.get(bridge.id);
            return [
              lane,
              bins
                ? { usual: pickUsual(bins, slot.time, thresholds), bestTimes: pickBestTimes(bins, thresholds) }
                : EMPTY,
            ];
          }),
        ) as Record<LaneType, LaneInsights>,
      })),
    };
  }
}
