import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from './entities/report.entity.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { BridgesService } from '../bridges/bridges.service.js';
import { ReportSource, ReportStatus } from '../../common/enums/report.enum.js';
import { LaneType } from '../../common/enums/lane.enum.js';

export interface UsableReportsResult {
  sampleSize: number;
  weightedMean: number | null;
}

const RECENCY_WEIGHTS: Array<{ maxMinutes: number; weight: number }> = [
  { maxMinutes: 15, weight: 1.0 },
  { maxMinutes: 30, weight: 0.8 },
  { maxMinutes: 60, weight: 0.5 },
  { maxMinutes: 90, weight: 0.3 },
];

function getRecencyWeight(ageMinutes: number): number | null {
  for (const { maxMinutes, weight } of RECENCY_WEIGHTS) {
    if (ageMinutes <= maxMinutes) return weight;
  }
  return null; // > 90 min — excluded
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly bridgesService: BridgesService,
  ) {}

  async create(dto: CreateReportDto): Promise<Report> {
    // Verify bridge exists — throws 404 if not
    await this.bridgesService.findOneById(dto.bridgeId);

    const report = this.reportRepository.create({
      bridgeId: dto.bridgeId,
      reportedWaitMinutes: dto.reportedWaitMinutes ?? null,
      laneType: dto.laneType,
      lineStatus: dto.lineStatus,
      comment: dto.comment ?? null,
      anonymousDeviceId: dto.anonymousDeviceId ?? null,
      source: ReportSource.User,
    });

    return this.reportRepository.save(report);
  }

  async findAll(query: ReportQueryDto): Promise<Report[]> {
    const limit = query.limit ?? 20;
    const qb = this.reportRepository.createQueryBuilder('report').orderBy('report.createdAt', 'DESC').limit(limit);

    if (query.bridgeId) {
      qb.where('report.bridgeId = :bridgeId', { bridgeId: query.bridgeId });
    }

    return qb.getMany();
  }

  async findRecentByBridge(bridgeId: string, limit = 10): Promise<Report[]> {
    // Verify bridge exists — throws 404 if not
    await this.bridgesService.findOneById(bridgeId);

    return this.reportRepository.find({
      where: { bridgeId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getHomeSummary() {
    return this.bridgesService.getHomeSummary();
  }

  async findUsableReports(bridgeId: string, laneType: LaneType): Promise<UsableReportsResult> {
    const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000);

    const candidates = await this.reportRepository.find({
      where: {
        bridgeId,
        laneType,
      },
      order: { createdAt: 'DESC' },
    });

    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;

    for (const report of candidates) {
      // Must have been created after the 90-minute cutoff
      if (report.createdAt < ninetyMinutesAgo) continue;

      // Must have a valid wait value (not null, within 0-360)
      if (report.reportedWaitMinutes === null || report.reportedWaitMinutes < 0 || report.reportedWaitMinutes > 360) continue;

      // Must not be rejected
      if (report.lineStatus === ReportStatus.Rejected) continue;

      const ageMinutes = (now - report.createdAt.getTime()) / (60 * 1000);
      const weight = getRecencyWeight(ageMinutes);
      if (weight === null) continue; // > 90 min

      weightedSum += report.reportedWaitMinutes * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return { sampleSize: 0, weightedMean: null };
    }

    // Count usable reports (those that passed all filters)
    const usableCount = candidates.filter((r) => {
      if (r.createdAt < ninetyMinutesAgo) return false;
      if (r.reportedWaitMinutes === null || r.reportedWaitMinutes < 0 || r.reportedWaitMinutes > 360) return false;
      if (r.lineStatus === ReportStatus.Rejected) return false;
      const ageMinutes = (now - r.createdAt.getTime()) / (60 * 1000);
      return getRecencyWeight(ageMinutes) !== null;
    }).length;

    return {
      sampleSize: usableCount,
      weightedMean: weightedSum / totalWeight,
    };
  }
}
