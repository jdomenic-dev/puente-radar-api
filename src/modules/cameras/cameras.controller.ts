import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { CamerasService } from './cameras.service.js';
import type { CamerasResponse } from './cameras.service.js';
import { CamerasResponseDto } from './dto/cameras-response.dto.js';
import { CreateCameraDto } from './dto/create-camera.dto.js';
import { UpdateCameraDto } from './dto/update-camera.dto.js';
import { BridgeCamera } from './entities/bridge-camera.entity.js';

@ApiTags('cameras')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (default 120 requests per minute per IP and endpoint)',
})
@Controller('cameras')
export class CamerasController {
  constructor(private readonly camerasService: CamerasService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Live cameras of the bridges (YouTube), grouped by bridge',
    description:
      'Public (no API key); cached for 60 seconds. Each bridge lists its active cameras with the YouTube video id, ' +
      'the name of the view, whether it is live and the credit to show. Waits are not included: join /estimates/overview ' +
      'by bridgeId. Bridges without cameras are omitted.',
  })
  @ApiOkResponse({ type: CamerasResponseDto })
  getCameras(): Promise<CamerasResponse> {
    return this.camerasService.getPublicCameras();
  }

  @Post()
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Register a camera (admin only)',
    description:
      'Send the bridge as bridgeId or bridgeSlug (exactly one) and a YouTube link or video id. ' +
      'Links with tracking parameters are accepted; only the video id is stored.',
  })
  @ApiCreatedResponse({ type: BridgeCamera })
  @ApiBadRequestResponse({ description: 'Validation failed, or both/neither of bridgeId and bridgeSlug were sent' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key header' })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  @ApiConflictResponse({ description: 'That YouTube video is already registered' })
  create(@Body() dto: CreateCameraDto): Promise<BridgeCamera> {
    return this.camerasService.create(dto);
  }

  @Patch(':id')
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Change a camera (admin only)',
    description:
      'Use it to replace the video id when a stream restarts, rename a view, reorder, hide (isActive=false) or set the status by hand.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Camera id' })
  @ApiOkResponse({ type: BridgeCamera })
  @ApiBadRequestResponse({ description: 'id is not a valid UUID, or the body failed validation' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key header' })
  @ApiNotFoundResponse({ description: 'Camera not found' })
  @ApiConflictResponse({ description: 'That YouTube video is already registered on another camera' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCameraDto): Promise<BridgeCamera> {
    return this.camerasService.update(id, dto);
  }
}
