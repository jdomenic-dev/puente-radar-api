import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReportsService } from './reports.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { Report } from './entities/report.entity.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * POST /reports — strict throttle: 5 requests per minute per IP.
   * Prevents spam reports from a single source without requiring auth.
   * The global guard applies 60 req/min; this override tightens it for writes.
   */
  @Post()
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Submit an anonymous crossing report' })
  @ApiCreatedResponse({ type: Report })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  @ApiTooManyRequestsResponse({ description: 'Too many reports — max 5 per minute per IP' })
  create(@Body() dto: CreateReportDto): Promise<Report> {
    return this.reportsService.create(dto);
  }

  @Get()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'List reports with optional bridgeId filter and limit' })
  @ApiOkResponse({ type: [Report] })
  findAll(@Query() query: ReportQueryDto): Promise<Report[]> {
    return this.reportsService.findAll(query);
  }

  @Get('summary/home')
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Home summary: all bridges with recent report count (last 60 min)' })
  @ApiOkResponse({ description: 'Array of bridge summaries' })
  getHomeSummary() {
    return this.reportsService.getHomeSummary();
  }

  @Get('bridge/:bridgeId/recent')
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Get recent reports for a specific bridge' })
  @ApiOkResponse({ type: [Report] })
  @ApiNotFoundResponse({ description: 'Bridge not found' })
  findRecentByBridge(
    @Param('bridgeId') bridgeId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<Report[]> {
    return this.reportsService.findRecentByBridge(bridgeId, limit);
  }
}
