/**
 * estimates.controller.ts
 *
 * GET /estimates — Returns lane-specific wait estimates for all active bridges.
 * laneType query param defaults to 'general' when omitted.
 *
 * Design reference: design.md — "File Changes", "Interfaces / Contracts".
 */

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { EstimatesService } from './estimates.service.js';
import { EstimatesQueryDto } from './dto/estimates-query.dto.js';

@ApiTags('estimates')
@ApiSecurity('api-key')
@Controller('estimates')
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get lane-specific wait estimates for all active bridges',
    description:
      'Returns one response entry per active bridge for the requested lane type. ' +
      'laneType defaults to general when omitted. ' +
      'A single CBP fetch cycle (TTL-aware, stale fallback) is made per request.',
  })
  @ApiOkResponse({
    description: 'Array of estimate entries; one per active bridge.',
  })
  getEstimates(@Query() query: EstimatesQueryDto) {
    return this.estimatesService.getEstimates(query.laneType);
  }
}
