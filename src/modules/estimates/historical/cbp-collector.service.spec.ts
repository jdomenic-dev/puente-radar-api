/**
 * Strict TDD — RED-first unit coverage for CbpCollectorService (task 4.3).
 * All I/O is mocked; the real advisory lock + partial unique index were
 * validated separately as a scratch runtime harness (task 4.8 — see
 * apply-progress). Builders return raw jest.fn() refs, never a property
 * access on a class-typed cast (avoids @typescript-eslint/unbound-method).
 */

import { CbpCollectorService } from './cbp-collector.service.js';
import { CbpCollectionRunStatus } from './entities/cbp-collection-run.entity.js';
import { LaneType } from '../../../common/enums/lane.enum.js';
import { BridgeStatus } from '../../../common/enums/bridge.enum.js';
import type { Bridge } from '../../bridges/entities/bridge.entity.js';
import type { DataSource, Repository } from 'typeorm';
import type { ConfigService } from '@nestjs/config';
import type { CbpAdapter } from '../sources/cbp.adapter.js';
import type { CbpSnapshotCustomRepository } from '../cbp-snapshot.repository.js';
import type { BridgesService } from '../../bridges/bridges.service.js';
import type { CbpCollectionRun } from './entities/cbp-collection-run.entity.js';

const FIXED_NOW = new Date('2026-06-19T13:07:00.000Z'); // floors to 13:00 on a 15-min cadence
const FLOORED_SLOT = new Date('2026-06-19T13:00:00.000Z');
const BRIDGE_1: Bridge = {
  id: 'bridge-1',
  name: 'Test',
  slug: 'bridge-1',
  status: BridgeStatus.Low,
  waitMinutes: null,
  trend: null,
  cbpPortNumber: 240201,
  sortOrder: 0,
  lastUpdatedAt: null,
  reports: [],
};
const makeBridge = (id: string, cbpPortNumber: number): Bridge => ({ ...BRIDGE_1, id, slug: id, cbpPortNumber });

function makeLane(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    cbpPortNumber: 240201,
    laneType: LaneType.General,
    delayMinutes: 10,
    lanesOpen: 5,
    operationalStatus: 'delay',
    isOpen: true,
    sourceUpdateTimeRaw: '',
    fetchedAt: FIXED_NOW,
    ...overrides,
  };
}

function makeService(opts: {
  lockAcquired?: boolean;
  configOverrides?: Record<string, unknown>;
  lanes?: ReturnType<typeof makeLane>[];
  insertResults?: boolean[];
  bridges?: Bridge[];
  /** Simulates a real upstream CBP failure — mirrors CbpAdapter.fetchAndNormalize's real contract: rejects ONLY when called with { rethrowOnFailure: true }, otherwise resolves (matching the swallow-by-default behavior fetchAll/getLanes rely on). */
  failUpstream?: boolean;
}) {
  const lockRow = () => Promise.resolve([{ locked: opts.lockAcquired ?? true }]);
  const connect = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn().mockImplementation((sql: string) => (sql.includes('pg_try_advisory_lock') ? lockRow() : []));
  const release = jest.fn().mockResolvedValue(undefined);
  const ds = { createQueryRunner: () => ({ connect, query, release }) } as unknown as DataSource;
  const values: Record<string, unknown> = {
    HISTORICAL_COLLECTION_ENABLED: 'true',
    HISTORICAL_CADENCE_MINUTES: 15,
    ...opts.configOverrides,
  };
  const cfg = { get: (k: string) => values[k] } as unknown as ConfigService;
  const fetchAndNormalize = jest
    .fn()
    .mockImplementation((_map: unknown, _now: unknown, options?: { rethrowOnFailure?: boolean }) =>
      opts.failUpstream && options?.rethrowOnFailure
        ? Promise.reject(new Error('cbp unreachable'))
        : Promise.resolve(opts.lanes ?? [makeLane()]),
    );
  const fetchAll = jest.fn();
  const adapter = { fetchAndNormalize, fetchAll } as unknown as CbpAdapter;
  const saveSlotSnapshot = jest.fn();
  (opts.insertResults ?? [true]).forEach((r) => saveSlotSnapshot.mockResolvedValueOnce(r));
  saveSlotSnapshot.mockResolvedValue(true);
  const snap = { saveSlotSnapshot, save: jest.fn() } as unknown as CbpSnapshotCustomRepository;
  const findActive = jest.fn().mockResolvedValue(opts.bridges ?? [BRIDGE_1]);
  const brg = { findActive } as unknown as BridgesService;
  const createRun = jest.fn((p: Partial<CbpCollectionRun>) => p as CbpCollectionRun);
  const saveRun = jest.fn().mockResolvedValue(undefined);
  const run = { create: createRun, save: saveRun } as unknown as Repository<CbpCollectionRun>;
  const service = new CbpCollectorService(ds, cfg, adapter, snap, brg, run);
  return { service, connect, query, release, fetchAndNormalize, fetchAll, saveSlotSnapshot, createRun, saveRun };
}

describe('CbpCollectorService', () => {
  it('4.3-a/e: no-op when disabled, and when the advisory lock is held by another instance', async () => {
    const disabled = makeService({ configOverrides: { HISTORICAL_COLLECTION_ENABLED: 'false' } });
    await disabled.service.collect();
    expect(disabled.fetchAndNormalize).not.toHaveBeenCalled();
    expect(disabled.connect).not.toHaveBeenCalled();
    expect(disabled.saveRun).not.toHaveBeenCalled();

    const lockHeld = makeService({ lockAcquired: false });
    await lockHeld.service.collect();
    expect(lockHeld.fetchAndNormalize).not.toHaveBeenCalled();
    expect(lockHeld.saveRun).not.toHaveBeenCalled();
  });

  it('4.3-b: fetches once, never fetchAll, releases the lock via the same QueryRunner', async () => {
    const s = makeService({});
    await s.service.collect();
    expect(s.fetchAndNormalize).toHaveBeenCalledTimes(1);
    expect(s.fetchAll).not.toHaveBeenCalled();
    const calls = s.query.mock.calls as Array<[string]>;
    expect(calls.some(([sql]) => sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(s.release).toHaveBeenCalledTimes(1);
  });

  it('4.3-d: saveSlotSnapshot receives a non-null slotStart floored to HISTORICAL_CADENCE_MINUTES', async () => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
    try {
      const s = makeService({});
      await s.service.collect();
      const [row] = s.saveSlotSnapshot.mock.calls[0] as [{ slotStart: Date }];
      expect(row.slotStart).toEqual(FLOORED_SLOT);
    } finally {
      jest.useRealTimers();
    }
  });

  it('4.3-g/h: run-health row captures bridge/lane counts, and conflict-suppressed duplicates', async () => {
    const ok = makeService({});
    await ok.service.collect();
    expect(ok.saveRun).toHaveBeenCalledTimes(1);
    const [okRow] = ok.createRun.mock.calls[0];
    expect(okRow.status).toBe(CbpCollectionRunStatus.Success);
    expect(okRow.bridgesCovered).toBe(1);
    expect(okRow.lanesCovered).toBe(1);
    expect(okRow.duplicatesSuppressed).toBe(0);

    const lanes = [makeLane(), makeLane({ laneType: LaneType.Sentri })];
    const dup = makeService({ lanes, insertResults: [true, false] });
    await dup.service.collect();
    expect(dup.createRun.mock.calls[0][0].duplicatesSuppressed).toBe(1);
  });

  it('4.3-i: a genuine upstream failure (adapter rejects only when rethrowOnFailure is requested) is caught, never thrown, and recorded as a Failure run-health row — proves the collector actually requests rethrowOnFailure, not just that some mock unconditionally rejects', async () => {
    const s = makeService({ failUpstream: true });
    await expect(s.service.collect()).resolves.toBeUndefined();
    expect(s.fetchAndNormalize).toHaveBeenCalledWith(expect.any(Map), expect.any(Date), { rethrowOnFailure: true });
    expect(s.saveRun).toHaveBeenCalledTimes(1);
    const [row] = s.createRun.mock.calls[0];
    expect(row.status).toBe(CbpCollectionRunStatus.Failure);
    expect(row.error).toContain('cbp unreachable');
  });

  it('4.3-k: bridgesCovered reflects actual bridge IDs present in the fetched lanes, not the pre-fetch target — reveals a partial/degraded CBP response', async () => {
    const bridges = [makeBridge('bridge-1', 240201), makeBridge('bridge-2', 240202)];

    const fullLanes = [makeLane({ cbpPortNumber: 240201 }), makeLane({ cbpPortNumber: 240202 })];
    const full = makeService({ bridges, lanes: fullLanes, insertResults: [true, true] });
    await full.service.collect();
    expect(full.createRun.mock.calls[0][0].bridgesCovered).toBe(2);

    // Only bridge-1's port appears in the returned lanes — bridge-2 is silently missing.
    const partialLanes = [makeLane({ cbpPortNumber: 240201 })];
    const partial = makeService({ bridges, lanes: partialLanes, insertResults: [true] });
    await partial.service.collect();
    expect(partial.createRun.mock.calls[0][0].bridgesCovered).toBe(1); // NOT 2 (the pre-fetch expected count)
  });
});
