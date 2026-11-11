import { Column, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { BridgeStatus, WaitTrend } from '../../../common/enums/bridge.enum.js';
import type { Report } from '../../reports/entities/report.entity.js';

@Entity('bridges')
export class Bridge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({
    type: 'enum',
    enum: BridgeStatus,
    default: BridgeStatus.Low,
  })
  status: BridgeStatus;

  @Column({ type: 'int', nullable: true, default: null })
  waitMinutes: number | null;

  @Column({
    type: 'enum',
    enum: WaitTrend,
    nullable: true,
    default: null,
  })
  trend: WaitTrend | null;

  @Column({ type: 'int', nullable: true, default: null })
  cbpPortNumber: number | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Compact name for tight UI ("Santa Teresa"); the app falls back to `name` when null. */
  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  shortName: string | null;

  @Column({ type: 'double precision', nullable: true, default: null })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true, default: null })
  longitude: number | null;

  /** Local opening time as "HH:mm"; null together with closesAt means open 24 hours. */
  @Column({ type: 'varchar', length: 5, nullable: true, default: null })
  opensAt: string | null;

  /** Local closing time as "HH:mm" ("24:00" = midnight). */
  @Column({ type: 'varchar', length: 5, nullable: true, default: null })
  closesAt: string | null;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  lastUpdatedAt: Date | null;

  @OneToMany('Report', 'bridge')
  reports: Report[];
}
