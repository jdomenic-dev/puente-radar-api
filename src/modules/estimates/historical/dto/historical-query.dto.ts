import { Type } from 'class-transformer';
import { IsEnum, IsInt, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LaneType } from '../../../../common/enums/lane.enum.js';

export class HistoricalQueryDto {
  @ApiProperty({ enum: LaneType }) @IsEnum(LaneType) laneType: LaneType;
  @ApiProperty({ minimum: 0, maximum: 6 }) @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @ApiProperty({ example: '06:00' }) @Matches(/^([01]\d|2[0-3]):(?:00|30)$/) time: string;
}
