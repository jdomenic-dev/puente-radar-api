import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { BridgesService } from '../modules/bridges/bridges.service.js';
import { BridgeStatus } from '../common/enums/bridge.enum.js';
import { CreateBridgeDto } from '../modules/bridges/dto/create-bridge.dto.js';

const SEED_BRIDGES: CreateBridgeDto[] = [
  {
    name: 'Puente Libre / Córdova-Américas',
    slug: 'puente-libre',
    status: BridgeStatus.Low,
    sortOrder: 1,
  },
  {
    name: 'Puente Santa Fe',
    slug: 'puente-santa-fe',
    status: BridgeStatus.Low,
    sortOrder: 2,
  },
  {
    name: 'Puente Zaragoza / Ysleta',
    slug: 'puente-zaragoza',
    status: BridgeStatus.Low,
    sortOrder: 3,
  },
  {
    name: 'Puente Guadalupe-Tornillo',
    slug: 'puente-guadalupe-tornillo',
    status: BridgeStatus.Low,
    sortOrder: 4,
  },
];

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const bridgesService = app.get(BridgesService);

  console.log('🌱 Seeding bridges (idempotent)...');

  for (const bridge of SEED_BRIDGES) {
    const result = await bridgesService.upsertBySlug(bridge);
    console.log(`  ✅ ${result.name} (slug: ${result.slug}) — id: ${result.id}`);
  }

  console.log('✅ Seed complete.');
  await app.close();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
