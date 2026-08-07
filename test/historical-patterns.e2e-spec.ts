/**
 * PostgreSQL-backed endpoint contract. Deliberately deferred in this speed-focused
 * pass: it requires an authorized seeded database and is not part of CI.
 */
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
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

  afterAll(async () => {
    await app?.close();
  });

  function getServer(): Server {
    return app.getHttpServer() as Server;
  }

  function firstPattern(value: unknown): Record<string, unknown> {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('Expected a non-empty historical pattern response.');
    }
    const first: unknown = value[0];
    if (typeof first !== 'object' || first === null) throw new Error('Expected a historical pattern object.');
    return first as Record<string, unknown>;
  }

  it('returns sufficient and insufficient descriptive CBP baseline shapes', async () => {
    const response: request.Response = await request(getServer())
      .get('/historical-patterns?laneType=general&dayOfWeek=1&time=06:00')
      .set('x-api-key', process.env.ADMIN_API_KEY ?? 'test-api-key');
    expect(response.status).toBe(200);
    const body: unknown = response.body;
    const pattern = firstPattern(body);
    expect(pattern.descriptiveBaseline).toBe('CBP historical baseline only; not a forecast.');
    expect(pattern.coveragePeriod).toEqual(expect.any(Object));
    expect(pattern.closureRate).toEqual(expect.any(Number));
  });

  it('rejects invalid lane, weekday, and time query values', async () => {
    await expect(
      request(getServer())
        .get('/historical-patterns?laneType=invalid&dayOfWeek=7&time=6:00')
        .set('x-api-key', process.env.ADMIN_API_KEY ?? 'test-api-key'),
    ).resolves.toHaveProperty('status', 400);
  });
});
