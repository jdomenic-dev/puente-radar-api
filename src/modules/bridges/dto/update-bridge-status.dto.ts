import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BridgeStatus, WaitTrend } from '../../../common/enums/bridge.enum.js';

export class UpdateBridgeStatusDto {
  @ApiPropertyOptional({ enum: BridgeStatus })
  @IsOptional()
  @IsEnum(BridgeStatus)
  status?: BridgeStatus;

  @ApiPropertyOptional({ example: 45, minimum: 0, maximum: 300 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  waitMinutes?: number;

  @ApiPropertyOptional({ enum: WaitTrend })
  @IsOptional()
  @IsEnum(WaitTrend)
  trend?: WaitTrend;
}
