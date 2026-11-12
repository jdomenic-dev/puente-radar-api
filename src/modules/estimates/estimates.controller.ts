/**
 * estimates.controller.ts
 *
 * GET /estimates — Returns lane-specific wait estimates for all active bridges.
 * laneType query param defaults to 'general' when omitted.
 *
 * Design reference: design.md — "File Changes", "Interfaces / Contracts".
 */

import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EstimatesService } from './estimates.service.js';
import { HistoricalInsightsService } from './historical/historical-insights.service.js';
import { EstimatesQueryDto } from './dto/estimates-query.dto.js';
import { EstimateEntryDto, OverviewResponseDto } from './dto/estimates-response.dto.js';
import { InsightsResponseDto } from './dto/insights-response.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('estimates')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (default 120 requests per minute per IP and endpoint)',
})
@Controller('estimates')
export class EstimatesController {
  constructor(
    private readonly estimatesService: EstimatesService,
    private readonly insightsService: HistoricalInsightsService,
  ) {}

  @Get()
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Get lane-specific wait estimates for all active bridges',
    description:
      'Returns one response entry per active bridge for the requested lane type. ' +
      'laneType defaults to general when omitted. ' +
      'A single CBP fetch cycle (TTL-aware, stale fallback) is made per request.',
  })
  @ApiOkResponse({ type: [EstimateEntryDto], description: 'One estimate entry per active bridge.' })
  @ApiBadRequestResponse({ description: 'laneType is not one of general, ready_lane, sentri, pedestrian' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key header' })
  getEstimates(@Query() query: EstimatesQueryDto) {
    return this.estimatesService.getEstimates(query.laneType);
  }

  // Declared after the bare @Get(): Nest matches static paths regardless of order here
  // because "estimates" has no :param route, but keeping it below avoids surprises later.
  @Public()
  @Get('overview')
  @ApiOperation({
    summary: 'Home overview: every bridge with all lanes (general, ready_lane, sentri, pedestrian)',
    description:
      'One call for the Home screen. Per bridge: names, schedule, open state, recent report count and, ' +
      'per lane: estimated wait, status (low <= 30 min, medium <= 60, high <= 120, saturated above), ' +
      'trend (rising | steady | falling), lanes open, availability and the best-option flag. ' +
      'Lanes are resolved sequentially so a stale CBP cache is refreshed once. ' +
      'Public (no API key): it only serves public CBP wait data, subject to the global rate limit. ' +
      'The result is cached for up to 30 seconds; generatedAt tells when it was computed.',
  })
  @ApiOkResponse({ type: OverviewResponseDto, description: 'Overview of every active bridge, in catalog order.' })
  getOverview() {
    return this.estimatesService.getOverview();
  }

  @Public()
  @Get('insights')
  @ApiOperation({
    summary: 'History insights: usual wait right now and best times of the day, per bridge and lane',
    description:
      'Built from the collected CBP history (30-minute bins, same weekday). For each bridge and lane: ' +
      '"usual" is the median wait for this half hour, and "bestTimes" the freest and busiest three-hour windows. ' +
      'Both are null until at least 6 comparable dates with 70% coverage exist, so clients must hide them when null. ' +
      'Public (no API key); cached for 5 minutes on the server.',
  })
  @ApiOkResponse({ type: InsightsResponseDto, description: 'One entry per active bridge, in catalog order.' })
  getInsights() {
    return this.insightsService.getInsights();
  }
}
