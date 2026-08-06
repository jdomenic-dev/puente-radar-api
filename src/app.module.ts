import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { validate } from './config/env.validation.js';
import { typeormConfig } from './config/typeorm.config.js';
import { RedisModule } from './modules/redis/redis.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BridgesModule } from './modules/bridges/bridges.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { EstimatesModule } from './modules/estimates/estimates.module.js';

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

    // Rate limiting — reads limits from env, applied globally via ThrottlerGuard
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL_MS') ?? 60000,
            limit: config.get<number>('THROTTLE_LIMIT') ?? 60,
          },
        ],
      }),
    }),

    HealthModule,
    AuthModule,
    BridgesModule,
    ReportsModule,
    EstimatesModule,
  ],
  providers: [
    // Apply rate limiting globally to every route
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
