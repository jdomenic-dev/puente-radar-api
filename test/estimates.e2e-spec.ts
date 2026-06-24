/**
 * estimates.e2e-spec.ts
 *
 * E2E tests for GET /estimates.
 *
 * The test module overrides:
 *   - CbpAdapter: stub returning pre-baked NormalizedLane data (no real network).
 *   - BridgesService: stub returning two in-memory bridges so the response
 *     always has entries regardless of DB seed state — guarantees the full
 *     response-contract assertion runs unconditionally.
 *
 * Database: requires a running PostgreSQL instance (for TypeORM bootstrap,
 * EstimateAdjustment lookup, CbpSnapshot repo). Bridge and CBP data come
 * from the stubs, not the real tables.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { CBP_CACHE } from '../src/modules/estimates/estimates.module.js';
import { REDIS_CLIENT } from '../src/modules/redis/redis.module.js';
import { BridgesService } from '../src/modules/bridges/bridges.service.js';
import { LaneType } from '../src/common/enums/lane.enum.js';
import { BridgeStatus } from '../src/common/enums/bridge.enum.js';
import type { Bridge } from '../src/modules/bridges/entities/bridge.entity.js';
import type { NormalizedLane } from '../src/modules/estimates/sources/wait-time-source.adapter.js';
import type { GetLanesResult } from '../src/modules/estimates/sources/cbp.adapter.js';

// ---------------------------------------------------------------------------
// Fake bridge data — 2 in-memory bridges guaranteed to be present
// ---------------------------------------------------------------------------

const FAKE_BRIDGE_A: Bridge = {
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  name: 'E2E Bridge Alpha',
  slug: 'e2e-bridge-alpha',
  status: BridgeStatus.Low,
  waitMinutes: null,
  trend: null,
  cbpPortNumber: 240201,
  sortOrder: 1,
  lastUpdatedAt: null,
  reports: [],
} as Bridge;

const FAKE_BRIDGE_B: Bridge = {
  id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  name: 'E2E Bridge Beta',
  slug: 'e2e-bridge-beta',
  status: BridgeStatus.Low,
  waitMinutes: null,
  trend: null,
  cbpPortNumber: 240202,
  sortOrder: 2,
  lastUpdatedAt: null,
  reports: [],
} as Bridge;

// ---------------------------------------------------------------------------
// Fake CBP data keyed to the fake bridge port numbers
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

/** Pre-baked lanes for both fake bridges: general open with distinct delays. */
const fakeLanes: NormalizedLane[] = [
  // FAKE_BRIDGE_A (240201): general 25 min, sentri 15 min
  makeLane(240201, LaneType.General, 25),
  makeLane(240201, LaneType.Sentri, 15),
  // FAKE_BRIDGE_B (240202): general 45 min, sentri closed
  makeLane(240202, LaneType.General, 45),
  makeLane(240202, LaneType.Sentri, null, false),
];

/** CbpAdapter stub — no real fetch. */
const fakeCbpAdapterStub = {
  getLanes: jest.fn().mockResolvedValue({
    lanes: fakeLanes,
    sourceStale: false,
  } satisfies GetLanesResult),
  fetchAll: jest.fn().mockResolvedValue(fakeLanes),
};

/** BridgesService stub — always returns the two fake bridges, DB-independent. */
const fakeBridgesServiceStub = {
  findActive: jest.fn().mockResolvedValue([FAKE_BRIDGE_A, FAKE_BRIDGE_B]),
  findOneById: jest.fn(),
  findOneBySlug: jest.fn(),
  findAll: jest.fn(),
  upsertBySlug: jest.fn(),
  updateStatus: jest.fn(),
  getHomeSummary: jest.fn(),
};

// ---------------------------------------------------------------------------
// Full response-contract field list (design "Interfaces / Contracts")
// ---------------------------------------------------------------------------

const REQUIRED_ENTRY_FIELDS = [
  'bridgeId',
  'bridgeName',
  'laneType',
  'status',
  'confidence',
  'confidenceScore',
  'trend',
  'sourcesUsed',
  'lastUpdatedAt',
  'fetchedAt',
  'laneAvailable',
  'isBestOption',
  'bestOptionFallback',
] as const;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GET /estimates (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // No Redis in tests — provide null so CbpRedisCache falls through to PG adapter
      .overrideProvider(REDIS_CLIENT)
      .useValue(null)
      // No real network — stub replaces CbpRedisCache (which wraps CbpAdapter)
      .overrideProvider(CBP_CACHE)
      .useValue(fakeCbpAdapterStub)
      // No real DB bridge lookup — stub always returns two fake bridges
      .overrideProvider(BridgesService)
      .useValue(fakeBridgesServiceStub)
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
    fakeBridgesServiceStub.findActive.mockResolvedValue([FAKE_BRIDGE_A, FAKE_BRIDGE_B]);
  });

  // ── Default laneType = general ─────────────────────────────────────────────

  describe('GET /estimates (default laneType=general)', () => {
    it('returns 200 with exactly two entries (one per fake bridge)', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Both stubs are active: BridgesService returns 2 bridges, CbpAdapter returns matching lanes
      expect((res.body as unknown[]).length).toBe(2);
    });

    it('all entries have laneType = general', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      const entries = res.body as Array<Record<string, unknown>>;
      for (const entry of entries) {
        expect(entry.laneType).toBe(LaneType.General);
      }
    });

    it('CBP adapter getLanes is called exactly once per request', async () => {
      await request(app.getHttpServer()).get('/estimates');
      expect(fakeCbpAdapterStub.getLanes).toHaveBeenCalledTimes(1);
    });

    it('every entry satisfies the full response contract', async () => {
      // BridgesService stub guarantees 2 entries — no skip-when-empty.
      const res = await request(app.getHttpServer()).get('/estimates');
      const entries = res.body as Array<Record<string, unknown>>;

      // Must be non-empty (stub guarantees it)
      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        // All fixed required fields must be present
        for (const field of REQUIRED_ENTRY_FIELDS) {
          expect(entry).toHaveProperty(field);
        }

        // Either estimatedWaitMinutes OR estimateUnavailable must be present
        const hasWait = 'estimatedWaitMinutes' in entry;
        const hasUnavailable = 'estimateUnavailable' in entry;
        expect(hasWait || hasUnavailable).toBe(true);

        // Type-shape assertions on key fields
        expect(typeof entry.bridgeId).toBe('string');
        expect(typeof entry.bridgeName).toBe('string');
        expect(typeof entry.confidenceScore).toBe('number');
        expect(['low', 'medium', 'high']).toContain(entry.confidence);
        expect(['up', 'down', 'stable']).toContain(entry.trend);
        expect(Array.isArray(entry.sourcesUsed)).toBe(true);
        expect(typeof entry.laneAvailable).toBe('boolean');
        expect(typeof entry.isBestOption).toBe('boolean');
        expect(typeof entry.bestOptionFallback).toBe('boolean');
      }
    });

    it('exactly one entry has isBestOption=true', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      const entries = res.body as Array<Record<string, unknown>>;
      const bestOptions = entries.filter(e => e.isBestOption === true);
      // Two bridges, one best option (the lower wait: FAKE_BRIDGE_A at 25 min vs 45 min)
      expect(bestOptions).toHaveLength(1);
      expect(bestOptions[0].bridgeId).toBe(FAKE_BRIDGE_A.id);
    });
  });

  // ── laneType query parameter ────────────────────────────────────────────────

  describe('GET /estimates?laneType=sentri', () => {
    it('returns 200 with all entries having laneType=sentri', async () => {
      const res = await request(app.getHttpServer()).get('/estimates?laneType=sentri');
      expect(res.status).toBe(200);
      const entries = res.body as Array<Record<string, unknown>>;
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

  // ── Inactive adjustment / no-adjustment smoke test ──────────────────────────

  describe('GET /estimates with no active adjustments', () => {
    it('returns 200 (no active adjustments in test DB)', async () => {
      const res = await request(app.getHttpServer()).get('/estimates');
      expect(res.status).toBe(200);
    });
  });

  // ── CbpAdapter stub verification ──────────────────────────────────────────

  describe('CbpAdapter stub verification', () => {
    it('does not call the real CBP network (getLanes called via stub)', async () => {
      await request(app.getHttpServer()).get('/estimates');
      expect(jest.isMockFunction(fakeCbpAdapterStub.getLanes)).toBe(true);
      expect(fakeCbpAdapterStub.getLanes).toHaveBeenCalled();
    });
  });
});
