/**
 * PostgreSQL-backed endpoint contract. Deliberately deferred in this speed-focused
 * pass: it requires an authorized seeded database and is not part of CI.
 */
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';

const describeIfHistoricalE2e = process.env.RUN_HISTORICAL_E2E === 'true' ? describe : describe.skip;

describeIfHistoricalE2e('GET /historical-patterns (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.HISTORICAL_API_ENABLED = 'true';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('returns sufficient and insufficient descriptive CBP baseline shapes', async () => {
    const response = await request(app.getHttpServer()).get('/historical-patterns?laneType=general&dayOfWeek=1&time=06:00').set('x-api-key', process.env.ADMIN_API_KEY ?? 'test-api-key');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ descriptiveBaseline: 'CBP historical baseline only; not a forecast.', coveragePeriod: expect.any(Object), closureRate: expect.any(Number) }),
    ]));
  });

  it('rejects invalid lane, weekday, and time query values', async () => {
    await expect(request(app.getHttpServer()).get('/historical-patterns?laneType=invalid&dayOfWeek=7&time=6:00').set('x-api-key', process.env.ADMIN_API_KEY ?? 'test-api-key')).resolves.toHaveProperty('status', 400);
  });
});
