import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BridgesService } from './bridges.service.js';
import { UpdateBridgeStatusDto } from './dto/update-bridge-status.dto.js';
import { Bridge } from './entities/bridge.entity.js';

@ApiTags('bridges')
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
  @ApiOkResponse({
    description: 'Array of bridge summaries',
  })
  getHomeSummary() {
    return this.bridgesService.getHomeSummary();
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get bridge by slug' })
  @ApiOkResponse({ type: Bridge })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  findBySlug(@Param('slug') slug: string): Promise<Bridge> {
    return this.bridgesService.findOneBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bridge by ID' })
  @ApiOkResponse({ type: Bridge })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  findOne(@Param('id') id: string): Promise<Bridge> {
    return this.bridgesService.findOneById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update bridge status, waitMinutes, and trend' })
  @ApiOkResponse({ type: Bridge })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateBridgeStatusDto): Promise<Bridge> {
    return this.bridgesService.updateStatus(id, dto);
  }
}
