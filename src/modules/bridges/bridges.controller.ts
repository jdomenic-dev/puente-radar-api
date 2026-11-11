import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BridgesService } from './bridges.service.js';
import { BridgeHomeSummaryDto } from './dto/bridge-home-summary.dto.js';
import { UpdateBridgeStatusDto } from './dto/update-bridge-status.dto.js';
import { Bridge } from './entities/bridge.entity.js';

@ApiTags('bridges')
@ApiSecurity('api-key')
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key header' })
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (default 120 requests per minute per IP and endpoint)',
})
@Controller('bridges')
export class BridgesController {
  constructor(private readonly bridgesService: BridgesService) {}

  @Get()
  @ApiOperation({ summary: 'List all bridges ordered by sortOrder' })
  @ApiOkResponse({ type: [Bridge] })
  findAll(): Promise<Bridge[]> {
    return this.bridgesService.findAll();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Home summary: all bridges with recent report count (last 60 min)' })
  @ApiOkResponse({ type: [BridgeHomeSummaryDto], description: 'One entry per bridge, ordered by sortOrder' })
  getHomeSummary() {
    return this.bridgesService.getHomeSummary();
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get bridge by slug' })
  @ApiParam({ name: 'slug', type: String, description: 'Readable bridge identifier, e.g. puente-libre' })
  @ApiOkResponse({ type: Bridge })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  findBySlug(@Param('slug') slug: string): Promise<Bridge> {
    return this.bridgesService.findOneBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bridge by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Bridge UUID' })
  @ApiOkResponse({ type: Bridge })
  @ApiBadRequestResponse({ description: 'id is not a valid UUID' })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Bridge> {
    return this.bridgesService.findOneById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update bridge status, waitMinutes, and trend (admin only)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Bridge UUID' })
  @ApiOkResponse({ type: Bridge })
  @ApiBadRequestResponse({ description: 'id is not a valid UUID, or the body failed validation' })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBridgeStatusDto): Promise<Bridge> {
    return this.bridgesService.updateStatus(id, dto);
  }
}
