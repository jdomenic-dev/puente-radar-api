/**
 * cbp-snapshot.repository.ts
 *
 * Custom repository provider for CbpSnapshot.
 * Implements the CbpSnapshotRepository interface defined by CbpAdapter (Slice B2).
 *
 * Key method: findLatestPerBridgeLane
 *   Uses DISTINCT ON to return the single most-recent row per (bridgeId, laneType).
 *   Plain TypeORM Repository<CbpSnapshot> has no equivalent — this MUST be a raw query
 *   or QueryBuilder with DISTINCT ON semantics (PostgreSQL-specific, matches the migration
 *   index IDX_cbp_snapshots_bridge_lane_fetched).
 *
 * Also implements findSnapshotsPerBridgeLane (latest N rows per key) for trend calculation.
 *
 * Design reference: design.md — "TTL state" decision, Slice B2 gate fix note.
 */

import { DataSource } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { CbpSnapshot } from './entities/cbp-snapshot.entity.js';
import type { CbpSnapshotRepository, SnapshotLaneRow } from './sources/cbp.adapter.js';
import { LaneType } from '../../common/enums/lane.enum.js';

/** Extended row shape returned by findPreviousSnapshotsPerBridgeLane. */
export interface SnapshotHistoryRow extends SnapshotLaneRow {
  rowNumber: number; // 1 = latest, 2 = previous, etc.
}

@Injectable()
export class CbpSnapshotCustomRepository implements CbpSnapshotRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Persist one snapshot. Delegates to the TypeORM manager.
   */
  async save(snapshot: Partial<CbpSnapshot>): Promise<unknown> {
    return this.dataSource.manager.save(CbpSnapshot, snapshot);
  }

  /**
   * Return the single most-recent snapshot per (bridgeId, laneType) combination.
   *
   * Uses DISTINCT ON which is supported by PostgreSQL and leverages the
   * IDX_cbp_snapshots_bridge_lane_fetched index.
   *
   * Returns ALL SnapshotLaneRow fields so CbpAdapter can reconstruct NormalizedLane
   * without data loss (gate fix B2-GF1 requirement).
   */
  async findLatestPerBridgeLane(bridgeIds: string[]): Promise<SnapshotLaneRow[]> {
    if (bridgeIds.length === 0) return [];

    const rows = await this.dataSource.query<SnapshotLaneRow[]>(
      `
      SELECT DISTINCT ON ("bridgeId", "laneType")
        "bridgeId",
        "laneType",
        "fetchedAt",
        "delayMinutes",
        "lanesOpen",
        "operationalStatus",
        "isOpen",
        "sourceUpdateTimeRaw"
      FROM "cbp_snapshots"
      WHERE "bridgeId" = ANY($1)
      ORDER BY "bridgeId", "laneType", "fetchedAt" DESC
      `,
      [bridgeIds],
    );

    // Normalize: fetchedAt comes from Postgres as string or Date depending on driver
    return rows.map(r => ({
      ...r,
      fetchedAt: r.fetchedAt instanceof Date ? r.fetchedAt : new Date(r.fetchedAt as unknown as string),
      laneType: r.laneType as LaneType,
    }));
  }

  /**
   * Return the two most-recent snapshots per (bridgeId, laneType) ordered by fetchedAt DESC.
   * Used by EstimatesService to compute trend (current vs previous).
   *
   * Uses ROW_NUMBER() OVER PARTITION BY so we get up to 2 rows per key.
   */
  async findLatestTwoPerBridgeLane(
    bridgeIds: string[],
    laneType: LaneType,
  ): Promise<SnapshotHistoryRow[]> {
    if (bridgeIds.length === 0) return [];

    const rows = await this.dataSource.query<Array<SnapshotLaneRow & { row_number: string }>>(
      `
      SELECT
        "bridgeId",
        "laneType",
        "fetchedAt",
        "delayMinutes",
        "lanesOpen",
        "operationalStatus",
        "isOpen",
        "sourceUpdateTimeRaw",
        ROW_NUMBER() OVER (
          PARTITION BY "bridgeId", "laneType"
          ORDER BY "fetchedAt" DESC
        ) AS "row_number"
      FROM "cbp_snapshots"
      WHERE "bridgeId" = ANY($1)
        AND "laneType" = $2
      ORDER BY "bridgeId", "laneType", "fetchedAt" DESC
      `,
      [bridgeIds, laneType],
    );

    return rows
      .filter(r => parseInt(r.row_number, 10) <= 2)
      .map(r => ({
        bridgeId: r.bridgeId,
        laneType: r.laneType as LaneType,
        fetchedAt: r.fetchedAt instanceof Date ? r.fetchedAt : new Date(r.fetchedAt as unknown as string),
        delayMinutes: r.delayMinutes,
        lanesOpen: r.lanesOpen,
        operationalStatus: r.operationalStatus,
        isOpen: r.isOpen,
        sourceUpdateTimeRaw: r.sourceUpdateTimeRaw,
        rowNumber: parseInt(r.row_number, 10),
      }));
  }
}

/** DI token used to inject CbpSnapshotCustomRepository where CbpSnapshotRepository is expected. */
export const CBP_SNAPSHOT_REPOSITORY = 'CbpSnapshotRepository';
