/**
 * estimate-adjustment.entity.ts
 *
 * TypeORM entity for the estimate_adjustments table created by the
 * EstimatesEngine migration (Slice A).
 *
 * Column names and constraints MUST match the migration DDL exactly:
 *   id, bridgeId, laneType, adjustmentMinutes, reason (nullable),
 *   isActive (default true), createdAt, updatedAt.
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LaneType } from '../../../common/enums/lane.enum.js';

@Entity('estimate_adjustments')
export class EstimateAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to bridges.id — stored as a plain UUID column (no relation loaded). */
  @Column({ type: 'uuid' })
  bridgeId: string;

  @Column({
    type: 'enum',
    enum: LaneType,
    enumName: 'lane_type_enum',
  })
  laneType: LaneType;

  /** Minutes to add (positive) or subtract (negative) from the base estimate. */
  @Column({ type: 'int' })
  adjustmentMinutes: number;

  /** Optional human-readable reason for the adjustment. */
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  reason: string | null;

  /**
   * Only active adjustments are applied to estimates.
   * Matches migration DDL: NOT NULL DEFAULT true.
   */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
