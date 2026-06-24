/**
 * estimates.service.ts
 *
 * Orchestration layer for GET /estimates.
 *
 * Algorithm (one CBP fetch cycle per request):
 *   1. Load active bridges from BridgesService.
 *   2. Build portToBridgeMap from bridges with a cbpPortNumber.
 *   3. ONE call to cbpAdapter.getLanes (TTL/stale aware) → lanes + sourceStale.
 *   4. Load cbp snapshot history for trend (latest 2 per bridge+lane).
 *   5. Load active EstimateAdjustments for the selected laneType.
 *   6. For each bridge × laneType:
 *        - Find official lane (by cbpPortNumber + laneType).
 *        - Get community via ReportsService.findUsableReports → weightedMean + sampleSize.
 *        - Find active adjustment for this bridge+lane (isActive=true).
 *        - Compute cbpStale from snapshot freshness vs TTL.
 *        - Compute trend from snapshot history (current vs previous delayMinutes).
 *        - Call EstimateCalculator (pure).
 *   7. Select bestOption: lowest estimatedWaitMinutes among NOT-low-confidence available
 *      lanes; fall back to lowest available regardless of confidence if none qualify.
 *   8. Return array of EstimateResponseEntry.
 *
 * Design reference: design.md rev2 — Data Flow, Best option, Trend.
 */

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BridgesService } from '../bridges/bridges.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { CbpRedisCache } from './sources/cbp-redis-cache.js';
import { CBP_CACHE } from './estimates.tokens.js';
import { CbpSnapshotCustomRepository, CBP_SNAPSHOT_REPOSITORY } from './cbp-snapshot.repository.js';
import { EstimateAdjustment } from './entities/estimate-adjustment.entity.js';
import { EstimateCalculator } from './estimate.calculator.js';
import { LaneType } from '../../common/enums/lane.enum.js';
import type { NormalizedLane } from './sources/wait-time-source.adapter.js';
import type { SnapshotLaneRow } from './sources/cbp.adapter.js';

// ---------------------------------------------------------------------------
// Response entry shape (per design "Interfaces / Contracts")
// ---------------------------------------------------------------------------

export type EstimateTrend = 'up' | 'down' | 'stable';

export interface EstimateResponseEntry {
  bridgeId: string;
  bridgeName: string;
  laneType: LaneType;
  estimatedWaitMinutes?: number;
  estimateUnavailable?: 'laneClosed' | 'noData';
  status: string;
  confidence: 'low' | 'medium' | 'high';
  confidenceScore: number;
  trend: EstimateTrend;
  sourcesUsed: string[];
  sourceStale?: boolean;
  lastUpdatedAt: string | null;
  fetchedAt: string | null;
  laneAvailable: boolean;
  isBestOption: boolean;
  bestOptionFallback: boolean;
}

// ---------------------------------------------------------------------------
// EstimatesService
// ---------------------------------------------------------------------------

@Injectable()
export class EstimatesService {
  constructor(
    private readonly bridgesService: BridgesService,
    private readonly reportsService: ReportsService,
    @Inject(CBP_CACHE)
    private readonly cbpCache: CbpRedisCache,
    @Inject(CBP_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: CbpSnapshotCustomRepository,
    @InjectRepository(EstimateAdjustment)
    private readonly adjustmentRepository: Repository<EstimateAdjustment>,
    private readonly calculator: EstimateCalculator,
    private readonly configService: ConfigService,
  ) {}

  async getEstimates(laneType: LaneType): Promise<EstimateResponseEntry[]> {
    const now = new Date();

    // ── 1. Load active bridges ───────────────────────────────────────────────
    const bridges = await this.bridgesService.findActive();

    // ── 2. Build portToBridgeMap (only bridges with a cbpPortNumber) ─────────
    const portToBridgeMap = new Map<number, string>();
    for (const bridge of bridges) {
      if (bridge.cbpPortNumber !== null && bridge.cbpPortNumber !== undefined) {
        portToBridgeMap.set(bridge.cbpPortNumber, bridge.id);
      }
    }

    // ── 3. ONE CBP fetch cycle (Redis-first, falls back to PG TTL) ───────────
    const { lanes, sourceStale } = await this.cbpCache.getLanes(portToBridgeMap, now);

    // Index lanes by bridgeId+laneType for O(1) lookup
    const bridgeToPort = new Map<string, number>();
    for (const [port, id] of portToBridgeMap) {
      bridgeToPort.set(id, port);
    }

    const laneIndex = new Map<string, NormalizedLane>();
    for (const lane of lanes) {
      const bridgeId = portToBridgeMap.get(lane.cbpPortNumber);
      if (bridgeId) {
        laneIndex.set(`${bridgeId}:${lane.laneType}`, lane);
      }
    }

    // ── 4. Load snapshot history for trend (latest 2 per bridge+lane) ────────
    const bridgeIds = bridges.map(b => b.id);
    const ttlMinutes = this.configService.get<number>('CBP_TTL_MINUTES') ?? 15;

    // Load ALL snapshots (latest 1 per bridge+lane for freshness; used for cbpStale)
    const latestSnapshots = await this.snapshotRepo.findLatestPerBridgeLane(bridgeIds);
    const latestSnapshotIndex = new Map<string, SnapshotLaneRow>();
    for (const snap of latestSnapshots) {
      latestSnapshotIndex.set(`${snap.bridgeId}:${snap.laneType}`, snap);
    }

    // Load latest 2 per bridge+lane for trend — use the custom method
    const snapshotHistory = await this.snapshotRepo.findLatestTwoPerBridgeLane(bridgeIds, laneType);
    // Index: bridgeId → { current (rowNumber=1), previous (rowNumber=2) }
    const historyIndex = new Map<string, { current?: SnapshotLaneRow; previous?: SnapshotLaneRow }>();
    for (const snap of snapshotHistory) {
      const entry = historyIndex.get(snap.bridgeId) ?? {};
      if (snap.rowNumber === 1) entry.current = snap;
      else if (snap.rowNumber === 2) entry.previous = snap;
      historyIndex.set(snap.bridgeId, entry);
    }

    // ── 5. Load all active adjustments for the selected laneType ─────────────
    const adjustments = await this.adjustmentRepository.find({
      where: { laneType, isActive: true },
    });
    const adjustmentIndex = new Map<string, number>(); // bridgeId → adjustmentMinutes
    for (const adj of adjustments) {
      adjustmentIndex.set(adj.bridgeId, adj.adjustmentMinutes);
    }

    // ── 6. Compute entry per bridge × laneType ────────────────────────────────
    const entries: EstimateResponseEntry[] = [];

    for (const bridge of bridges) {
      const officialLane = laneIndex.get(`${bridge.id}:${laneType}`);
      const latestSnap = latestSnapshotIndex.get(`${bridge.id}:${laneType}`);

      // Determine cbpStale: true if the latest snapshot is older than TTL,
      // OR if there is no snapshot at all for this bridge+lane.
      // A bridge without cbpPortNumber has no official source → cbpStale=false
      // (no CBP data expected so no staleness).
      let cbpStale = false;
      if (bridge.cbpPortNumber !== null && bridge.cbpPortNumber !== undefined) {
        if (!latestSnap) {
          cbpStale = true; // no snapshot at all → treated as stale
        } else {
          const ageMs = now.getTime() - latestSnap.fetchedAt.getTime();
          cbpStale = ageMs > ttlMinutes * 60_000;
        }
      }

      // Community data from ReportsService
      const community = await this.reportsService.findUsableReports(bridge.id, laneType);

      // Active adjustment (null if none)
      const adminAdjustmentMinutes = adjustmentIndex.get(bridge.id) ?? null;

      // Build calculator input
      let officialInput: { wait: number; fresh: boolean; closed: boolean } | undefined;
      if (officialLane) {
        if (!officialLane.isOpen) {
          officialInput = { wait: 0, fresh: !cbpStale, closed: true };
        } else if (officialLane.delayMinutes !== null) {
          officialInput = { wait: officialLane.delayMinutes, fresh: !cbpStale, closed: false };
        }
        // If isOpen=true but delayMinutes=null → no official data
      }

      const communityInput =
        community.sampleSize > 0 && community.weightedMean !== null
          ? { value: community.weightedMean, sampleSize: community.sampleSize }
          : undefined;

      // Run the pure calculator
      const calcResult = this.calculator.calculate({
        official: officialInput,
        community: communityInput,
        adminAdjustmentMinutes,
        cbpStale,
        sourceStale,
      });

      // Trend: compare current estimate vs previous persisted snapshot delayMinutes
      const trend = this._computeTrend(
        calcResult.estimatedWaitMinutes,
        historyIndex.get(bridge.id)?.previous,
      );

      // Timestamps
      const fetchedAt =
        officialLane?.fetchedAt?.toISOString() ??
        latestSnap?.fetchedAt?.toISOString() ??
        null;

      const lastUpdatedAt = bridge.lastUpdatedAt?.toISOString() ?? null;

      entries.push({
        bridgeId: bridge.id,
        bridgeName: bridge.name,
        laneType,
        estimatedWaitMinutes: calcResult.estimatedWaitMinutes,
        estimateUnavailable: calcResult.estimateUnavailable,
        status: calcResult.status,
        confidence: calcResult.confidence,
        confidenceScore: calcResult.confidenceScore,
        trend,
        sourcesUsed: calcResult.sourcesUsed,
        sourceStale: sourceStale ? true : undefined,
        lastUpdatedAt,
        fetchedAt,
        laneAvailable: calcResult.estimateUnavailable === undefined,
        isBestOption: false, // set in step 7
        bestOptionFallback: false,
      });
    }

    // ── 7. Select bestOption ──────────────────────────────────────────────────
    this._assignBestOption(entries);

    return entries;
  }

  // -------------------------------------------------------------------------
  // Private: trend computation
  // -------------------------------------------------------------------------

  private _computeTrend(
    currentEstimate: number | undefined,
    previousSnapshot: SnapshotLaneRow | undefined,
  ): EstimateTrend {
    // No current estimate → stable (unavailable lane)
    if (currentEstimate === undefined) return 'stable';
    // No previous snapshot → stable (first ever data point)
    if (!previousSnapshot || previousSnapshot.delayMinutes === null) return 'stable';

    const delta = currentEstimate - previousSnapshot.delayMinutes;
    if (delta > 5) return 'up';
    if (delta < -5) return 'down';
    return 'stable';
  }

  // -------------------------------------------------------------------------
  // Private: best option selection
  // -------------------------------------------------------------------------

  private _assignBestOption(entries: EstimateResponseEntry[]): void {
    // Only available lanes (estimateUnavailable not set) are candidates
    const available = entries.filter(e => e.laneAvailable && e.estimatedWaitMinutes !== undefined);
    if (available.length === 0) return;

    // Prefer NOT low-confidence: lowest estimatedWaitMinutes among them
    const nonLowConfidence = available.filter(e => e.confidence !== 'low');
    if (nonLowConfidence.length > 0) {
      const best = nonLowConfidence.reduce((a, b) =>
        (a.estimatedWaitMinutes! < b.estimatedWaitMinutes!) ? a : b,
      );
      best.isBestOption = true;
      best.bestOptionFallback = false;
      return;
    }

    // Fallback: ALL available are low-confidence → pick lowest anyway
    const best = available.reduce((a, b) =>
      (a.estimatedWaitMinutes! < b.estimatedWaitMinutes!) ? a : b,
    );
    best.isBestOption = true;
    best.bestOptionFallback = true;
  }
}
