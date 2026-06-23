import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validate } from './config/env.validation.js';
import { typeormConfig } from './config/typeorm.config.js';
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
    HealthModule,
    AuthModule,
    BridgesModule,
    ReportsModule,
    EstimatesModule,
  ],
})
export class AppModule {}
