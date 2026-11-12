/**
 * insights-response.dto.ts
 *
 * Documentation-only shapes for GET /estimates/insights. The service returns structurally
 * identical interfaces; these classes exist so Swagger can describe the response.
 */

import { ApiProperty } from '@nestjs/swagger';

export class UsualWaitDto {
  @ApiProperty({ example: 18, description: 'Usual wait in minutes for this weekday and half hour (median)' })
  medianMinutes!: number;
  @ApiProperty({ example: 8, description: 'Distinct dates the figure is based on' }) comparableDates!: number;
}

export class TimeWindowDto {
  @ApiProperty({ example: 10, description: 'Local start hour (0-23)' }) startHour!: number;
  @ApiProperty({ example: 13, description: 'Local end hour, exclusive' }) endHour!: number;
  @ApiProperty({ example: 14, description: 'Typical wait in minutes inside the window' }) typicalMinutes!: number;
}

export class BestTimesDto {
  @ApiProperty({ type: TimeWindowDto, description: 'Three-hour window with the shortest typical waits' })
  freest!: TimeWindowDto;
  @ApiProperty({ type: TimeWindowDto, description: 'Three-hour window with the longest typical waits' })
  peak!: TimeWindowDto;
}

export class LaneInsightsDto {
  @ApiProperty({ type: UsualWaitDto, nullable: true, description: 'Null until there is enough history' })
  usual!: UsualWaitDto | null;
  @ApiProperty({
    type: BestTimesDto,
    nullable: true,
    description: 'Null until there is enough history, or when the day is flat',
  })
  bestTimes!: BestTimesDto | null;
}

export class LanesInsightsDto {
  @ApiProperty({ type: LaneInsightsDto }) general!: LaneInsightsDto;
  @ApiProperty({ type: LaneInsightsDto }) ready_lane!: LaneInsightsDto;
  @ApiProperty({ type: LaneInsightsDto }) sentri!: LaneInsightsDto;
  @ApiProperty({ type: LaneInsightsDto }) pedestrian!: LaneInsightsDto;
}

export class BridgeInsightsDto {
  @ApiProperty({ format: 'uuid' }) bridgeId!: string;
  @ApiProperty({ type: LanesInsightsDto }) lanes!: LanesInsightsDto;
}

export class InsightsResponseDto {
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
  @ApiProperty({ example: 'America/Ciudad_Juarez' }) timezone!: string;
  @ApiProperty({ example: 3, description: 'Local weekday used (0 = Sunday)' }) dayOfWeek!: number;
  @ApiProperty({ example: '10:00', description: 'Local half hour used for the usual wait' }) time!: string;
  @ApiProperty({ description: 'False while the historical API is switched off; every figure is then null' })
  historyEnabled!: boolean;
  @ApiProperty({ type: [BridgeInsightsDto] }) bridges!: BridgeInsightsDto[];
}
