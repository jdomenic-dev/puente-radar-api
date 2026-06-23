/**
 * cbp-snapshot.entity.ts
 *
 * TypeORM entity for the cbp_snapshots table created by the
 * EstimatesEngine migration (Slice A).
 *
 * Column names MUST match the migration exactly:
 *   id, bridgeId, laneType, delayMinutes, lanesOpen,
 *   operationalStatus, isOpen, sourceUpdateTimeRaw,
 *   fetchedAt, createdAt, updatedAt.
 *
 * This entity is NOT registered in a module yet — that happens in Slice C
 * (EstimatesModule forFeature). It is used here only for typed repository
 * injection into CbpAdapter.
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LaneType } from '../../../common/enums/lane.enum.js';

@Entity('cbp_snapshots')
export class CbpSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to bridges.id — stored as a plain UUID column (no relation loaded here). */
  @Column({ type: 'uuid' })
  bridgeId: string;

  @Column({
    type: 'enum',
    enum: LaneType,
    enumName: 'lane_type_enum',
  })
  laneType: LaneType;

  /** Null when source did not provide a numeric delay value. */
  @Column({ type: 'int', nullable: true, default: null })
  delayMinutes: number | null;

  /** Null when source did not report a lanes_open count. */
  @Column({ type: 'int', nullable: true, default: null })
  lanesOpen: number | null;

  /** Raw operational_status string from CBP (e.g. "delay", "Lanes Closed"). */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  operationalStatus: string | null;

  @Column({ type: 'boolean', default: true })
  isOpen: boolean;

  /** Raw update_time string from CBP — kept verbatim, NOT parsed. */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  sourceUpdateTimeRaw: string | null;

  /**
   * Timestamp when the CBP API was called — primary TTL reference.
   * Default matches migration DDL: `DEFAULT now()`.
   * The adapter always sets this explicitly via the injected `now` param,
   * but the DB default ensures rows inserted outside the adapter (e.g. manual
   * backfill) also get a sensible value.
   */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  fetchedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
