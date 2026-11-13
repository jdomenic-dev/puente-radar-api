import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { parseYouTubeVideoId } from '../youtube-video-id.js';

/** Far more than any bridge will ever have; keeps the value inside the integer column. */
export const MAX_SORT_ORDER = 1000;

export class CreateCameraDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Bridge id. Send this or bridgeSlug, not both.' })
  @IsOptional()
  @IsUUID()
  bridgeId?: string;

  @ApiPropertyOptional({ example: 'puente-libre', description: 'Bridge slug. Send this or bridgeId, not both.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bridgeSlug?: string;

  @ApiProperty({
    example: 'https://www.youtube.com/watch?v=mp3RS0y77tY',
    description: 'A YouTube link (watch, embed, live, shorts, youtu.be) or the bare 11-character video id',
  })
  @Transform(({ value }) => parseYouTubeVideoId(value))
  @Matches(/^[A-Za-z0-9_-]{11}$/, { message: 'videoId must be a YouTube video id or a link to one' })
  videoId: string;

  @ApiProperty({ example: 'Norte', description: 'Name of the view' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional({ example: 'Mirando hacia EE. UU.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(160)
  description?: string;

  @ApiPropertyOptional({ description: 'Position among the cameras of the bridge (defaults to last)', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;
}
