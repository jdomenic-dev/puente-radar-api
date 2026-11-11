import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReportsService } from './reports.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { Report } from './entities/report.entity.js';
import { BridgeHomeSummaryDto } from '../bridges/dto/bridge-home-summary.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { BoundedIntPipe } from '../../common/pipes/bounded-int.pipe.js';

const RECENT_REPORTS_DEFAULT_LIMIT = 10;
const RECENT_REPORTS_MAX_LIMIT = 100;

const DEFAULT_REPORTS_PER_MINUTE = 5;

/** Read at request time so THROTTLE_REPORTS_LIMIT takes effect without code changes. */
function reportsPerMinute(): number {
  const configured = Number(process.env.THROTTLE_REPORTS_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_REPORTS_PER_MINUTE;
}

@ApiTags('reports')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (default 120 requests per minute per IP and endpoint)',
})
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * POST /reports — strict throttle: THROTTLE_REPORTS_LIMIT requests per minute per IP (default 5).
   * Prevents spam reports from a single source without requiring auth.
   * The global guard applies a per-IP default; this override tightens it for writes.
   */
  @Post()
  @Public()
  @Throttle({ default: { ttl: 60000, limit: reportsPerMinute } })
  @ApiOperation({
    summary: 'Submit an anonymous crossing report',
    description:
      'Public (no API key). lineStatus is deprecated and ignored: the server always stores the report as pending.',
  })
  @ApiCreatedResponse({ type: Report })
  @ApiBadRequestResponse({ description: 'The body failed validation' })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  @ApiTooManyRequestsResponse({
    description: 'Too many reports: 5 per minute per IP by default (THROTTLE_REPORTS_LIMIT)',
  })
  create(@Body() dto: CreateReportDto): Promise<Report> {
    return this.reportsService.create(dto);
  }

  @Get()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'List reports with optional bridgeId filter and limit' })
  @ApiOkResponse({ type: [Report] })
  @ApiBadRequestResponse({ description: 'A query parameter failed validation' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key header' })
  findAll(@Query() query: ReportQueryDto): Promise<Report[]> {
    return this.reportsService.findAll(query);
  }

  @Get('summary/home')
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Home summary: all bridges with recent report count (last 60 min)' })
  @ApiOkResponse({ type: [BridgeHomeSummaryDto], description: 'One entry per bridge, ordered by sortOrder' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key header' })
  getHomeSummary() {
    return this.reportsService.getHomeSummary();
  }

  @Get('bridge/:bridgeId/recent')
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Get recent reports for a specific bridge' })
  @ApiParam({ name: 'bridgeId', type: String, format: 'uuid', description: 'Bridge UUID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: `Maximum number of reports (1 to ${RECENT_REPORTS_MAX_LIMIT}, default ${RECENT_REPORTS_DEFAULT_LIMIT})`,
  })
  @ApiOkResponse({ type: [Report] })
  @ApiBadRequestResponse({ description: 'bridgeId is not a valid UUID, or limit is out of range' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key header' })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  findRecentByBridge(
    @Param('bridgeId', ParseUUIDPipe) bridgeId: string,
    @Query(
      'limit',
      new BoundedIntPipe({ min: 1, max: RECENT_REPORTS_MAX_LIMIT, fallback: RECENT_REPORTS_DEFAULT_LIMIT }),
    )
    limit: number,
  ): Promise<Report[]> {
    return this.reportsService.findRecentByBridge(bridgeId, limit);
  }
}
