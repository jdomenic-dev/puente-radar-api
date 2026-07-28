/**
 * cbp-history-audit.query.spec.ts — RED-first tests for the read-only CBP production-history audit.
 * `computeCbpHistoryAuditMetrics` is pure (no DB); `fetchCbpHistoryAuditRows` is tested against a
 * mocked DataSource to prove the SQL is read-only.
 */

import { DataSource } from 'typeorm';
import {
  computeCbpHistoryAuditMetrics,
  fetchCbpHistoryAuditRows,
  AUDIT_DEFAULT_TIMEZONE,
  CbpHistoryAuditRow,
} from './cbp-history-audit.query.js';
import { LaneType } from '../../common/enums/lane.enum.js';

const BRIDGE_A = 'bridge-a';
const BRIDGE_B = 'bridge-b';

function row(
  bridgeId: string,
  laneType: LaneType,
  iso: string,
  delayMinutes: number | null = 5,
  isOpen = true,
): CbpHistoryAuditRow {
  return { bridgeId, laneType, fetchedAt: new Date(iso), isOpen, delayMinutes };
}

describe('computeCbpHistoryAuditMetrics', () => {
  it('returns a zeroed result for an empty fixture (no fabricated coverage)', () => {
    const result = computeCbpHistoryAuditMetrics([]);
    expect(result).toMatchObject({ totalRows: 0, minFetchedAt: null, maxFetchedAt: null, interArrivalGaps: null });
  });

  it('computes coverage/rate metrics from a seeded fixture spanning 2 bridges, 2 local hours', () => {
    expect(AUDIT_DEFAULT_TIMEZONE).toBe('America/Ciudad_Juarez');
    const rows = [
      row(BRIDGE_A, LaneType.General, '2026-07-20T14:00:00.000Z', 5, true), // 08:00 local (UTC-6)
      row(BRIDGE_A, LaneType.General, '2026-07-20T14:10:00.000Z', null, true), // same local hour -> 1 instant
      row(BRIDGE_A, LaneType.Sentri, '2026-07-20T15:00:00.000Z', null, false), // 09:00 local, closed
      row(BRIDGE_B, LaneType.General, '2026-07-20T13:45:00.000Z', 3, true), // 07:45 local
    ];
    const result = computeCbpHistoryAuditMetrics(rows);

    expect(result.totalRows).toBe(4);
    expect(result.minFetchedAt).toEqual(new Date('2026-07-20T13:45:00.000Z'));
    expect(result.maxFetchedAt).toEqual(new Date('2026-07-20T15:00:00.000Z'));
    expect(result.uniqueFetchInstants).toBe(3); // (A,General,08h) + (A,Sentri,09h) + (B,General,07h)
    expect(result.nullDelayRate).toBeCloseTo(0.5, 5);
    expect(result.closedRate).toBeCloseTo(0.25, 5);
    expect(result.missingLaneRate).toBeCloseTo(5 / 8, 5); // 2 bridges x 4 lane types = 8 expected, 3 observed
    expect(result.fetchesByLocalHour).toEqual({ 7: 1, 8: 2, 9: 1 });
  });

  it('computes real median (not just mean) inter-arrival gaps, triangulated against the empty-fixture null case', () => {
    const rows = [
      row(BRIDGE_A, LaneType.General, '2026-07-20T06:00:00.000Z'),
      row(BRIDGE_A, LaneType.General, '2026-07-20T06:05:00.000Z'), // gap 5
      row(BRIDGE_A, LaneType.General, '2026-07-20T06:15:00.000Z'), // gap 10
      row(BRIDGE_A, LaneType.General, '2026-07-20T06:55:00.000Z'), // gap 40
    ];
    const gaps = computeCbpHistoryAuditMetrics(rows).interArrivalGaps;
    // mean = (5+10+40)/3 = 18.33..., median = 10 — distinct values prove median is computed, not aliased to mean.
    expect(gaps).toEqual({ count: 3, minMinutes: 5, maxMinutes: 40, meanMinutes: 55 / 3, medianMinutes: 10 });
  });

  it('flags duplicate/near-duplicate concentration within the same 1-minute window', () => {
    const rows = [
      row(BRIDGE_A, LaneType.General, '2026-07-20T06:00:00.000Z'),
      row(BRIDGE_A, LaneType.General, '2026-07-20T06:00:20.000Z'), // duplicate burst with the row above
      row(BRIDGE_A, LaneType.General, '2026-07-20T06:15:00.000Z'), // isolated, no duplicate
    ];
    expect(computeCbpHistoryAuditMetrics(rows).duplicateConcentrationRate).toBeCloseTo(2 / 3, 5);
  });

  it('detects near-duplicates across fixed minute boundaries', () => {
    const rows = ['06:00:50', '06:01:10', '06:03:00'].map((time) =>
      row(BRIDGE_A, LaneType.General, `2026-07-20T${time}.000Z`),
    );
    expect(computeCbpHistoryAuditMetrics(rows).duplicateConcentrationRate).toBeCloseTo(2 / 3, 5);
  });
});

describe('fetchCbpHistoryAuditRows', () => {
  function rawRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      bridgeId: BRIDGE_A,
      laneType: LaneType.General,
      fetchedAt: '2026-07-20T06:00:00.000Z',
      isOpen: true,
      delayMinutes: '7',
      ...overrides,
    };
  }

  it('issues one read-only SELECT and maps raw rows, preserving null delayMinutes (triangulated)', async () => {
    const query = jest.fn().mockResolvedValueOnce([rawRow()]);
    const withDelay = await fetchCbpHistoryAuditRows({ query } as unknown as DataSource);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toMatch(/SELECT/i);
    expect(sql).toMatch(/cbp_snapshots/);
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|DROP|ALTER/i);
    expect(withDelay[0].fetchedAt).toEqual(new Date('2026-07-20T06:00:00.000Z'));
    expect(withDelay[0].delayMinutes).toBe(7); // string '7' parsed to number, never coerced/truncated to 0

    const nullQuery = jest.fn().mockResolvedValue([rawRow({ isOpen: false, delayMinutes: null })]);
    const withNullDelay = await fetchCbpHistoryAuditRows({ query: nullQuery } as unknown as DataSource);
    expect(withNullDelay[0].delayMinutes).toBeNull(); // never coerced to 0
    expect(withNullDelay[0].isOpen).toBe(false);
  });
});
