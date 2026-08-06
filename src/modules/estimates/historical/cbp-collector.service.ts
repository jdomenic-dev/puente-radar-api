/**
 * Scheduled, slot-aware CBP snapshot collector (PR4). Composes the PR3 seam —
 * fetchAndNormalize (no persist) + saveSlotSnapshot (conflict-safe) — and
 * never calls fetchAll/_persistSnapshots, so it can never double-write
 * against the request-driven /estimates path.
 *
 * Multi-instance safety: an advisory lock held on one dedicated connection
 * gates the run; the partial unique index (PR2 migration) is the durable
 * safety net for any residual race. No-op unless
 * HISTORICAL_COLLECTION_ENABLED === "true"; never throws into the scheduler.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CbpAdapter } from '../sources/cbp.adapter.js';
import { CbpSnapshotCustomRepository } from '../cbp-snapshot.repository.js';
import { BridgesService } from '../../bridges/bridges.service.js';
import { CbpCollectionRun, CbpCollectionRunStatus } from './entities/cbp-collection-run.entity.js';
import { deriveAdvisoryLockKey, floorToSlot } from './cbp-collector.helpers.js';

/** Stable across every process/instance — required for real mutual exclusion. */
const ADVISORY_LOCK_SEED = 'cbp-collect';
const DEFAULT_CADENCE_MINUTES = 15;

@Injectable()
export class CbpCollectorService {
  private readonly logger = new Logger(CbpCollectorService.name);
  private readonly lockKey = deriveAdvisoryLockKey(ADVISORY_LOCK_SEED);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly cbpAdapter: CbpAdapter,
    private readonly snapshotRepo: CbpSnapshotCustomRepository,
    private readonly bridgesService: BridgesService,
    @InjectRepository(CbpCollectionRun)
    private readonly runRepository: Repository<CbpCollectionRun>,
  ) {}

  // Matches the HISTORICAL_CADENCE_MINUTES default (15 min); @nestjs/schedule's
  // CronExpression has no EVERY_15_MINUTES member, so the raw cron string is used.
  @Cron('0 */15 * * * *')
  async collect(): Promise<void> {
    if (this.configService.get<string>('HISTORICAL_COLLECTION_ENABLED') !== 'true') {
      return;
    }
    try {
      await this._withAdvisoryLock(() => this._runOnce(new Date()));
    } catch (err) {
      // Unreachable in normal operation (_runOnce catches its own errors), but
      // guarantees the scheduler is never interrupted by an orchestration failure.
      this.logger.error(`CBP collection orchestration failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Holds the advisory lock on one dedicated connection for the run's duration. */
  private async _withAdvisoryLock(fn: () => Promise<void>): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      const lockResult = (await queryRunner.query('SELECT pg_try_advisory_lock($1) AS locked', [
        this.lockKey,
      ])) as Array<{ locked: boolean }>;
      if (!lockResult[0]?.locked) {
        this.logger.debug('CBP collection skipped — advisory lock held by another instance');
        return;
      }
      try {
        await fn();
      } finally {
        await queryRunner.query('SELECT pg_advisory_unlock($1)', [this.lockKey]);
      }
    } finally {
      await queryRunner.release();
    }
  }

  /** One collection cycle: fetch, floor slot, persist, record run health. */
  private async _runOnce(now: Date): Promise<void> {
    let bridgesCovered = 0;
    let lanesCovered = 0;
    let duplicatesSuppressed = 0;

    try {
      const bridges = await this.bridgesService.findActive();
      const portToBridgeMap = new Map<number, string>();
      for (const bridge of bridges) {
        if (bridge.cbpPortNumber !== null && bridge.cbpPortNumber !== undefined) {
          portToBridgeMap.set(bridge.cbpPortNumber, bridge.id);
        }
      }

      const cadenceMinutes = this.configService.get<number>('HISTORICAL_CADENCE_MINUTES') ?? DEFAULT_CADENCE_MINUTES;
      const slotStart = floorToSlot(now, cadenceMinutes);

      // rethrowOnFailure: true — a real upstream failure must surface as a
      // Failure run-health row, not be silently swallowed to an empty,
      // falsely-Success result (spec: cbp-historical-collection, "Failure
      // Isolation and Health"). fetchAll/getLanes never pass this option.
      const lanes = await this.cbpAdapter.fetchAndNormalize(portToBridgeMap, now, { rethrowOnFailure: true });
      lanesCovered = lanes.length;

      // Coverage is derived from bridges actually present in the response,
      // not the pre-fetch target — a partial/degraded CBP reply (fewer
      // bridges than expected) must be detectable, not indistinguishable
      // from full coverage.
      const coveredBridgeIds = new Set<string>();
      for (const lane of lanes) {
        const bridgeId = portToBridgeMap.get(lane.cbpPortNumber);
        if (!bridgeId) continue;
        coveredBridgeIds.add(bridgeId);
        const inserted = await this.snapshotRepo.saveSlotSnapshot({
          bridgeId,
          laneType: lane.laneType,
          delayMinutes: lane.delayMinutes,
          lanesOpen: lane.lanesOpen,
          operationalStatus: lane.operationalStatus,
          isOpen: lane.isOpen,
          sourceUpdateTimeRaw: lane.sourceUpdateTimeRaw,
          fetchedAt: lane.fetchedAt,
          slotStart,
        });
        if (!inserted) duplicatesSuppressed++;
      }
      bridgesCovered = coveredBridgeIds.size;

      const status = CbpCollectionRunStatus.Success;
      await this._recordRun({ runStart: now, status, bridgesCovered, lanesCovered, duplicatesSuppressed, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`CBP collection run failed: ${message}`);
      const status = CbpCollectionRunStatus.Failure;
      const error = message.slice(0, 1000);
      await this._recordRun({ runStart: now, status, bridgesCovered, lanesCovered, duplicatesSuppressed, error });
    }
  }

  private async _recordRun(fields: Omit<CbpCollectionRun, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.runRepository.save(this.runRepository.create(fields));
  }
}
