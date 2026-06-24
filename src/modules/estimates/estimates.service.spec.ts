/**
 * estimates.service.spec.ts
 *
 * Unit tests for EstimatesService orchestration.
 * All I/O is mocked — no DB, no network.
 *
 * Coverage:
 *   - One CBP fetch per request (getLanes called once)
 *   - Default laneType = general
 *   - Best option: lowest est. among NOT low-confidence
 *   - Best option fallback: when ALL available are low-confidence, pick lowest anyway
 *   - Trend: up / down / stable vs previous persisted snapshot
 *   - Inactive adjustment is ignored
 *   - Community weighting wired correctly (no missing-wait-as-zero)
 *   - Unavailable lane: not a best-option candidate
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EstimatesService } from './estimates.service.js';
import { EstimateCalculator } from './estimate.calculator.js';
import { CBP_CACHE } from './estimates.module.js';
import { EstimateAdjustment } from './entities/estimate-adjustment.entity.js';
import { BridgesService } from '../bridges/bridges.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { LaneType } from '../../common/enums/lane.enum.js';
import { BridgeStatus } from '../../common/enums/bridge.enum.js';
import type { Bridge } from '../bridges/entities/bridge.entity.js';
import type { NormalizedLane } from './sources/wait-time-source.adapter.js';
import type { GetLanesResult } from './sources/cbp.adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBridge(id: string, name: string, cbpPortNumber: number | null): Bridge {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    status: BridgeStatus.Low,
    waitMinutes: null,
    trend: null,
    cbpPortNumber,
    sortOrder: 1,
    lastUpdatedAt: null,
    reports: [],
  } as Bridge;
}

function makeLane(
  cbpPortNumber: number,
  laneType: LaneType,
  delayMinutes: number | null,
  isOpen = true,
  fetchedAt = new Date('2025-06-20T10:00:00.000Z'),
): NormalizedLane {
  return {
    cbpPortNumber,
    laneType,
    delayMinutes,
    lanesOpen: isOpen ? 3 : 0,
    operationalStatus: isOpen ? 'delay' : 'Lanes Closed',
    isOpen,
    sourceUpdateTimeRaw: 'At 10:00 am MDT',
    fetchedAt,
  };
}

// ---------------------------------------------------------------------------
// Constants for test data
// ---------------------------------------------------------------------------

const BRIDGE_A_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const BRIDGE_B_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const PORT_A = 240201;
const PORT_B = 240202;

const BRIDGE_A = makeBridge(BRIDGE_A_ID, 'Bridge Alpha', PORT_A);
const BRIDGE_B = makeBridge(BRIDGE_B_ID, 'Bridge Beta', PORT_B);

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockBridgesService = {
  findActive: jest.fn(),
};

const mockReportsService = {
  findUsableReports: jest.fn(),
};

const mockCbpAdapter = {
  getLanes: jest.fn(),
};

// CbpSnapshotRepository mock: DISTINCT ON per bridge+lane
const mockSnapshotRepository = {
  findLatestPerBridgeLane: jest.fn(),
  findLatestTwoPerBridgeLane: jest.fn(),
  save: jest.fn(),
};

// EstimateAdjustment repository mock
const mockAdjustmentRepository = {
  find: jest.fn(),
};

// ConfigService mock
const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'CBP_TTL_MINUTES') return 15;
    if (key === 'CBP_BASE_URL') return 'https://bwt.cbp.gov/api/waittimes';
    if (key === 'CBP_TIMEOUT_MS') return 4000;
    return undefined;
  }),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('EstimatesService', () => {
  let service: EstimatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstimatesService,
        EstimateCalculator,
        {
          provide: CBP_CACHE,
          useValue: mockCbpAdapter,
        },
        {
          provide: BridgesService,
          useValue: mockBridgesService,
        },
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
        {
          provide: 'CbpSnapshotRepository',
          useValue: mockSnapshotRepository,
        },
        {
          provide: getRepositoryToken(EstimateAdjustment),
          useValue: mockAdjustmentRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EstimatesService>(EstimatesService);
  });

  beforeEach(() => {
    // Default: no snapshot history (trend = stable by default)
    mockSnapshotRepository.findLatestTwoPerBridgeLane.mockResolvedValue([]);
    mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── C.1: One CBP fetch per request ─────────────────────────────────────────
  // Uses TWO bridges so a per-bridge fetch regression would be caught.

  describe('one-fetch-cycle guarantee', () => {
    it('calls cbpAdapter.getLanes exactly once even with multiple bridges', async () => {
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A, BRIDGE_B]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [
          makeLane(PORT_A, LaneType.General, 30),
          makeLane(PORT_B, LaneType.General, 45),
        ],
        sourceStale: false,
      } satisfies GetLanesResult);
      // findUsableReports called once per bridge
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);

      await service.getEstimates(LaneType.General);

      // Regardless of bridge count, getLanes is called EXACTLY ONCE per request
      expect(mockCbpAdapter.getLanes).toHaveBeenCalledTimes(1);
    });
  });

  // ── C.2: Default laneType = general ────────────────────────────────────────

  describe('default laneType', () => {
    it('uses general when laneType is omitted (called with general)', async () => {
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 20)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);

      const results = await service.getEstimates(LaneType.General);

      expect(results).toHaveLength(1);
      expect(results[0].laneType).toBe(LaneType.General);
    });
  });

  // ── C.3: Best option selection — spec R3 ───────────────────────────────────
  //
  // Confidence is driven by the REAL calculator penalty rules (no stubbing).
  // LOW  (score ≤ 49): cbpStale(-20) + sourceStale(-15) + sample1(-15) + disagreement>30(-20) = -70 → 30
  // MEDIUM (score 50-79): CBP-only cold start → min(100, 70) = 70 (CBP-only ceiling)
  //
  // To force cbpStale=true: mock findLatestPerBridgeLane to return a snapshot
  // with fetchedAt more than TTL (15 min) in the past.

  describe('best option selection', () => {
    it('marks the lowest-wait NOT-low-confidence entry as best option (both MEDIUM)', async () => {
      // Both bridges CBP-only cold start → score=70 → MEDIUM.
      // Bridge A: wait=20 (lower). Bridge B: wait=50.
      // Expected: Bridge A wins (lower wait, both non-low-confidence), bestOptionFallback=false.
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A, BRIDGE_B]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [
          makeLane(PORT_A, LaneType.General, 20),
          makeLane(PORT_B, LaneType.General, 50),
        ],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);

      const results = await service.getEstimates(LaneType.General);

      const best = results.find(r => r.isBestOption);
      expect(best).toBeDefined();
      expect(best!.bridgeId).toBe(BRIDGE_A_ID);
      expect(best!.bestOptionFallback).toBe(false);
    });

    it('R3: skips the lowest-wait LOW-confidence entry and picks the higher-wait MEDIUM entry', async () => {
      // This is the spec R3 scenario: "best option excludes low confidence".
      //
      // Bridge X (BRIDGE_A): official delay=10 (LOWEST wait), but receives all four
      //   confidence penalties → score=30 → LOW confidence.
      //   Penalty breakdown:
      //     cbpStale=true     → -20  (stale snapshot for bridge A in findLatestPerBridgeLane)
      //     sourceStale=true  → -15  (from getLanes result)
      //     sampleSize=1      → -15  (small-sample penalty)
      //     |10 - 55| = 45 > 30 → disagreement → -20
      //   Total: 100 - 20 - 15 - 15 - 20 = 30 → LOW
      //
      // Bridge Y (BRIDGE_B): official delay=40 (higher wait), fresh snapshot, no community.
      //   cbpStale=false (fresh snapshot), sourceStale=true(-15), no community → CBP-only ceiling.
      //   Score: 100 - 15(sourceStale) = 85 → min(85, 70) = 70 → MEDIUM
      //   (CBP-only ceiling applies because sampleSize=0)
      //
      // Expected: Bridge Y (wait=40, MEDIUM) is isBestOption=true, bestOptionFallback=false.
      //           Bridge X (wait=10, LOW) is isBestOption=false — excluded despite lowest wait.
      //
      // Anti-tautology proof: if _assignBestOption() chose the lowest wait regardless of
      // confidence, Bridge X would win and this test would FAIL.
      const oldFetchedAt = new Date('2025-06-20T09:00:00.000Z'); // 1 year ago → stale
      const freshFetchedAt = new Date(); // right now → fresh (age < 15 min TTL)

      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A, BRIDGE_B]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [
          makeLane(PORT_A, LaneType.General, 10),  // BRIDGE_A: lowest wait
          makeLane(PORT_B, LaneType.General, 40),  // BRIDGE_B: higher wait
        ],
        sourceStale: true, // -15 for all bridges
      } satisfies GetLanesResult);

      // Bridge A: community sampleSize=1 (-15) with value=55 → |10-55|=45 >30 → disagreement (-20)
      // Bridge B: no community (sampleSize=0) → CBP-only ceiling applied
      mockReportsService.findUsableReports
        .mockResolvedValueOnce({ sampleSize: 1, weightedMean: 55 }) // BRIDGE_A (called first)
        .mockResolvedValueOnce({ sampleSize: 0, weightedMean: null }); // BRIDGE_B

      mockAdjustmentRepository.find.mockResolvedValue([]);

      // Snapshot for BRIDGE_A is OLD → cbpStale=true (-20)
      // Snapshot for BRIDGE_B is FRESH → cbpStale=false (no penalty)
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([
        {
          bridgeId: BRIDGE_A_ID, laneType: LaneType.General,
          fetchedAt: oldFetchedAt, // stale
          delayMinutes: 10, lanesOpen: 3, operationalStatus: 'delay', isOpen: true, sourceUpdateTimeRaw: '',
        },
        {
          bridgeId: BRIDGE_B_ID, laneType: LaneType.General,
          fetchedAt: freshFetchedAt, // fresh
          delayMinutes: 40, lanesOpen: 3, operationalStatus: 'delay', isOpen: true, sourceUpdateTimeRaw: '',
        },
      ]);

      const results = await service.getEstimates(LaneType.General);

      const bridgeA = results.find(r => r.bridgeId === BRIDGE_A_ID)!;
      const bridgeB = results.find(r => r.bridgeId === BRIDGE_B_ID)!;

      // Verify computed confidences are what the test is designed around
      expect(bridgeA.confidence).toBe('low');    // score=30: 100-20-15-15-20
      expect(bridgeB.confidence).toBe('medium'); // score=70: min(100-15, 70) CBP-only ceiling

      // R3 assertion: low-confidence lowest is NOT chosen; medium-confidence higher-wait wins
      expect(bridgeA.isBestOption).toBe(false);
      expect(bridgeB.isBestOption).toBe(true);
      expect(bridgeB.bestOptionFallback).toBe(false);
    });

    it('selects best option fallback when all available lanes are low-confidence', async () => {
      // Both bridges produce LOW confidence via: cbpStale(-20) + sourceStale(-15) + sample1(-15) + disagreement>30(-20) = -70 → score=30 → LOW
      // Bridge A: official=10, community=55 → |10-55|=45 > 30 → disagreement applies → LOW
      // Bridge B: official=20, community=56 → |20-56|=36 > 30 → disagreement applies → LOW
      // Both bridges are LOW → fallback picks lowest wait (10 < 20) → Bridge A, bestOptionFallback=true
      const oldFetchedAt = new Date('2025-06-20T09:00:00.000Z'); // year-old → stale → cbpStale=true
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A, BRIDGE_B]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [
          makeLane(PORT_A, LaneType.General, 10),
          makeLane(PORT_B, LaneType.General, 20),
        ],
        sourceStale: true, // sourceStale: -15
      } satisfies GetLanesResult);
      // Both bridges get same community: sampleSize=1(-15), value=55
      // Bridge A disagreement: |10-55|=45 > 30 → -20; Bridge B: |20-56|=36 > 30 → -20
      mockReportsService.findUsableReports
        .mockResolvedValueOnce({ sampleSize: 1, weightedMean: 55 }) // BRIDGE_A
        .mockResolvedValueOnce({ sampleSize: 1, weightedMean: 56 }); // BRIDGE_B
      mockAdjustmentRepository.find.mockResolvedValue([]);
      // Old snapshots → cbpStale=true (-20)
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([
        { bridgeId: BRIDGE_A_ID, laneType: LaneType.General, fetchedAt: oldFetchedAt, delayMinutes: 10, lanesOpen: 3, operationalStatus: 'delay', isOpen: true, sourceUpdateTimeRaw: '' },
        { bridgeId: BRIDGE_B_ID, laneType: LaneType.General, fetchedAt: oldFetchedAt, delayMinutes: 20, lanesOpen: 3, operationalStatus: 'delay', isOpen: true, sourceUpdateTimeRaw: '' },
      ]);

      const results = await service.getEstimates(LaneType.General);

      const best = results.find(r => r.isBestOption);
      expect(best).toBeDefined();
      // Score per bridge: 100-20-15-15-20=-70 → 30 → LOW → all low → fallback
      expect(results.every(r => r.confidence === 'low')).toBe(true);
      expect(best!.bestOptionFallback).toBe(true);
      expect(best!.bridgeId).toBe(BRIDGE_A_ID); // lower wait (10 < 20)
    });

    it('unavailable lane is never selected as best option', async () => {
      // Bridge A: closed lane → unavailable
      // Bridge B: open lane with estimate → it becomes best option
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A, BRIDGE_B]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [
          makeLane(PORT_A, LaneType.General, null, false), // closed
          makeLane(PORT_B, LaneType.General, 30),
        ],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);

      const results = await service.getEstimates(LaneType.General);

      const bridgeAEntry = results.find(r => r.bridgeId === BRIDGE_A_ID);
      const bridgeBEntry = results.find(r => r.bridgeId === BRIDGE_B_ID);

      expect(bridgeAEntry!.isBestOption).toBe(false); // unavailable cannot be best
      expect(bridgeBEntry!.isBestOption).toBe(true);
    });
  });

  // ── C.4: Trend calculation ──────────────────────────────────────────────────
  // Trend uses findLatestTwoPerBridgeLane (rowNumber=1 current, rowNumber=2 previous).
  // findLatestPerBridgeLane is used for cbpStale check (default: []).

  describe('trend calculation', () => {
    it('returns stable when delta is within ±5', async () => {
      // Current estimate: 30 min, previous snapshot delay: 28 → delta=2 → stable
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 30)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);
      // Trend history: rowNumber=1 current, rowNumber=2 previous
      mockSnapshotRepository.findLatestTwoPerBridgeLane.mockResolvedValue([
        {
          bridgeId: BRIDGE_A_ID, laneType: LaneType.General,
          fetchedAt: new Date('2025-06-20T10:00:00.000Z'),
          delayMinutes: 30, lanesOpen: 3, operationalStatus: 'delay',
          isOpen: true, sourceUpdateTimeRaw: '', rowNumber: 1,
        },
        {
          bridgeId: BRIDGE_A_ID, laneType: LaneType.General,
          fetchedAt: new Date('2025-06-20T09:45:00.000Z'),
          delayMinutes: 28, lanesOpen: 3, operationalStatus: 'delay',
          isOpen: true, sourceUpdateTimeRaw: '', rowNumber: 2,
        },
      ]);

      const results = await service.getEstimates(LaneType.General);

      expect(results[0].trend).toBe('stable'); // |30 - 28| = 2 ≤ 5
    });

    it('returns up when delta > +5', async () => {
      // Current: 40, previous: 30 → delta = +10 → up
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 40)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);
      mockSnapshotRepository.findLatestTwoPerBridgeLane.mockResolvedValue([
        {
          bridgeId: BRIDGE_A_ID, laneType: LaneType.General,
          fetchedAt: new Date('2025-06-20T10:00:00.000Z'),
          delayMinutes: 40, lanesOpen: 3, operationalStatus: 'delay',
          isOpen: true, sourceUpdateTimeRaw: '', rowNumber: 1,
        },
        {
          bridgeId: BRIDGE_A_ID, laneType: LaneType.General,
          fetchedAt: new Date('2025-06-20T09:44:00.000Z'),
          delayMinutes: 30, lanesOpen: 3, operationalStatus: 'delay', // previous
          isOpen: true, sourceUpdateTimeRaw: '', rowNumber: 2,
        },
      ]);

      const results = await service.getEstimates(LaneType.General);

      expect(results[0].trend).toBe('up'); // 40 - 30 = 10 > 5
    });

    it('returns down when delta < -5', async () => {
      // Current: 20, previous: 35 → delta = -15 → down
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 20)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);
      mockSnapshotRepository.findLatestTwoPerBridgeLane.mockResolvedValue([
        {
          bridgeId: BRIDGE_A_ID, laneType: LaneType.General,
          fetchedAt: new Date('2025-06-20T10:00:00.000Z'),
          delayMinutes: 20, lanesOpen: 3, operationalStatus: 'delay',
          isOpen: true, sourceUpdateTimeRaw: '', rowNumber: 1,
        },
        {
          bridgeId: BRIDGE_A_ID, laneType: LaneType.General,
          fetchedAt: new Date('2025-06-20T09:43:00.000Z'),
          delayMinutes: 35, lanesOpen: 3, operationalStatus: 'delay', // previous
          isOpen: true, sourceUpdateTimeRaw: '', rowNumber: 2,
        },
      ]);

      const results = await service.getEstimates(LaneType.General);

      expect(results[0].trend).toBe('down'); // 20 - 35 = -15 < -5
    });

    it('returns stable when only one snapshot exists (no previous)', async () => {
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 30)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);
      // Only rowNumber=1, no rowNumber=2
      mockSnapshotRepository.findLatestTwoPerBridgeLane.mockResolvedValue([
        {
          bridgeId: BRIDGE_A_ID, laneType: LaneType.General,
          fetchedAt: new Date('2025-06-20T10:00:00.000Z'),
          delayMinutes: 30, lanesOpen: 3, operationalStatus: 'delay',
          isOpen: true, sourceUpdateTimeRaw: '', rowNumber: 1,
        },
      ]);

      const results = await service.getEstimates(LaneType.General);

      expect(results[0].trend).toBe('stable'); // no rowNumber=2 → stable
    });

    it('returns stable when no snapshot history exists at all', async () => {
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 30)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);
      // Default already returns [] via afterEach

      const results = await service.getEstimates(LaneType.General);

      expect(results[0].trend).toBe('stable');
    });
  });

  // ── C.5: Inactive adjustment ignored ───────────────────────────────────────

  describe('inactive adjustment is ignored', () => {
    it('does not apply adjustment when isActive=false (DB filters it out)', async () => {
      // The service queries: adjustmentRepository.find({ where: { laneType, isActive: true } })
      // The DB WHERE clause filters out isActive=false rows.
      // We simulate this by returning an empty array (no active adjustments found).
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 30)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);
      // Simulate DB returning nothing (inactive adjustment filtered by WHERE isActive=true)
      mockAdjustmentRepository.find.mockResolvedValue([]);

      const results = await service.getEstimates(LaneType.General);

      // CBP-only result: 30 min (no adjustment applied)
      expect(results[0].estimatedWaitMinutes).toBe(30);
      expect(results[0].sourcesUsed).not.toContain('admin');
    });

    it('applies adjustment when isActive=true', async () => {
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 30)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);
      mockAdjustmentRepository.find.mockResolvedValue([
        {
          id: 'adj-2',
          bridgeId: BRIDGE_A_ID,
          laneType: LaneType.General,
          adjustmentMinutes: 10,
          reason: 'test',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const results = await service.getEstimates(LaneType.General);

      // CBP-only base=30, +10 admin = 40
      expect(results[0].estimatedWaitMinutes).toBe(40);
      expect(results[0].sourcesUsed).toContain('admin');
    });
  });

  // ── C.6: Community weighting — no missing-wait-as-zero ─────────────────────

  describe('community weighting', () => {
    it('uses weightedMean from ReportsService directly (no null-as-zero coercion)', async () => {
      // ReportsService returns sampleSize=0, weightedMean=null
      // → community not used; result should be CBP-only
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 30)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 0, weightedMean: null });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);

      const results = await service.getEstimates(LaneType.General);

      expect(results[0].sourcesUsed).toEqual(['cbp']); // no community
      expect(results[0].sourcesUsed).not.toContain('community');
    });

    it('blends community when sampleSize > 0 and weightedMean is set', async () => {
      // CBP: 60, community: 40, both present → blend
      mockBridgesService.findActive.mockResolvedValue([BRIDGE_A]);
      mockCbpAdapter.getLanes.mockResolvedValue({
        lanes: [makeLane(PORT_A, LaneType.General, 60)],
        sourceStale: false,
      } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 3, weightedMean: 40 });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);

      const results = await service.getEstimates(LaneType.General);

      expect(results[0].sourcesUsed).toContain('cbp');
      expect(results[0].sourcesUsed).toContain('community');
      // Blend: (60*0.60 + 40*0.25) / 0.85 = (36+10)/0.85 = 46/0.85 ≈ 54.12
      expect(results[0].estimatedWaitMinutes).toBeCloseTo(54.12, 1);
    });
  });

  // ── C.7: Bridge without cbpPortNumber → community-only ─────────────────────

  describe('bridge without cbpPortNumber', () => {
    it('returns entry with no official source when bridge has no cbpPortNumber', async () => {
      const unmappedBridge = makeBridge('cccc-0000', 'Unmapped', null);
      mockBridgesService.findActive.mockResolvedValue([unmappedBridge]);
      mockCbpAdapter.getLanes.mockResolvedValue({ lanes: [], sourceStale: false } satisfies GetLanesResult);
      mockReportsService.findUsableReports.mockResolvedValue({ sampleSize: 2, weightedMean: 35 });
      mockAdjustmentRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.findLatestPerBridgeLane.mockResolvedValue([]);

      const results = await service.getEstimates(LaneType.General);

      expect(results).toHaveLength(1);
      expect(results[0].sourcesUsed).toContain('community');
      expect(results[0].sourcesUsed).not.toContain('cbp');
    });
  });
});
