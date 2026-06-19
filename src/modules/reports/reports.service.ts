import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from './entities/report.entity.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { BridgesService } from '../bridges/bridges.service.js';
import { ReportSource } from '../../common/enums/report.enum.js';

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
      reportedWaitMinutes: dto.reportedWaitMinutes ?? 0,
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
}
