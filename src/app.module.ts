import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { ScheduleModule } from '@nestjs/schedule';
import { validate } from './config/env.validation.js';
import { typeormConfig } from './config/typeorm.config.js';
import { RedisModule, REDIS_CLIENT } from './modules/redis/redis.module.js';
import { GlobalSecurityModule } from './common/security/global-security.module.js';
import { ResilientThrottlerStorage } from './common/throttler/resilient-throttler.storage.js';
import { HealthModule } from './modules/health/health.module.js';
import { BridgesModule } from './modules/bridges/bridges.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { EstimatesModule } from './modules/estimates/estimates.module.js';
import { CamerasModule } from './modules/cameras/cameras.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    TypeOrmModule.forRootAsync(typeormConfig),

    // Enables @Cron() decorators — used by the scheduled historical CBP collector.
    // No-op by itself; each job checks HISTORICAL_COLLECTION_ENABLED before doing work.
    ScheduleModule.forRoot(),

    // Redis — global, optional (no REDIS_URL → null client, features degrade gracefully)
    RedisModule,

    // Rate limiting — limits from env; counters live in Redis when REDIS_URL is set and fall back
    // to memory if Redis is missing or fails. Applied globally by GlobalSecurityModule.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService, redis: Redis | null) => ({
        storage: new ResilientThrottlerStorage(redis),
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL_MS') ?? 60000,
            limit: config.get<number>('THROTTLE_LIMIT') ?? 120,
          },
        ],
      }),
    }),

    HealthModule,
    // Global guards in a fixed order: rate limit first, then API key.
    GlobalSecurityModule,
    BridgesModule,
    ReportsModule,
    EstimatesModule,
    CamerasModule,
  ],
})
export class AppModule {}
