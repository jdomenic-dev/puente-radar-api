/**
 * estimates.module.ts
 *
 * Wires together all Slice C providers:
 *   - TypeORM entities: CbpSnapshot, EstimateAdjustment
 *   - BridgesModule (provides BridgesService)
 *   - ReportsModule (provides ReportsService)
 *   - CbpSnapshotCustomRepository (custom DISTINCT ON query)
 *   - CbpAdapter (factory provider reading config values)
 *   - EstimateCalculator (injectable wrapper)
 *   - EstimatesService (orchestration)
 *   - EstimatesController (GET /estimates)
 *
 * Design reference: design.md — "File Changes", "Architecture Decisions".
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BridgesModule } from '../bridges/bridges.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { CbpSnapshot } from './entities/cbp-snapshot.entity.js';
import { EstimateAdjustment } from './entities/estimate-adjustment.entity.js';
import { CbpSnapshotCustomRepository, CBP_SNAPSHOT_REPOSITORY } from './cbp-snapshot.repository.js';
import { CbpAdapter } from './sources/cbp.adapter.js';
import { EstimateCalculator } from './estimate.calculator.js';
import { EstimatesService } from './estimates.service.js';
import { EstimatesController } from './estimates.controller.js';

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

    // CbpAdapter factory — reads env config; injects custom snapshot repo
    {
      provide: CbpAdapter,
      useFactory: (configService: ConfigService, snapshotRepo: CbpSnapshotCustomRepository) => {
        return new CbpAdapter({
          baseUrl:
            configService.get<string>('CBP_BASE_URL') ??
            'https://bwt.cbp.gov/api/waittimes',
          timeoutMs: configService.get<number>('CBP_TIMEOUT_MS') ?? 4000,
          ttlMinutes: configService.get<number>('CBP_TTL_MINUTES') ?? 15,
          snapshotRepo,
        });
      },
      inject: [ConfigService, CbpSnapshotCustomRepository],
    },

    EstimateCalculator,
    EstimatesService,
  ],
  exports: [EstimatesService],
})
export class EstimatesModule {}
