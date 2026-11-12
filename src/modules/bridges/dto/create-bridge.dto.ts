import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BridgeStatus, WaitTrend } from '../../../common/enums/bridge.enum.js';
import { CLOSING_TIME_PATTERN, OPENING_TIME_PATTERN } from '../bridge-schedule.js';

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

  @ApiPropertyOptional({ description: 'CBP port number for official data mapping', example: 240201 })
  @IsOptional()
  @IsInt()
  cbpPortNumber?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Compact name for tight UI', example: 'Santa Teresa' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Very short name for tabs and chips', example: 'Libre' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  tabLabel?: string;

  @ApiPropertyOptional({ description: 'Latitude of the crossing, for directions', example: 31.78287 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude of the crossing, for directions', example: -106.67976 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Local opening time "HH:mm"; omit with closesAt for 24 hours', example: '06:00' })
  @IsOptional()
  @Matches(OPENING_TIME_PATTERN, { message: 'opensAt must be a time as HH:mm' })
  opensAt?: string;

  @ApiPropertyOptional({ description: 'Local closing time "HH:mm" ("24:00" = midnight)', example: '22:00' })
  @IsOptional()
  @Matches(CLOSING_TIME_PATTERN, { message: 'closesAt must be a time as HH:mm' })
  closesAt?: string;
}
