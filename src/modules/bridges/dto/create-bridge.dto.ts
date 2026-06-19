import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BridgeStatus, WaitTrend } from '../../../common/enums/bridge.enum.js';

export class CreateBridgeDto {
  @ApiProperty({ example: 'Puente Libre / Córdova-Américas' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'puente-libre' })
  @IsString()
  slug: string;

  @ApiPropertyOptional({ enum: BridgeStatus, default: BridgeStatus.Low })
  @IsOptional()
  @IsEnum(BridgeStatus)
  status?: BridgeStatus;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  waitMinutes?: number;

  @ApiPropertyOptional({ enum: WaitTrend })
  @IsOptional()
  @IsEnum(WaitTrend)
  trend?: WaitTrend;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
