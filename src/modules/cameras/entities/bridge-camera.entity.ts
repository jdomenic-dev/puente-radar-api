import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CameraStatus } from '../../../common/enums/camera.enum.js';
import type { Bridge } from '../../bridges/entities/bridge.entity.js';

export const DEFAULT_CAMERA_SOURCE_NAME = 'Fideicomiso de Puentes Fronterizos de Chihuahua';
export const DEFAULT_CAMERA_SOURCE_URL = 'https://www.youtube.com/@fpfch';

/** One YouTube live stream (one view) of a bridge. Stored by video id only. */
@Entity('bridge_cameras')
export class BridgeCamera {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Bridge', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bridgeId' })
  bridge: Bridge;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  bridgeId: string;

  @ApiProperty({ example: 'mp3RS0y77tY', description: 'YouTube video id (11 characters)' })
  @Column({ type: 'varchar', length: 11, unique: true })
  videoId: string;

  @ApiProperty({ example: 'Norte', description: 'Name of the view' })
  @Column({ type: 'varchar', length: 80 })
  label: string;

  @ApiProperty({ type: String, nullable: true, example: 'Mirando hacia EE. UU.' })
  @Column({ type: 'varchar', length: 160, nullable: true, default: null })
  description: string | null;

  @ApiProperty({ description: 'Position among the cameras of the bridge' })
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @ApiProperty({ description: 'False hides the camera from clients without deleting it' })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ enum: CameraStatus })
  @Column({ type: 'enum', enum: CameraStatus, enumName: 'camera_status_enum', default: CameraStatus.Unknown })
  status: CameraStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  @Column({ type: 'timestamptz', nullable: true, default: null })
  lastCheckedAt: Date | null;

  @ApiProperty({ example: DEFAULT_CAMERA_SOURCE_NAME, description: 'Owner of the stream, shown as credit' })
  @Column({ type: 'varchar', length: 120, default: DEFAULT_CAMERA_SOURCE_NAME })
  sourceName: string;

  @ApiProperty({ example: DEFAULT_CAMERA_SOURCE_URL, description: 'Channel of the owner' })
  @Column({ type: 'varchar', length: 255, default: DEFAULT_CAMERA_SOURCE_URL })
  sourceUrl: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
