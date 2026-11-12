import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { BridgeStatus, WaitTrend } from '../../../common/enums/bridge.enum.js';
import type { Report } from '../../reports/entities/report.entity.js';

@Entity('bridges')
export class Bridge {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Puente Internacional Libre' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ example: 'puente-libre', description: 'Readable unique identifier' })
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @ApiProperty({ enum: BridgeStatus, description: 'low <= 30 min, medium <= 60, high <= 120, saturated above' })
  @Column({
    type: 'enum',
    enum: BridgeStatus,
    default: BridgeStatus.Low,
  })
  status: BridgeStatus;

  @ApiProperty({ type: Number, nullable: true, description: 'Wait in minutes as last set on the bridge' })
  @Column({ type: 'int', nullable: true, default: null })
  waitMinutes: number | null;

  @ApiProperty({ enum: WaitTrend, nullable: true })
  @Column({
    type: 'enum',
    enum: WaitTrend,
    nullable: true,
    default: null,
  })
  trend: WaitTrend | null;

  @ApiProperty({ type: Number, nullable: true, description: 'CBP port id used to match official wait data' })
  @Column({ type: 'int', nullable: true, default: null })
  cbpPortNumber: number | null;

  @ApiProperty({ description: 'Position in the bridge list' })
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Compact name for tight UI ("Santa Teresa"); the app falls back to `name` when null. */
  @ApiProperty({ type: String, nullable: true, example: 'Puente Libre', description: 'Short name for the UI' })
  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  shortName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Libre', description: 'Very short name for tabs and chips (falls back to shortName)' })
  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  tabLabel: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 31.76521 })
  @Column({ type: 'double precision', nullable: true, default: null })
  latitude: number | null;

  @ApiProperty({ type: Number, nullable: true, example: -106.45159 })
  @Column({ type: 'double precision', nullable: true, default: null })
  longitude: number | null;

  /** Local opening time as "HH:mm"; null together with closesAt means open 24 hours. */
  @ApiProperty({
    type: String,
    nullable: true,
    example: '06:00',
    description: 'Local opening time HH:mm. Null with closesAt null means open 24 hours',
  })
  @Column({ type: 'varchar', length: 5, nullable: true, default: null })
  opensAt: string | null;

  /** Local closing time as "HH:mm" ("24:00" = midnight). */
  @ApiProperty({
    type: String,
    nullable: true,
    example: '22:00',
    description: 'Local closing time HH:mm; 24:00 means midnight',
  })
  @Column({ type: 'varchar', length: 5, nullable: true, default: null })
  closesAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  lastUpdatedAt: Date | null;

  @OneToMany('Report', 'bridge')
  reports: Report[];
}
