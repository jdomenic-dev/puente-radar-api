/**
 * estimates-response.dto.ts
 *
 * Documentation-only shapes for the estimates endpoints. The services keep returning their own
 * structurally identical interfaces; these classes exist so Swagger can describe the responses.
 */

import { ApiProperty } from '@nestjs/swagger';
import { BridgeStatus, WaitTrend } from '../../../common/enums/bridge.enum.js';
import { LaneType } from '../../../common/enums/lane.enum.js';

const UNAVAILABLE_REASONS = ['laneClosed', 'noData'] as const;
const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;

/** One lane of one bridge in GET /estimates (legacy shape, trend uses up/stable/down). */
export class EstimateEntryDto {
  @ApiProperty({ format: 'uuid' }) bridgeId!: string;
  @ApiProperty({ example: 'Puente Libre' }) bridgeName!: string;
  @ApiProperty({ enum: LaneType }) laneType!: LaneType;
  @ApiProperty({ nullable: true, type: Number, description: 'Lanes open now, null when CBP does not report it' })
  lanesOpen!: number | null;
  @ApiProperty({ required: false, type: Number, description: 'Estimated wait in minutes; absent when unavailable' })
  estimatedWaitMinutes?: number;
  @ApiProperty({ required: false, enum: UNAVAILABLE_REASONS, description: 'Why there is no estimate' })
  estimateUnavailable?: (typeof UNAVAILABLE_REASONS)[number];
  @ApiProperty({ example: 'low', description: 'low <= 30 min, medium <= 60, high <= 120, saturated above' })
  status!: string;
  @ApiProperty({ enum: CONFIDENCE_LEVELS }) confidence!: (typeof CONFIDENCE_LEVELS)[number];
  @ApiProperty({ example: 0.8, description: 'Confidence as a 0-1 score' }) confidenceScore!: number;
  @ApiProperty({
    enum: ['up', 'stable', 'down'],
    description: 'Legacy vocabulary; /estimates/overview uses rising/steady/falling',
  })
  trend!: 'up' | 'stable' | 'down';
  @ApiProperty({ type: [String], example: ['cbp'] }) sourcesUsed!: string[];
  @ApiProperty({ required: false, description: 'True when the CBP data used is older than its freshness window' })
  sourceStale?: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastUpdatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) fetchedAt!: string | null;
  @ApiProperty() laneAvailable!: boolean;
  @ApiProperty({ description: 'True for the lane with the shortest wait' }) isBestOption!: boolean;
  @ApiProperty() bestOptionFallback!: boolean;
}

export class ScheduleDto {
  @ApiProperty({ description: 'True when the bridge has no opening hours (open all day)' }) is24h!: boolean;
  @ApiProperty({ example: '6:00 – 22:00', description: 'Spanish label for the app, e.g. "Abierto 24 horas"' })
  label!: string;
}

export class LaneOverviewDto {
  @ApiProperty({ nullable: true, type: Number, description: 'Estimated wait in minutes' })
  estimatedWaitMinutes!: number | null;
  @ApiProperty({
    nullable: true,
    enum: BridgeStatus,
    description: 'low <= 30 min, medium <= 60, high <= 120, saturated above',
  })
  status!: BridgeStatus | null;
  @ApiProperty({ nullable: true, enum: WaitTrend }) trend!: WaitTrend | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Lanes open now. CBP publishes no per-lane-type total' })
  lanesOpen!: number | null;
  @ApiProperty({ description: 'False when the lane is closed or there is no data' }) available!: boolean;
  @ApiProperty({ nullable: true, enum: UNAVAILABLE_REASONS }) unavailableReason!:
    (typeof UNAVAILABLE_REASONS)[number] | null;
  @ApiProperty({ enum: CONFIDENCE_LEVELS }) confidence!: (typeof CONFIDENCE_LEVELS)[number];
  @ApiProperty({ description: 'True for the lane with the shortest wait at this bridge' }) isBestOption!: boolean;
  @ApiProperty({ description: 'True when the CBP data used is older than its freshness window' }) sourceStale!: boolean;
}

export class LanesOverviewDto {
  @ApiProperty({ type: LaneOverviewDto }) general!: LaneOverviewDto;
  @ApiProperty({ type: LaneOverviewDto }) ready_lane!: LaneOverviewDto;
  @ApiProperty({ type: LaneOverviewDto }) sentri!: LaneOverviewDto;
  @ApiProperty({ type: LaneOverviewDto }) pedestrian!: LaneOverviewDto;
}

export class BridgeOverviewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'puente-libre' }) slug!: string;
  @ApiProperty({ example: 'Puente Internacional Libre' }) name!: string;
  @ApiProperty({ example: 'Puente Libre', description: 'Short name for the UI; falls back to name' })
  shortName!: string;
  @ApiProperty({ enum: ['MX_TO_US'] }) direction!: 'MX_TO_US';
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'False only when every lane is closed' }) isOpen!: boolean;
  @ApiProperty({ type: ScheduleDto }) schedule!: ScheduleDto;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastUpdatedAt!: string | null;
  @ApiProperty({ description: 'Reports received in the last 60 minutes' }) recentReportCount!: number;
  @ApiProperty({ type: LanesOverviewDto }) lanes!: LanesOverviewDto;
}

export class OverviewResponseDto {
  @ApiProperty({ format: 'date-time', description: 'When this overview was computed (cached for up to 30 s)' })
  generatedAt!: string;
  @ApiProperty({ type: [BridgeOverviewDto], description: 'Active bridges in catalog order' })
  bridges!: BridgeOverviewDto[];
}
