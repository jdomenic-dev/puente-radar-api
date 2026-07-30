/**
 * cbp.adapter.spec.ts
 *
 * Strict TDD — RED-first fixture tests for CbpAdapter.
 * No live network, no real DB. All I/O injected and mocked.
 *
 * Fixtures represent a realistic CBP API response for a subset of ports,
 * covering every edge case:
 *   - Normal delay (numeric string "10")
 *   - Empty delay_minutes ""
 *   - "N/A" delay_minutes
 *   - "Lanes Closed" operational_status
 *   - port_status "Closed" (whole port closed)
 *   - lanes_open "" vs "5"
 *   - An unknown port (should be filtered out)
 *
 * Tasks covered:
 *   B2.1 — lane mapping, empty/N-A/null unavailable, closed lanes/port, nullable lanesOpen
 *   B2.2 — port→bridge mapping, persist snapshot per bridge+lane, TTL stale fallback
 */

import { CbpAdapter, CbpApiPort } from './cbp.adapter.js';
import { WaitTimeSourceAdapter, NormalizedLane } from './wait-time-source.adapter.js';
import { LaneType } from '../../../common/enums/lane.enum.js';
import { CbpSnapshot } from '../entities/cbp-snapshot.entity.js';

// ---------------------------------------------------------------------------
// CBP API Fixture
// ---------------------------------------------------------------------------

/**
 * Minimal CBP API port fixture. Covers:
 *   - port 240201 (BOTA / Puente Libre) — mixed lane states
 *   - port 240202 (Paso del Norte) — all normal, non-zero delay
 *   - port 999999 — UNKNOWN port, must be filtered out
 *   - port 240203 (Ysleta) — port_status "Closed"
 */
const CBP_FIXTURE: CbpApiPort[] = [
  {
    // Port 240201 — BOTA / Puente Libre
    port_number: '240201',
    border: 'Mexican Border',
    port_name: 'El Paso',
    crossing_name: 'Bridge of the Americas (BOTA)',
    hours: '24/7',
    date: '6/19/2026',
    time: '13:00:42',
    port_status: 'Open',
    passenger_vehicle_lanes: {
      maximum_lanes: '8',
      standard_lanes: {
        // normal delay
        operational_status: 'delay',
        update_time: 'At 2:00 pm EDT',
        delay_minutes: '10',
        lanes_open: '5',
      },
      NEXUS_SENTRI_lanes: {
        // empty delay_minutes → null
        operational_status: 'no delay',
        update_time: 'At 2:00 pm EDT',
        delay_minutes: '',
        lanes_open: '2',
      },
      ready_lanes: {
        // N/A delay_minutes → null
        operational_status: 'no delay',
        update_time: '',
        delay_minutes: 'N/A',
        lanes_open: '',
      },
    },
    pedestrian_lanes: {
      standard_lanes: {
        // Lanes Closed → isOpen false
        operational_status: 'Lanes Closed',
        update_time: '',
        delay_minutes: 'N/A',
        lanes_open: '',
      },
    },
  },
  {
    // Port 240202 — Paso del Norte / Santa Fe — all lanes normal
    port_number: '240202',
    border: 'Mexican Border',
    port_name: 'El Paso',
    crossing_name: 'Paso del Norte',
    hours: '24/7',
    date: '6/19/2026',
    time: '13:00:42',
    port_status: 'Open',
    passenger_vehicle_lanes: {
      maximum_lanes: '6',
      standard_lanes: {
        operational_status: 'delay',
        update_time: 'At 2:00 pm EDT',
        delay_minutes: '25',
        lanes_open: '4',
      },
      NEXUS_SENTRI_lanes: {
        operational_status: 'no delay',
        update_time: 'At 2:00 pm EDT',
        delay_minutes: '0',
        lanes_open: '1',
      },
      ready_lanes: {
        operational_status: 'delay',
        update_time: 'At 2:00 pm EDT',
        delay_minutes: '15',
        lanes_open: '2',
      },
    },
    pedestrian_lanes: {
      standard_lanes: {
        operational_status: 'no delay',
        update_time: 'At 2:00 pm EDT',
        delay_minutes: '5',
        lanes_open: '3',
      },
    },
  },
  {
    // Port 999999 — completely unknown, must NOT appear in output
    port_number: '999999',
    border: 'Mexican Border',
    port_name: 'Unknown City',
    crossing_name: 'Unknown Bridge',
    hours: '8am-8pm',
    date: '6/19/2026',
    time: '13:00:42',
    port_status: 'Open',
    passenger_vehicle_lanes: {
      maximum_lanes: '2',
      standard_lanes: {
        operational_status: 'no delay',
        update_time: '',
        delay_minutes: '5',
        lanes_open: '2',
      },
      NEXUS_SENTRI_lanes: {
        operational_status: 'N/A',
        update_time: '',
        delay_minutes: 'N/A',
        lanes_open: '',
      },
      ready_lanes: {
        operational_status: 'N/A',
        update_time: '',
        delay_minutes: 'N/A',
        lanes_open: '',
      },
    },
    pedestrian_lanes: {
      standard_lanes: {
        operational_status: 'N/A',
        update_time: '',
        delay_minutes: 'N/A',
        lanes_open: '',
      },
    },
  },
  {
    // Port 240203 — Ysleta — port_status "Closed" → ALL lanes isOpen: false
    port_number: '240203',
    border: 'Mexican Border',
    port_name: 'El Paso',
    crossing_name: 'Ysleta / Zaragoza',
    hours: '24/7',
    date: '6/19/2026',
    time: '13:00:42',
    port_status: 'Closed',
    passenger_vehicle_lanes: {
      maximum_lanes: '4',
      standard_lanes: {
        operational_status: 'no delay',
        update_time: 'At 2:00 pm EDT',
        delay_minutes: '0',
        lanes_open: '3',
      },
      NEXUS_SENTRI_lanes: {
        operational_status: 'no delay',
        update_time: '',
        delay_minutes: '0',
        lanes_open: '1',
      },
      ready_lanes: {
        operational_status: 'N/A',
        update_time: '',
        delay_minutes: 'N/A',
        lanes_open: '',
      },
    },
    pedestrian_lanes: {
      standard_lanes: {
        operational_status: 'no delay',
        update_time: 'At 2:00 pm EDT',
        delay_minutes: '0',
        lanes_open: '2',
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Build a port→bridge map for the fixture ports. */
const PORT_TO_BRIDGE: Map<number, string> = new Map([
  [240201, 'bridge-uuid-1'],
  [240202, 'bridge-uuid-2'],
  [240203, 'bridge-uuid-3'],
  [240401, 'bridge-uuid-4'],
  [240204, 'bridge-uuid-5'],
  [240801, 'bridge-uuid-6'],
]);

const FIXED_NOW = new Date('2026-06-19T13:00:00.000Z');

/** Full snapshot row shape — mirrors every field _snapshotsToNormalizedLanes reads. */
export interface SnapshotRow {
  bridgeId: string;
  laneType: LaneType;
  fetchedAt: Date;
  delayMinutes: number | null;
  lanesOpen: number | null;
  operationalStatus: string | null;
  isOpen: boolean;
  sourceUpdateTimeRaw: string | null;
}

/** Build a minimal mock snapshot repository. */
function makeMockRepo(latestSnapshotRows: SnapshotRow[] = []) {
  return {
    save: jest.fn().mockResolvedValue(undefined),
    findLatestPerBridgeLane: jest.fn().mockResolvedValue(latestSnapshotRows),
  };
}

/** Build a fetch mock that resolves with the fixture JSON. */
function makeFetchMock(ports: CbpApiPort[] = CBP_FIXTURE) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(ports),
  });
}

/** Build a fetch mock that rejects (network failure / abort). */
function makeFailingFetchMock(error: Error = new Error('AbortError')) {
  return jest.fn().mockRejectedValue(error);
}

// ---------------------------------------------------------------------------
// Helpers to build adapter under test
// ---------------------------------------------------------------------------

function makeAdapter(
  fetchFn: jest.Mock,
  repo: ReturnType<typeof makeMockRepo>,
  opts: { baseUrl?: string; timeoutMs?: number; ttlMinutes?: number } = {},
) {
  return new CbpAdapter({
    baseUrl: opts.baseUrl ?? 'https://bwt.cbp.gov/api/waittimes',
    timeoutMs: opts.timeoutMs ?? 4000,
    ttlMinutes: opts.ttlMinutes ?? 15,
    fetchFn: fetchFn,
    snapshotRepo: repo,
  });
}

// ---------------------------------------------------------------------------
// B2.1 — Lane mapping
// ---------------------------------------------------------------------------

describe('CbpAdapter — lane type mapping', () => {
  let lanes: NormalizedLane[];
  let repo: ReturnType<typeof makeMockRepo>;

  beforeEach(async () => {
    repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
  });

  it('B2.1-a: maps passenger_vehicle_lanes.standard_lanes → general', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane).toBeDefined();
  });

  it('B2.1-b: maps passenger_vehicle_lanes.NEXUS_SENTRI_lanes → sentri', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.Sentri);
    expect(lane).toBeDefined();
  });

  it('B2.1-c: maps passenger_vehicle_lanes.ready_lanes → ready_lane', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.ReadyLane);
    expect(lane).toBeDefined();
  });

  it('B2.1-d: maps pedestrian_lanes.standard_lanes → pedestrian', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.Pedestrian);
    expect(lane).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// B2.1 — delay_minutes parsing: "", "N/A", null → null (NOT 0)
// ---------------------------------------------------------------------------

describe('CbpAdapter — delay_minutes parsing', () => {
  let lanes: NormalizedLane[];

  beforeEach(async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
  });

  it('B2.1-e: numeric string "10" → delayMinutes 10 (integer)', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.delayMinutes).toBe(10);
  });

  it('B2.1-f: empty string "" → delayMinutes null (NOT 0)', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.Sentri);
    expect(lane?.delayMinutes).toBeNull();
    expect(lane?.delayMinutes).not.toBe(0);
  });

  it('B2.1-g: "N/A" string → delayMinutes null (NOT 0)', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.ReadyLane);
    expect(lane?.delayMinutes).toBeNull();
    expect(lane?.delayMinutes).not.toBe(0);
  });

  it('B2.1-h: "0" numeric string → delayMinutes 0 (not null)', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240202 && l.laneType === LaneType.Sentri);
    expect(lane?.delayMinutes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B2.1 — lanes_open parsing: "" → null, "5" → 5
// ---------------------------------------------------------------------------

describe('CbpAdapter — lanes_open parsing', () => {
  let lanes: NormalizedLane[];

  beforeEach(async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
  });

  it('B2.1-i: numeric string "5" → lanesOpen 5', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.lanesOpen).toBe(5);
  });

  it('B2.1-j: empty string "" → lanesOpen null', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.ReadyLane);
    expect(lane?.lanesOpen).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B2.1 — isOpen logic: Lanes Closed status, N/A status, Closed port
// ---------------------------------------------------------------------------

describe('CbpAdapter — isOpen logic', () => {
  let lanes: NormalizedLane[];

  beforeEach(async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
  });

  it('B2.1-k: lane operational_status "Lanes Closed" → isOpen false', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.Pedestrian);
    expect(lane?.isOpen).toBe(false);
    expect(lane?.operationalStatus).toBe('Lanes Closed');
  });

  it('B2.1-l: lane operational_status "N/A" → isOpen false (240203 ready_lane)', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240203 && l.laneType === LaneType.ReadyLane);
    // port_status is "Closed" for 240203, so isOpen is false regardless
    expect(lane?.isOpen).toBe(false);
  });

  it('B2.1-m: port_status "Closed" → ALL lanes for that port are isOpen false', () => {
    const portLanes = lanes.filter((l) => l.cbpPortNumber === 240203);
    expect(portLanes.length).toBe(4); // general, sentri, ready_lane, pedestrian
    portLanes.forEach((l) => expect(l.isOpen).toBe(false));
  });

  it('B2.1-n: normal open port + delay status → isOpen true', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.isOpen).toBe(true);
  });

  it('B2.1-o: operational_status "no delay" → isOpen true', () => {
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.Sentri);
    expect(lane?.isOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B2.1 — fetchedAt is set to injected now
// ---------------------------------------------------------------------------

describe('CbpAdapter — fetchedAt', () => {
  it('B2.1-p: fetchedAt equals the injected now date', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.fetchedAt).toEqual(FIXED_NOW);
  });
});

// ---------------------------------------------------------------------------
// B2.1 — port filtering: unknown ports filtered out
// ---------------------------------------------------------------------------

describe('CbpAdapter — port filtering', () => {
  it('B2.1-q: unknown port_number 999999 is filtered out of results', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    const unknownLanes = lanes.filter((l) => l.cbpPortNumber === 999999);
    expect(unknownLanes).toHaveLength(0);
  });

  it('B2.1-r: known ports appear (4 lanes × 2 known ports in fixture = 8 lanes minimum)', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    // 240201 × 4 lanes + 240202 × 4 lanes + 240203 × 4 lanes = 12 (ignoring 999999)
    expect(lanes.length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// B2.1 — sourceUpdateTimeRaw preserved raw
// ---------------------------------------------------------------------------

describe('CbpAdapter — sourceUpdateTimeRaw', () => {
  it('B2.1-s: sourceUpdateTimeRaw preserves raw update_time string', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.sourceUpdateTimeRaw).toBe('At 2:00 pm EDT');
  });

  it('B2.1-t: empty update_time → sourceUpdateTimeRaw is empty string', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.ReadyLane);
    expect(lane?.sourceUpdateTimeRaw).toBe('');
  });
});

// ---------------------------------------------------------------------------
// B2.2 — Port→bridge mapping uses injected map
// ---------------------------------------------------------------------------

describe('CbpAdapter — port→bridge mapping', () => {
  it('B2.2-a: cbpPortNumber on returned lanes matches the port_number from fixture', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    const lane = lanes.find((l) => l.cbpPortNumber === 240201);
    expect(lane?.cbpPortNumber).toBe(240201);
  });
});

// ---------------------------------------------------------------------------
// B2.2 — Persistence: snapshot saved per bridge+lane on successful fetch
// ---------------------------------------------------------------------------

describe('CbpAdapter — persistence on successful fetch', () => {
  it('B2.2-b: repo.save is called once per bridge+lane combination (12 calls for 3 known ports × 4 lanes)', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    // 3 known ports in fixture (240201, 240202, 240203) × 4 lane types = 12
    expect(repo.save).toHaveBeenCalledTimes(12);
  });

  it('B2.2-c: repo.save called with correct shape for port 240201 general lane', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);

    const savedSnapshots = (repo.save.mock.calls as Array<[CbpSnapshot]>).map(([snapshot]) => snapshot);
    const snapshot = savedSnapshots.find((s) => s.bridgeId === 'bridge-uuid-1' && s.laneType === LaneType.General);

    expect(snapshot).toBeDefined();
    expect(snapshot!.bridgeId).toBe('bridge-uuid-1');
    expect(snapshot!.laneType).toBe(LaneType.General);
    expect(snapshot!.delayMinutes).toBe(10);
    expect(snapshot!.lanesOpen).toBe(5);
    expect(snapshot!.operationalStatus).toBe('delay');
    expect(snapshot!.isOpen).toBe(true);
    expect(snapshot!.fetchedAt).toEqual(FIXED_NOW);
  });

  it('B2.2-d: repo.save NOT called when fetch fails', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFailingFetchMock(), repo);
    // Should not throw; stale fallback used
    await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    expect(repo.save).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B2.2 — TTL: fresh snapshots → no fetch call
// ---------------------------------------------------------------------------

describe('CbpAdapter — TTL / fresh snapshots', () => {
  it('B2.2-e: full-coverage fresh cache (6 bridges × 4 lanes = 24 rows within TTL) → fetch NOT called', async () => {
    // Full coverage required: every bridge in PORT_TO_BRIDGE × every LaneType.
    // PORT_TO_BRIDGE has 6 bridges → 6 × 4 = 24 rows needed.
    const freshFetchedAt = new Date(FIXED_NOW.getTime() - 5 * 60_000);
    const allBridgeIds = [
      'bridge-uuid-1',
      'bridge-uuid-2',
      'bridge-uuid-3',
      'bridge-uuid-4',
      'bridge-uuid-5',
      'bridge-uuid-6',
    ];
    const allLanes = [LaneType.General, LaneType.Sentri, LaneType.ReadyLane, LaneType.Pedestrian];
    const fullRows: SnapshotRow[] = allBridgeIds.flatMap((bridgeId) =>
      allLanes.map((laneType) => ({
        bridgeId,
        laneType,
        fetchedAt: freshFetchedAt,
        delayMinutes: 10,
        lanesOpen: 2,
        operationalStatus: 'delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      })),
    );
    const repo = makeMockRepo(fullRows);
    const fetchFn = makeFetchMock();
    const adapter = makeAdapter(fetchFn, repo, { ttlMinutes: 15 });

    await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('B2.2-f: full-coverage cache but ALL stale (>TTL) → fetch IS called', async () => {
    // All 24 rows present but all stale → refresh triggered
    const staleFetchedAt = new Date(FIXED_NOW.getTime() - 20 * 60_000);
    const allBridgeIds = [
      'bridge-uuid-1',
      'bridge-uuid-2',
      'bridge-uuid-3',
      'bridge-uuid-4',
      'bridge-uuid-5',
      'bridge-uuid-6',
    ];
    const allLanes = [LaneType.General, LaneType.Sentri, LaneType.ReadyLane, LaneType.Pedestrian];
    const staleFullRows: SnapshotRow[] = allBridgeIds.flatMap((bridgeId) =>
      allLanes.map((laneType) => ({
        bridgeId,
        laneType,
        fetchedAt: staleFetchedAt,
        delayMinutes: 5,
        lanesOpen: 1,
        operationalStatus: 'no delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      })),
    );
    const repo = makeMockRepo(staleFullRows);
    const fetchFn = makeFetchMock();
    const adapter = makeAdapter(fetchFn, repo, { ttlMinutes: 15 });

    await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// B2.2 — Stale fallback: fetch fails AND prior snapshot exists → sourceStale true
// ---------------------------------------------------------------------------

describe('CbpAdapter — stale fallback on fetch failure', () => {
  it('B2.2-g: fetch throws + prior snapshot exists → returns snapshot with sourceStale true, no throw', async () => {
    const staleFetchedAt = new Date(FIXED_NOW.getTime() - 20 * 60_000);
    const staleRows: SnapshotRow[] = [
      {
        bridgeId: 'bridge-uuid-1',
        laneType: LaneType.General,
        fetchedAt: staleFetchedAt,
        delayMinutes: 10,
        lanesOpen: 3,
        operationalStatus: 'delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      },
      {
        bridgeId: 'bridge-uuid-1',
        laneType: LaneType.Sentri,
        fetchedAt: staleFetchedAt,
        delayMinutes: 5,
        lanesOpen: 2,
        operationalStatus: 'delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      },
    ];
    const repo = makeMockRepo(staleRows);
    const adapter = makeAdapter(makeFailingFetchMock(), repo, { ttlMinutes: 15 });

    const result = await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    expect(result.sourceStale).toBe(true);
    expect(result.lanes).toBeDefined();
  });

  it('B2.2-h: fetch throws + NO prior snapshot → returns empty lanes with sourceStale true, no throw', async () => {
    const repo = makeMockRepo([]); // no prior snapshots
    const adapter = makeAdapter(makeFailingFetchMock(), repo, { ttlMinutes: 15 });

    const result = await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    expect(result.sourceStale).toBe(true);
    expect(result.lanes).toHaveLength(0);
  });

  it('B2.2-i: fetch succeeds → sourceStale is false', async () => {
    // No existing snapshots → definitely stale trigger
    const repo = makeMockRepo([]);
    const adapter = makeAdapter(makeFetchMock(), repo, { ttlMinutes: 15 });

    const result = await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    expect(result.sourceStale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B2.2 — AbortController timeout simulation
// ---------------------------------------------------------------------------

describe('CbpAdapter — timeout via AbortController', () => {
  it('B2.2-j: fetch rejects with AbortError → treated as fetch failure (no throw, stale fallback)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    const repo = makeMockRepo([]);
    const adapter = makeAdapter(makeFailingFetchMock(abortError), repo, { ttlMinutes: 15 });

    // Must not throw; must return gracefully
    const result = await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);
    expect(result.sourceStale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B2.2 — HTTP non-ok response treated as failure
// ---------------------------------------------------------------------------

describe('CbpAdapter — HTTP error handling', () => {
  it('B2.2-k: non-ok HTTP response → treated as fetch failure (no throw, stale fallback)', async () => {
    const badFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('no body')),
    });

    const repo = makeMockRepo([]);
    const adapter = makeAdapter(badFetch, repo, { ttlMinutes: 15 });

    const result = await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);
    expect(result.sourceStale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B2.2 — Adapter implements WaitTimeSourceAdapter interface
// ---------------------------------------------------------------------------

describe('CbpAdapter — interface compliance', () => {
  it('B2.2-l: CbpAdapter satisfies WaitTimeSourceAdapter', () => {
    const repo = makeMockRepo();
    const adapter: WaitTimeSourceAdapter = makeAdapter(makeFetchMock(), repo);
    expect(typeof adapter.fetchAll).toBe('function');
  });
});

// ===========================================================================
// GATE-FIX 1 — Stale-fallback must preserve real snapshot field values
// ===========================================================================

describe('CbpAdapter — stale fallback preserves snapshot values (GATE-FIX 1)', () => {
  it('GF1-a: returned lanes carry actual delayMinutes/lanesOpen/operationalStatus/isOpen/sourceUpdateTimeRaw from snapshot', async () => {
    const staleFetchedAt = new Date(FIXED_NOW.getTime() - 20 * 60_000);
    const staleRows: SnapshotRow[] = [
      {
        bridgeId: 'bridge-uuid-1',
        laneType: LaneType.General,
        fetchedAt: staleFetchedAt,
        delayMinutes: 42,
        lanesOpen: 3,
        operationalStatus: 'delay',
        isOpen: true,
        sourceUpdateTimeRaw: 'At 1:00 pm EDT',
      },
    ];
    const repo = makeMockRepo(staleRows);
    const adapter = makeAdapter(makeFailingFetchMock(), repo, { ttlMinutes: 15 });

    const result = await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    expect(result.sourceStale).toBe(true);
    expect(result.lanes).toHaveLength(1);

    const lane = result.lanes[0];
    expect(lane.delayMinutes).toBe(42); // NOT null — must come from snapshot
    expect(lane.lanesOpen).toBe(3); // NOT null
    expect(lane.operationalStatus).toBe('delay'); // NOT ''
    expect(lane.isOpen).toBe(true); // NOT false (default)
    expect(lane.sourceUpdateTimeRaw).toBe('At 1:00 pm EDT'); // NOT ''
    expect(lane.fetchedAt).toEqual(staleFetchedAt);
  });

  it('GF1-b: closed snapshot (isOpen=false) preserved as-is, not defaulted to false by coincidence', async () => {
    // This test is structurally distinct: isOpen comes from the snapshot (false),
    // NOT from the default. We verify by also checking other non-default fields.
    const staleFetchedAt = new Date(FIXED_NOW.getTime() - 25 * 60_000);
    const staleRows: SnapshotRow[] = [
      {
        bridgeId: 'bridge-uuid-2',
        laneType: LaneType.Pedestrian,
        fetchedAt: staleFetchedAt,
        delayMinutes: null,
        lanesOpen: null,
        operationalStatus: 'Lanes Closed',
        isOpen: false,
        sourceUpdateTimeRaw: '',
      },
    ];
    const repo = makeMockRepo(staleRows);
    const adapter = makeAdapter(makeFailingFetchMock(), repo, { ttlMinutes: 15 });

    const result = await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    expect(result.sourceStale).toBe(true);
    const lane = result.lanes.find((l) => l.laneType === LaneType.Pedestrian);
    expect(lane?.operationalStatus).toBe('Lanes Closed'); // proves real value, not default ''
    expect(lane?.isOpen).toBe(false);
  });
});

// ===========================================================================
// GATE-FIX 2 — Partial cache must NOT suppress refresh
// ===========================================================================

describe('CbpAdapter — partial cache triggers refresh (GATE-FIX 2)', () => {
  it('GF2-a: cache with only one bridge while map has multiple → fetch IS attempted', async () => {
    // PORT_TO_BRIDGE has 6 bridges (bridge-uuid-1..6), expected = 6×4 = 24 combos.
    // Cache has only 4 rows for bridge-uuid-1 → partial → must attempt refresh.
    const freshFetchedAt = new Date(FIXED_NOW.getTime() - 5 * 60_000); // within TTL
    const partialRows: SnapshotRow[] = [
      {
        bridgeId: 'bridge-uuid-1',
        laneType: LaneType.General,
        fetchedAt: freshFetchedAt,
        delayMinutes: 10,
        lanesOpen: 5,
        operationalStatus: 'delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      },
      {
        bridgeId: 'bridge-uuid-1',
        laneType: LaneType.Sentri,
        fetchedAt: freshFetchedAt,
        delayMinutes: null,
        lanesOpen: 2,
        operationalStatus: 'no delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      },
      {
        bridgeId: 'bridge-uuid-1',
        laneType: LaneType.ReadyLane,
        fetchedAt: freshFetchedAt,
        delayMinutes: null,
        lanesOpen: null,
        operationalStatus: 'no delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      },
      {
        bridgeId: 'bridge-uuid-1',
        laneType: LaneType.Pedestrian,
        fetchedAt: freshFetchedAt,
        delayMinutes: null,
        lanesOpen: null,
        operationalStatus: 'no delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      },
    ];
    const repo = makeMockRepo(partialRows);
    const fetchFn = makeFetchMock();
    const adapter = makeAdapter(fetchFn, repo, { ttlMinutes: 15 });

    await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    // Must have attempted a refresh because coverage is incomplete
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('GF2-b: full coverage (all bridge×lane combos for portToBridgeMap) + all fresh → fetch NOT called', async () => {
    // PORT_TO_BRIDGE = 6 bridges × 4 lanes = 24 expected combos.
    const freshFetchedAt = new Date(FIXED_NOW.getTime() - 5 * 60_000);
    const allBridgeIds = [
      'bridge-uuid-1',
      'bridge-uuid-2',
      'bridge-uuid-3',
      'bridge-uuid-4',
      'bridge-uuid-5',
      'bridge-uuid-6',
    ];
    const allLaneTypes = [LaneType.General, LaneType.Sentri, LaneType.ReadyLane, LaneType.Pedestrian];
    const fullRows: SnapshotRow[] = allBridgeIds.flatMap((bridgeId) =>
      allLaneTypes.map((laneType) => ({
        bridgeId,
        laneType,
        fetchedAt: freshFetchedAt,
        delayMinutes: 10,
        lanesOpen: 2,
        operationalStatus: 'delay',
        isOpen: true,
        sourceUpdateTimeRaw: '',
      })),
    );

    const repo = makeMockRepo(fullRows);
    const fetchFn = makeFetchMock();
    const adapter = makeAdapter(fetchFn, repo, { ttlMinutes: 15 });

    await adapter.getLanes(PORT_TO_BRIDGE, FIXED_NOW);

    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// WARNING 5 — null/undefined delay_minutes and lanes_open (not just ""/"N/A")
// ===========================================================================

describe('CbpAdapter — null/undefined field parsing (WARNING 5)', () => {
  it('W5-a: delay_minutes literally null in API → delayMinutes null', async () => {
    const portWithNullDelay: CbpApiPort[] = [
      {
        port_number: '240201',
        border: 'Mexican Border',
        port_name: 'El Paso',
        crossing_name: 'BOTA',
        hours: '24/7',
        date: '6/19/2026',
        time: '13:00:00',
        port_status: 'Open',
        passenger_vehicle_lanes: {
          standard_lanes: {
            operational_status: 'no delay',
            update_time: '',
            delay_minutes: null as unknown as string, // literal null from API
            lanes_open: '3',
          },
          NEXUS_SENTRI_lanes: undefined,
          ready_lanes: undefined,
        },
        pedestrian_lanes: { standard_lanes: undefined },
      },
    ];
    const repo = makeMockRepo();
    const adapter = makeAdapter(
      jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(portWithNullDelay) }),
      repo,
    );
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.delayMinutes).toBeNull();
  });

  it('W5-b: delay_minutes literally undefined in API → delayMinutes null', async () => {
    const portWithUndefinedDelay: CbpApiPort[] = [
      {
        port_number: '240201',
        border: 'Mexican Border',
        port_name: 'El Paso',
        crossing_name: 'BOTA',
        hours: '24/7',
        date: '6/19/2026',
        time: '13:00:00',
        port_status: 'Open',
        passenger_vehicle_lanes: {
          standard_lanes: {
            operational_status: 'no delay',
            update_time: '',
            delay_minutes: undefined as unknown as string, // literal undefined
            lanes_open: '3',
          },
          NEXUS_SENTRI_lanes: undefined,
          ready_lanes: undefined,
        },
        pedestrian_lanes: { standard_lanes: undefined },
      },
    ];
    const repo = makeMockRepo();
    const adapter = makeAdapter(
      jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(portWithUndefinedDelay) }),
      repo,
    );
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.delayMinutes).toBeNull();
  });

  it('W5-c: lanes_open literally null in API → lanesOpen null', async () => {
    const portWithNullLanesOpen: CbpApiPort[] = [
      {
        port_number: '240201',
        border: 'Mexican Border',
        port_name: 'El Paso',
        crossing_name: 'BOTA',
        hours: '24/7',
        date: '6/19/2026',
        time: '13:00:00',
        port_status: 'Open',
        passenger_vehicle_lanes: {
          standard_lanes: {
            operational_status: 'delay',
            update_time: '',
            delay_minutes: '10',
            lanes_open: null as unknown as string, // literal null
          },
          NEXUS_SENTRI_lanes: undefined,
          ready_lanes: undefined,
        },
        pedestrian_lanes: { standard_lanes: undefined },
      },
    ];
    const repo = makeMockRepo();
    const adapter = makeAdapter(
      jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(portWithNullLanesOpen) }),
      repo,
    );
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.lanesOpen).toBeNull();
  });
});

// ===========================================================================
// WARNING 6 — AbortSignal passed to fetch (strengthen timeout test)
// ===========================================================================

describe('CbpAdapter — AbortSignal passed to fetch (WARNING 6)', () => {
  it('W6-a: fetch is called with a second argument containing a signal property', async () => {
    const repo = makeMockRepo();
    const fetchFn = makeFetchMock();
    const adapter = makeAdapter(fetchFn, repo);

    await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init).toBeDefined();
    expect(init.signal).toBeDefined();
    // Signal must be an AbortSignal
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

// ===========================================================================
// PR3 — Persistence seam: fetchAndNormalize (side-effect-free) (tasks 3.1-3.2)
// ===========================================================================

describe('CbpAdapter — fetchAndNormalize (persistence-seam extraction)', () => {
  it('B3.1-a: fetchAndNormalize never calls repo.save', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    await adapter.fetchAndNormalize(PORT_TO_BRIDGE, FIXED_NOW);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('B3.1-b: fetchAndNormalize never calls repo.findLatestPerBridgeLane', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    await adapter.fetchAndNormalize(PORT_TO_BRIDGE, FIXED_NOW);
    expect(repo.findLatestPerBridgeLane).not.toHaveBeenCalled();
  });

  it('B3.1-c: fetchAndNormalize returns the same normalized lanes fetchAll would derive (12 lanes for 3 known ports)', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    const lanes = await adapter.fetchAndNormalize(PORT_TO_BRIDGE, FIXED_NOW);
    expect(lanes.length).toBe(12);
    const lane = lanes.find((l) => l.cbpPortNumber === 240201 && l.laneType === LaneType.General);
    expect(lane?.delayMinutes).toBe(10);
  });

  it('B3.1-d: fetchAndNormalize on fetch failure returns [] without throwing', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFailingFetchMock(), repo);
    const lanes = await adapter.fetchAndNormalize(PORT_TO_BRIDGE, FIXED_NOW);
    expect(lanes).toEqual([]);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('B3.2-a: fetchAll still composes fetchAndNormalize + persist — repo.save called once per lane (regression, unchanged call count)', async () => {
    const repo = makeMockRepo();
    const adapter = makeAdapter(makeFetchMock(), repo);
    const lanes = await adapter.fetchAll(PORT_TO_BRIDGE, FIXED_NOW);
    expect(lanes.length).toBe(12);
    expect(repo.save).toHaveBeenCalledTimes(12);
  });
});
