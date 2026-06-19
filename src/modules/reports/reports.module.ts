import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report } from './entities/report.entity.js';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';
import { BridgesModule } from '../bridges/bridges.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Report]), BridgesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
