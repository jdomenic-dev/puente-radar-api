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
   * Persist one COLLECTOR-OWNED snapshot with a non-null, cadence-floored slotStart.
   *
   * Conflict-safe: ON CONFLICT DO NOTHING (no target needed — applies to any unique
   * constraint violation, including the partial index UQ_cbp_snapshots_bridge_lane_slot
   * on (bridgeId, laneType, slotStart) WHERE slotStart IS NOT NULL). A second call for
   * the same (bridgeId, laneType, slotStart) is suppressed, never throws.
   *
   * Distinct from `save()`: request-driven rows from CbpAdapter.getLanes/_persistSnapshots
   * always write slotStart = NULL and are untouched by this method or its unique index.
   *
   * @returns true if a new row was inserted, false if suppressed by the conflict.
   */
  async saveSlotSnapshot(row: SnapshotLaneRow & { slotStart: Date }): Promise<boolean> {
    const inserted = await this.dataSource.query<Array<{ id: string }>>(
      `
      INSERT INTO "cbp_snapshots"
        ("bridgeId", "laneType", "delayMinutes", "lanesOpen", "operationalStatus", "isOpen", "sourceUpdateTimeRaw", "fetchedAt", "slotStart")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT DO NOTHING
      RETURNING "id"
      `,
      [
        row.bridgeId,
        row.laneType,
        row.delayMinutes,
        row.lanesOpen,
        row.operationalStatus,
        row.isOpen,
        row.sourceUpdateTimeRaw,
        row.fetchedAt,
        row.slotStart,
      ],
    );

    return inserted.length > 0;
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
    return rows.map((r) => ({
      ...r,
      fetchedAt: r.fetchedAt instanceof Date ? r.fetchedAt : new Date(r.fetchedAt as unknown as string),
      laneType: r.laneType,
    }));
  }

  /**
   * Return the two most-recent snapshots per (bridgeId, laneType) ordered by fetchedAt DESC.
   * Used by EstimatesService to compute trend (current vs previous).
   *
   * Uses ROW_NUMBER() OVER PARTITION BY so we get up to 2 rows per key.
   */
  async findLatestTwoPerBridgeLane(bridgeIds: string[], laneType: LaneType): Promise<SnapshotHistoryRow[]> {
    if (bridgeIds.length === 0) return [];

    // Filter rn <= 2 inside a subquery so Postgres discards extra rows early,
    // rather than fetching all rows and filtering in JS.
    const rows = await this.dataSource.query<Array<SnapshotLaneRow & { rn: string }>>(
      `
      SELECT "bridgeId", "laneType", "fetchedAt", "delayMinutes", "lanesOpen",
             "operationalStatus", "isOpen", "sourceUpdateTimeRaw", rn
      FROM (
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
          ) AS rn
        FROM "cbp_snapshots"
        WHERE "bridgeId" = ANY($1)
          AND "laneType" = $2
      ) ranked
      WHERE rn <= 2
      ORDER BY "bridgeId", rn
      `,
      [bridgeIds, laneType],
    );

    return rows.map((r) => ({
      bridgeId: r.bridgeId,
      laneType: r.laneType,
      fetchedAt: r.fetchedAt instanceof Date ? r.fetchedAt : new Date(r.fetchedAt as unknown as string),
      delayMinutes: r.delayMinutes,
      lanesOpen: r.lanesOpen,
      operationalStatus: r.operationalStatus,
      isOpen: r.isOpen,
      sourceUpdateTimeRaw: r.sourceUpdateTimeRaw,
      rowNumber: parseInt(r.rn, 10),
    }));
  }
}

/** DI token used to inject CbpSnapshotCustomRepository where CbpSnapshotRepository is expected. */
export const CBP_SNAPSHOT_REPOSITORY = 'CbpSnapshotRepository';
