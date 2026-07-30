/**
 * TypeORM entity for cbp_collection_runs (created by the HistoricalCollection migration).
 * Column names MUST match the migration: id, runStart, status, bridgesCovered, lanesCovered,
 * duplicatesSuppressed, error, createdAt, updatedAt.
 * Not registered in a module yet — no code writes to this table in this change. A later PR's
 * scheduled collector injects it to record per-run health (success/failure, coverage, dedup).
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum CbpCollectionRunStatus {
  Success = 'success',
  Failure = 'failure',
}

@Entity('cbp_collection_runs')
export class CbpCollectionRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamptz' })
  runStart: Date;

  @Column({ type: 'enum', enum: CbpCollectionRunStatus, enumName: 'cbp_collection_run_status_enum' })
  status: CbpCollectionRunStatus;

  @Column({ type: 'int', default: 0 })
  bridgesCovered: number;

  @Column({ type: 'int', default: 0 })
  lanesCovered: number;

  /** Slot writes suppressed by the partial unique index (ON CONFLICT DO NOTHING). */
  @Column({ type: 'int', default: 0 })
  duplicatesSuppressed: number;

  @Column({ type: 'varchar', length: 1000, nullable: true, default: null })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
