import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'Filter by bridge UUID' })
  @IsOptional()
  @IsUUID()
  bridgeId?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results (default 20)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
