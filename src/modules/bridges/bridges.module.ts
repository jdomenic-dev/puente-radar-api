import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bridge } from './entities/bridge.entity.js';
import { BridgesService } from './bridges.service.js';
import { BridgesController } from './bridges.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Bridge])],
  controllers: [BridgesController],
  providers: [BridgesService],
  exports: [BridgesService],
})
export class BridgesModule {}
