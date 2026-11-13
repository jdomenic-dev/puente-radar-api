import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CameraStatus } from '../../../common/enums/camera.enum.js';
import { MAX_SORT_ORDER } from './create-camera.dto.js';
import { parseYouTubeVideoId } from '../youtube-video-id.js';

/** Every field is optional: only the ones sent are changed. */
export class UpdateCameraDto {
  @ApiPropertyOptional({ description: 'New YouTube link or video id (use it when the stream id changes)' })
  @IsOptional()
  @Transform(({ value }) => parseYouTubeVideoId(value))
  @Matches(/^[A-Za-z0-9_-]{11}$/, { message: 'videoId must be a YouTube video id or a link to one' })
  videoId?: string;

  @ApiPropertyOptional({ example: 'Norte' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({ example: 'Mirando hacia EE. UU.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(160)
  description?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'false hides the camera from clients' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: CameraStatus, description: 'Set by hand until the automatic check exists' })
  @IsOptional()
  @IsEnum(CameraStatus)
  status?: CameraStatus;
}
