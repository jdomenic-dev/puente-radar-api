import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ReportStatus } from '../../../common/enums/report.enum.js';

export class CreateReportDto {
  @ApiProperty({ description: 'UUID of the bridge being reported', example: 'uuid-here' })
  @IsUUID()
  bridgeId: string;

  @ApiPropertyOptional({
    description: 'Reported wait time in minutes (0–300)',
    minimum: 0,
    maximum: 300,
    example: 45,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  reportedWaitMinutes?: number;

  @ApiProperty({
    description: 'Current line status at the crossing',
    enum: ReportStatus,
  })
  @IsEnum(ReportStatus)
  lineStatus: ReportStatus;

  @ApiPropertyOptional({ description: 'Optional comment (max 300 chars)', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  comment?: string;

  @ApiPropertyOptional({ description: 'Optional anonymous device identifier' })
  @IsOptional()
  @IsString()
  anonymousDeviceId?: string;
}
