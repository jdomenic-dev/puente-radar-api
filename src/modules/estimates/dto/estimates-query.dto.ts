/**
 * estimates-query.dto.ts
 *
 * Query parameters for GET /estimates.
 * laneType is optional; defaults to 'general' when omitted.
 */

import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LaneType } from '../../../common/enums/lane.enum.js';

export class EstimatesQueryDto {
  @ApiPropertyOptional({
    enum: LaneType,
    description: 'Lane type to query. Defaults to general.',
    default: LaneType.General,
  })
  @IsEnum(LaneType)
  @IsOptional()
  laneType: LaneType = LaneType.General;
}
