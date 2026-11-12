import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { BridgesService } from '../modules/bridges/bridges.service.js';
import { SEED_BRIDGES } from './seed-data.js';
import { SEED_CAMERAS } from './camera-seed-data.js';
import { CamerasService } from '../modules/cameras/cameras.service.js';

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

  console.log('🎥 Seeding cameras (idempotent)...');
  const camerasService = app.get(CamerasService);
  for (const camera of SEED_CAMERAS) {
    const result = await camerasService.upsertSeed(camera);
    console.log(`  ✅ ${camera.bridgeSlug} · ${camera.label} (${result.videoId})`);
  }

  console.log('✅ Seed complete.');
  await app.close();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
