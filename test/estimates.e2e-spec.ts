/**
 * estimates.e2e-spec.ts
 *
 * E2E tests for GET /estimates.
 *
 * The test module overrides the CbpAdapter provider with a stub that returns
 * pre-baked NormalizedLane data — no real network calls are made.
 *
 * Database: requires a running PostgreSQL instance. The test relies on the
 * existing app e2e infrastructure (same DATABASE_* env vars).
 *
 * Run with: pnpm test:e2e -- --testPathPattern=estimates
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { CbpAdapter } from '../src/modules/estimates/sources/cbp.adapter.js';
import { LaneType } from '../src/common/enums/lane.enum.js';
import type { NormalizedLane } from '../src/modules/estimates/sources/wait-time-source.adapter.js';
import type { GetLanesResult } from '../src/modules/estimates/sources/cbp.adapter.js';

// ---------------------------------------------------------------------------
// Fake CBP data — 2 bridges × 2 lane types (enough to exercise best-option)
// ---------------------------------------------------------------------------

const NOW = new Date('2025-06-20T10:00:00.000Z');

function makeLane(
  cbpPortNumber: number,
  laneType: LaneType,
  delayMinutes: number | null,
  isOpen = true,
): NormalizedLane {
  return {
    cbpPortNumber,
    laneType,
    delayMinutes,
    lanesOpen: isOpen ? 3 : 0,
    operationalStatus: isOpen ? 'delay' : 'Lanes Closed',
    isOpen,
    sourceUpdateTimeRaw: 'At 10:00 am MDT',
    fetchedAt: NOW,
  };
}

/** Stub that replaces CbpAdapter.getLanes — no real fetch, no real DB. */
const fakeLanes: NormalizedLane[] = [
  // Puente Libre (240201): general open 25 min, sentri open 15 min
  makeLane(240201, LaneType.General, 25),
  makeLane(240201, LaneType.Sentri, 15),
  // Puente Santa Fe (240202): general open 45 min, sentri closed
  makeLane(240202, LaneType.General, 45),
  makeLane(240202, LaneType.Sentri, null, false),
];

const fakeCbpAdapterStub = {
  getLanes: jest.fn().mockResolvedValue({
    lanes: fakeLanes,
    sourceStale: false,
  } satisfies GetLanesResult),
  fetchAll: jest.fn().mockResolvedValue(fakeLanes),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GET /estimates (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Override CbpAdapter with our stub so no real network calls happen
      .overrideProvider(CbpAdapter)
      .useValue(fakeCbpAdapterStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fakeCbpAdapterStub.getLanes.mockResolvedValue({
      lanes: fakeLanes,
      sourceStale: false,
    } satisfies GetLanesResult);
  });

  // ── Default laneType = general ─────────────────────────────────────────────

  describe('GET /estimates (default laneType=general)', () => {
    it('returns 200 with entries for all active bridges', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Must contain entries — we have seeded bridges in the DB
      // At minimum the bridges with cbpPortNumber will appear
      const entries: Array<Record<string, unknown>> = res.body as Array<Record<string, unknown>>;
      expect(entries.length).toBeGreaterThan(0);
    });

    it('all entries have laneType = general', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      const entries: Array<Record<string, unknown>> = res.body as Array<Record<string, unknown>>;
      for (const entry of entries) {
        expect(entry.laneType).toBe(LaneType.General);
      }
    });

    it('CBP adapter getLanes is called exactly once per request', async () => {
      await request(app.getHttpServer()).get('/estimates');
      expect(fakeCbpAdapterStub.getLanes).toHaveBeenCalledTimes(1);
    });

    it('each entry has required fields', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      const entries: Array<Record<string, unknown>> = res.body as Array<Record<string, unknown>>;
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry).toHaveProperty('bridgeId');
        expect(entry).toHaveProperty('bridgeName');
        expect(entry).toHaveProperty('laneType');
        expect(entry).toHaveProperty('confidence');
        expect(entry).toHaveProperty('confidenceScore');
        expect(entry).toHaveProperty('trend');
        expect(entry).toHaveProperty('sourcesUsed');
        expect(entry).toHaveProperty('laneAvailable');
        expect(entry).toHaveProperty('isBestOption');
        expect(entry).toHaveProperty('bestOptionFallback');
      }
    });

    it('exactly one entry has isBestOption=true', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      const entries: Array<Record<string, unknown>> = res.body as Array<Record<string, unknown>>;
      const bestOptions = entries.filter(e => e.isBestOption === true);
      expect(bestOptions).toHaveLength(1);
    });
  });

  // ── laneType query parameter ────────────────────────────────────────────────

  describe('GET /estimates?laneType=sentri', () => {
    it('returns 200 with all entries having laneType=sentri', async () => {
      const res = await request(app.getHttpServer()).get('/estimates?laneType=sentri');
      expect(res.status).toBe(200);
      const entries: Array<Record<string, unknown>> = res.body as Array<Record<string, unknown>>;
      for (const entry of entries) {
        expect(entry.laneType).toBe(LaneType.Sentri);
      }
    });
  });

  // ── Invalid laneType rejected ────────────────────────────────────────────────

  describe('GET /estimates?laneType=invalid', () => {
    it('returns 400 for an invalid laneType value', async () => {
      const res = await request(app.getHttpServer()).get('/estimates?laneType=invalid');
      expect(res.status).toBe(400);
    });
  });

  // ── Inactive adjustment is ignored ──────────────────────────────────────────
  // This is validated more precisely in the service unit test.
  // Here we only verify the endpoint returns 200 (the DB won't have active
  // adjustments in the test environment, so result is just CBP-based).
  describe('GET /estimates with no active adjustments', () => {
    it('returns 200 (inactive/no adjustments — pure CBP result)', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      expect(res.status).toBe(200);
    });
  });
});
