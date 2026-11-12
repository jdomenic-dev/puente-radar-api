import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgesModule } from '../bridges/bridges.module.js';
import { CamerasController } from './cameras.controller.js';
import { CamerasService } from './cameras.service.js';
import { BridgeCamera } from './entities/bridge-camera.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([BridgeCamera]), BridgesModule],
  controllers: [CamerasController],
  providers: [CamerasService],
  exports: [CamerasService],
})
export class CamerasModule {}
