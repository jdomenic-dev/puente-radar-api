import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bridge } from './entities/bridge.entity.js';
import { CreateBridgeDto } from './dto/create-bridge.dto.js';
import { UpdateBridgeStatusDto } from './dto/update-bridge-status.dto.js';
import { BridgeStatus, WaitTrend } from '../../common/enums/bridge.enum.js';

export interface BridgeHomeSummary {
  id: string;
  name: string;
  slug: string;
  status: BridgeStatus;
  waitMinutes: number | null;
  trend: WaitTrend | null;
  lastUpdatedAt: Date | null;
  recentReportCount: number;
}

interface BridgeHomeSummaryRaw {
  recentReportCount?: string;
}

@Injectable()
export class BridgesService {
  constructor(
    @InjectRepository(Bridge)
    private readonly bridgeRepository: Repository<Bridge>,
  ) {}

  async findAll(): Promise<Bridge[]> {
    return this.bridgeRepository.find({
      where: { status: undefined },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findActive(): Promise<Bridge[]> {
    return this.bridgeRepository.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOneById(id: string): Promise<Bridge> {
    const bridge = await this.bridgeRepository.findOne({ where: { id } });
    if (!bridge) {
      throw new NotFoundException(`Bridge with id "${id}" not found`);
    }
    return bridge;
  }

  async findOneBySlug(slug: string): Promise<Bridge> {
    const bridge = await this.bridgeRepository.findOne({ where: { slug } });
    if (!bridge) {
      throw new NotFoundException(`Bridge with slug "${slug}" not found`);
    }
    return bridge;
  }

  async updateStatus(id: string, dto: UpdateBridgeStatusDto): Promise<Bridge> {
    const bridge = await this.findOneById(id);
    if (dto.status !== undefined) bridge.status = dto.status;
    if (dto.waitMinutes !== undefined) bridge.waitMinutes = dto.waitMinutes;
    if (dto.trend !== undefined) bridge.trend = dto.trend;
    // lastUpdatedAt is handled by @UpdateDateColumn — touch the entity to refresh
    return this.bridgeRepository.save(bridge);
  }

  async upsertBySlug(dto: CreateBridgeDto): Promise<Bridge> {
    const existing = await this.bridgeRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      // Update cbpPortNumber only — status is managed by operations, not by seed/upsert.
      // Overwriting status here would reset operational state on every seed re-run.
      if (dto.cbpPortNumber !== undefined) {
        existing.cbpPortNumber = dto.cbpPortNumber;
      }
      return this.bridgeRepository.save(existing);
    }
    const bridge = this.bridgeRepository.create(dto);
    return this.bridgeRepository.save(bridge);
  }

  async getHomeSummary(): Promise<BridgeHomeSummary[]> {
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);

    const bridges = await this.bridgeRepository
      .createQueryBuilder('bridge')
      .leftJoin('bridge.reports', 'report', 'report.createdAt >= :since', { since: sixtyMinutesAgo })
      .select([
        'bridge.id',
        'bridge.name',
        'bridge.slug',
        'bridge.status',
        'bridge.waitMinutes',
        'bridge.trend',
        'bridge.lastUpdatedAt',
        'bridge.sortOrder',
      ])
      .addSelect('COUNT(report.id)', 'recentReportCount')
      .groupBy('bridge.id')
      .orderBy('bridge.sortOrder', 'ASC')
      .addOrderBy('bridge.name', 'ASC')
      .getRawAndEntities<BridgeHomeSummaryRaw>();

    return bridges.entities.map((bridge, index) => ({
      id: bridge.id,
      name: bridge.name,
      slug: bridge.slug,
      status: bridge.status,
      waitMinutes: bridge.waitMinutes,
      trend: bridge.trend,
      lastUpdatedAt: bridge.lastUpdatedAt,
      recentReportCount: parseInt(bridges.raw[index]?.recentReportCount ?? '0', 10),
    }));
  }
}
