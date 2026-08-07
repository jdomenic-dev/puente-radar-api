import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { HistoricalPatternsService } from './historical-patterns.service.js';
import { HistoricalQueryDto } from './dto/historical-query.dto.js';

@ApiTags('historical-patterns')
@ApiSecurity('api-key')
@Controller('historical-patterns')
export class HistoricalPatternsController {
  constructor(
    private readonly patternsService: HistoricalPatternsService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get descriptive historical CBP wait patterns, not a forecast' })
  @ApiOkResponse({ description: 'CBP-only historical baseline with explicit evidence and insufficiency metadata.' })
  getPatterns(@Query() query: HistoricalQueryDto) {
    if (this.configService.get<string>('HISTORICAL_API_ENABLED') !== 'true') throw new NotFoundException();
    return this.patternsService.getPatterns(query);
  }
}
