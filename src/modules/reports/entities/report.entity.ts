import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ReportSource, ReportStatus } from '../../../common/enums/report.enum.js';
import { LaneType } from '../../../common/enums/lane.enum.js';
import type { Bridge } from '../../bridges/entities/bridge.entity.js';

@Entity('reports')
export class Report {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Bridge', 'reports', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bridgeId' })
  bridge: Bridge;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  bridgeId: string;

  @ApiProperty({ type: Number, nullable: true, description: 'Wait the reporter observed, in minutes' })
  @Column({ type: 'int', nullable: true, default: null })
  reportedWaitMinutes: number | null;

  @ApiProperty({ enum: LaneType })
  @Column({
    type: 'enum',
    enum: LaneType,
    enumName: 'lane_type_enum',
  })
  laneType: LaneType;

  @ApiProperty({ enum: ReportSource })
  @Column({
    type: 'enum',
    enum: ReportSource,
    default: ReportSource.User,
  })
  source: ReportSource;

  @ApiProperty({ enum: ReportStatus, description: 'Moderation state; the server always creates reports as pending' })
  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.Pending,
  })
  lineStatus: ReportStatus;

  @ApiProperty({ type: String, nullable: true, maxLength: 300 })
  @Column({ type: 'varchar', length: 300, nullable: true, default: null })
  comment: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  anonymousDeviceId: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
