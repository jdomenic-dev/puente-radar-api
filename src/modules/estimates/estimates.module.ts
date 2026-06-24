/**
 * estimates.module.ts
 *
 * Wires together all providers:
 *   - TypeORM entities: CbpSnapshot, EstimateAdjustment
 *   - BridgesModule (provides BridgesService)
 *   - ReportsModule (provides ReportsService)
 *   - CbpSnapshotCustomRepository (custom DISTINCT ON query)
 *   - CbpAdapter (PostgreSQL-backed TTL, used as PG fallback)
 *   - CbpRedisCache (Redis-first cache; falls through to CbpAdapter when Redis unavailable)
 *   - EstimateCalculator (injectable wrapper)
 *   - EstimatesService (orchestration)
 *   - EstimatesController (GET /estimates)
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BridgesModule } from '../bridges/bridges.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { CbpSnapshot } from './entities/cbp-snapshot.entity.js';
import { EstimateAdjustment } from './entities/estimate-adjustment.entity.js';
import { CbpSnapshotCustomRepository, CBP_SNAPSHOT_REPOSITORY } from './cbp-snapshot.repository.js';
import { CbpAdapter } from './sources/cbp.adapter.js';
import { CbpRedisCache } from './sources/cbp-redis-cache.js';
import { EstimateCalculator } from './estimate.calculator.js';
import { EstimatesService } from './estimates.service.js';
import { EstimatesController } from './estimates.controller.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import type Redis from 'ioredis';

export const CBP_CACHE = 'CBP_CACHE';

@Module({
  imports: [
    TypeOrmModule.forFeature([CbpSnapshot, EstimateAdjustment]),
    BridgesModule,
    ReportsModule,
  ],
  controllers: [EstimatesController],
  providers: [
    // Custom snapshot repository — provides the DISTINCT ON findLatestPerBridgeLane query
    CbpSnapshotCustomRepository,
    {
      provide: CBP_SNAPSHOT_REPOSITORY,
      useExisting: CbpSnapshotCustomRepository,
    },

    // CbpAdapter — PostgreSQL TTL (used directly when Redis unavailable; always persists for trend/audit)
    {
      provide: CbpAdapter,
      useFactory: (configService: ConfigService, snapshotRepo: CbpSnapshotCustomRepository) => {
        return new CbpAdapter({
          baseUrl: configService.get<string>('CBP_BASE_URL') ?? 'https://bwt.cbp.gov/api/waittimes',
          timeoutMs: configService.get<number>('CBP_TIMEOUT_MS') ?? 4000,
          ttlMinutes: configService.get<number>('CBP_TTL_MINUTES') ?? 15,
          snapshotRepo,
        });
      },
      inject: [ConfigService, CbpSnapshotCustomRepository],
    },

    // CbpRedisCache — Redis-first cache; falls through to CbpAdapter when REDIS_URL not set
    {
      provide: CBP_CACHE,
      useFactory: (
        adapter: CbpAdapter,
        redis: Redis | null,
        configService: ConfigService,
      ) => {
        const ttlMinutes = configService.get<number>('CBP_TTL_MINUTES') ?? 15;
        return new CbpRedisCache(adapter, redis, ttlMinutes * 60);
      },
      inject: [CbpAdapter, REDIS_CLIENT, ConfigService],
    },

    EstimateCalculator,
    EstimatesService,
  ],
  exports: [EstimatesService],
})
export class EstimatesModule {}
