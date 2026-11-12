/**
 * cameras-response.dto.ts
 *
 * Documentation-only shapes for GET /cameras. The service returns structurally identical
 * interfaces; these classes exist so Swagger can describe the response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { CameraStatus } from '../../../common/enums/camera.enum.js';

export class CameraSourceDto {
  @ApiProperty({
    example: 'Fideicomiso de Puentes Fronterizos de Chihuahua',
    description: 'Owner of the stream: show it as credit',
  })
  name!: string;
  @ApiProperty({
    example: 'https://www.youtube.com/@fpfch',
    description: 'Channel of the owner: link it from the credit',
  })
  url!: string;
}

export class PublicCameraDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    example: 'mp3RS0y77tY',
    description: 'YouTube video id. Build the embed address in the client; never extract the stream.',
  })
  videoId!: string;
  @ApiProperty({ example: 'Norte', description: 'Name of the view' }) label!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Mirando hacia EE. UU.' }) description!: string | null;
  @ApiProperty({
    enum: CameraStatus,
    description: 'Hide the camera when offline; unknown means the last check could not tell',
  })
  status!: CameraStatus;
  @ApiProperty({ type: CameraSourceDto }) source!: CameraSourceDto;
}

export class BridgeCamerasDto {
  @ApiProperty({ format: 'uuid', description: 'Same id as /estimates/overview: join waits by it' }) bridgeId!: string;
  @ApiProperty({ example: 'puente-libre' }) slug!: string;
  @ApiProperty({ example: 'Puente Libre / Córdova-Américas' }) name!: string;
  @ApiProperty({ example: 'Libre', description: 'Very short name for tabs' }) tabLabel!: string;
  @ApiProperty({ type: [PublicCameraDto], description: 'Active cameras of the bridge, in display order' })
  cameras!: PublicCameraDto[];
}

export class CamerasResponseDto {
  @ApiProperty({ format: 'date-time', description: 'When this list was computed (cached for up to 60 s)' })
  generatedAt!: string;
  @ApiProperty({
    type: [BridgeCamerasDto],
    description: 'Bridges that have at least one active camera, in catalog order',
  })
  bridges!: BridgeCamerasDto[];
}
