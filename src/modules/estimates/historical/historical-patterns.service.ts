import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BridgesService } from '../../bridges/bridges.service.js';
import { HistoricalPatternRow, HistoricalRepository } from './historical.repository.js';
import { LaneType } from '../../../common/enums/lane.enum.js';

export interface HistoricalPatternQuery {
  laneType: LaneType;
  dayOfWeek: number;
  time: string;
}

export const HISTORICAL_CLOCK = Symbol('HISTORICAL_CLOCK');

@Injectable()
export class HistoricalPatternsService {
  constructor(
    private readonly repository: HistoricalRepository,
    private readonly bridgesService: BridgesService,
    private readonly configService: ConfigService,
    @Inject(HISTORICAL_CLOCK) private readonly now: () => Date,
  ) {}

  async getPatterns(query: HistoricalPatternQuery) {
    const timezone = this.configService.get<string>('HISTORICAL_TZ') ?? 'America/Ciudad_Juarez';
    const [bridges, rows] = await Promise.all([
      this.bridgesService.findActive(),
      this.repository.findPatterns(query.laneType, query.dayOfWeek, query.time, timezone),
    ]);
    const byBridge = new Map(rows.map((row) => [row.bridgeId, row]));
    return bridges.map((bridge) => this.toResponse(bridge.id, bridge.name, byBridge.get(bridge.id)));
  }

  private toResponse(bridgeId: string, bridgeName: string, row?: HistoricalPatternRow) {
    const minDates = this.configService.get<number>('HISTORICAL_MIN_DATES') ?? 6;
    const minCoverage = this.configService.get<number>('HISTORICAL_MIN_COVERAGE_RATIO') ?? 0.7;
    const insufficientData =
      !row || row.comparableLocalDates < minDates || row.coverageRatio < minCoverage || row.median === null;
    const distribution = insufficientData ? undefined : row;
    const evidence = row ?? {
      observationCount: 0,
      comparableLocalDates: 0,
      coverageStart: null,
      coverageEnd: null,
      coverageRatio: 0,
      closureRate: 0,
    };
    return {
      bridgeId,
      bridgeName,
      descriptiveBaseline: 'CBP historical baseline only; not a forecast.',
      median: distribution?.median ?? null,
      p25: distribution?.p25 ?? null,
      p75: distribution?.p75 ?? null,
      observationCount: evidence.observationCount,
      comparableLocalDates: evidence.comparableLocalDates,
      coveragePeriod: { start: evidence.coverageStart, end: evidence.coverageEnd },
      coverageRatio: evidence.coverageRatio,
      closureRate: evidence.closureRate,
      confidence: confidence(evidence.comparableLocalDates),
      insufficientData,
      generatedAt: this.now().toISOString(),
    };
  }
}

function confidence(dates: number): 'low' | 'medium' | 'high' {
  return dates >= 24 ? 'high' : dates >= 12 ? 'medium' : 'low';
}
