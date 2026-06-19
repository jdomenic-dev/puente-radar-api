import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ReportSource, ReportStatus } from '../../../common/enums/report.enum.js';
import type { Bridge } from '../../bridges/entities/bridge.entity.js';

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Bridge', 'reports', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bridgeId' })
  bridge: Bridge;

  @Column({ type: 'uuid' })
  bridgeId: string;

  @Column({ type: 'int' })
  reportedWaitMinutes: number;

  @Column({
    type: 'enum',
    enum: ReportSource,
    default: ReportSource.User,
  })
  source: ReportSource;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.Pending,
  })
  lineStatus: ReportStatus;

  @Column({ type: 'varchar', length: 300, nullable: true, default: null })
  comment: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  anonymousDeviceId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
