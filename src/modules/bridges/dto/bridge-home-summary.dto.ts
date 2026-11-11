/**
 * bridge-home-summary.dto.ts
 *
 * Documentation-only shape of one entry in the bridge home summary
 * (GET /bridges/summary and GET /reports/summary/home).
 */

import { ApiProperty } from '@nestjs/swagger';
import { BridgeStatus, WaitTrend } from '../../../common/enums/bridge.enum.js';

export class BridgeHomeSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Puente Internacional Libre' }) name!: string;
  @ApiProperty({ example: 'puente-libre' }) slug!: string;
  @ApiProperty({ enum: BridgeStatus }) status!: BridgeStatus;
  @ApiProperty({ nullable: true, type: Number, description: 'Wait in minutes as last set on the bridge' })
  waitMinutes!: number | null;
  @ApiProperty({ nullable: true, enum: WaitTrend }) trend!: WaitTrend | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastUpdatedAt!: string | null;
  @ApiProperty({ description: 'Reports received in the last 60 minutes' }) recentReportCount!: number;
}
