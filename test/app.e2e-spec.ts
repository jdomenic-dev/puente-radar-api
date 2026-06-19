import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

/**
 * E2E test suite for Puente Radar backend.
 *
 * Requires a running PostgreSQL instance configured via environment variables.
 *
 * Option A — Docker Desktop (recommended):
 *   docker compose up -d        (from backend/ directory)
 *   npm run test:e2e
 *
 * Option B — Local Postgres (if Docker is unavailable):
 *   Ensure the DB and role exist, then pass env vars directly:
 *   DATABASE_USER=<user> DATABASE_PASSWORD=<pass> DATABASE_NAME=puente_radar \
 *     DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_SYNC=true \
 *     DATABASE_LOGGING=false NODE_ENV=test npm run test:e2e -- --runInBand
 *
 * The suite uses DATABASE_SYNC=true so schema is auto-created on first run.
 * In CI, set DATABASE_SYNC=false and use migrations instead.
 */
describe('Puente Radar API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror the same global pipes and settings as main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health ─────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with { status: "ok" }', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  // ── Swagger ───────────────────────────────────────────────────────────────
  // Note: Swagger is set up in main.ts (outside the testing module), so /api/docs
  // is not available in the e2e test harness. Manual verification: start the server
  // via `npm run start:dev` and open http://localhost:3000/api/docs in a browser.

  // ── Bridges ───────────────────────────────────────────────────────────────

  describe('GET /bridges', () => {
    it('returns an array (may be empty without seeding)', async () => {
      const res = await request(app.getHttpServer()).get('/bridges');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /bridges/summary', () => {
    it('returns an array of bridge summaries', async () => {
      const res = await request(app.getHttpServer()).get('/bridges/summary');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /bridges/:id — not found', () => {
    it('returns 404 for a non-existent UUID', async () => {
      const res = await request(app.getHttpServer()).get('/bridges/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  // ── Reports ──────────────────────────────────────────────────────────────

  describe('POST /reports — validation', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports')
        .send({}) // missing bridgeId and lineStatus
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
    });

    it('returns 400 when lineStatus enum is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports')
        .send({
          bridgeId: '00000000-0000-0000-0000-000000000000',
          lineStatus: 'invalid-status',
        })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
    });

    it('returns 404 when referenced bridge does not exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports')
        .send({
          bridgeId: '00000000-0000-0000-0000-000000000000',
          lineStatus: 'pending',
        })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /reports', () => {
    it('returns an array with optional query params', async () => {
      const res = await request(app.getHttpServer()).get('/reports?limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /reports/summary/home', () => {
    it('returns an array of home summary items', async () => {
      const res = await request(app.getHttpServer()).get('/reports/summary/home');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── PATCH /bridges/:id/status — validation ────────────────────────────────

  describe('PATCH /bridges/:id/status — invalid enum', () => {
    it('returns 400 for invalid status value', async () => {
      // We don't have a real bridge ID here, but validation fires before DB lookup
      // so we test with a syntactically valid UUID and expect 400 for enum error
      const res = await request(app.getHttpServer())
        .patch('/bridges/00000000-0000-0000-0000-000000000000/status')
        .send({ status: 'not-a-valid-status' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
    });
  });
});
