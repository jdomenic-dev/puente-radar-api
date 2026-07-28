/**
 * cbp-history-audit.report.spec.ts — RED-first tests for deterministic JSON report formatting.
 * No DB, no network — pure formatting only.
 */

import { formatCbpHistoryAuditReportJson } from './cbp-history-audit.report.js';
import { CbpHistoryAuditResult } from './cbp-history-audit.query.js';
import { createAuditDataSourceOptions, runAuditCommand } from './run-cbp-history-audit.js';
import { DataSource } from 'typeorm';

const RESULT: CbpHistoryAuditResult = {
  totalRows: 42,
  minFetchedAt: new Date('2026-07-01T00:00:00.000Z'),
  maxFetchedAt: new Date('2026-07-20T06:00:00.000Z'),
  uniqueBridgeLaneHourBuckets: 30,
  interArrivalGaps: { count: 41, minMinutes: 5, maxMinutes: 60, meanMinutes: 20, medianMinutes: 15 },
  duplicateConcentrationRate: 0.12345,
  nullDelayRate: 0.02,
  closedRate: 0.05,
  missingLaneRate: 0.5,
  fetchesByLocalHour: { 8: 5, 9: 7 },
};
const EMPTY_RESULT: CbpHistoryAuditResult = {
  totalRows: 0,
  minFetchedAt: null,
  maxFetchedAt: null,
  uniqueBridgeLaneHourBuckets: 0,
  interArrivalGaps: null,
  duplicateConcentrationRate: 0,
  nullDelayRate: 0,
  closedRate: 0,
  missingLaneRate: 0,
  fetchesByLocalHour: {},
};

describe('formatCbpHistoryAuditReportJson', () => {
  it('serializes real computed values with deterministic, stable key order across calls', () => {
    const json = formatCbpHistoryAuditReportJson(RESULT);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.totalRows).toBe(42);
    expect(parsed.uniqueBridgeLaneHourBuckets).toBe(30);
    expect(parsed).not.toHaveProperty('uniqueFetchInstants');
    expect(parsed.duplicateConcentrationRate).toBeCloseTo(0.12345, 5);
    expect(parsed.fetchesByLocalHour).toEqual({ '8': 5, '9': 7 });
    expect(formatCbpHistoryAuditReportJson(RESULT)).toBe(json);
  });

  it('serializes null date/gap fields as null, not undefined or omitted — triangulation case', () => {
    const parsed = JSON.parse(formatCbpHistoryAuditReportJson(EMPTY_RESULT)) as Record<string, unknown>;
    expect(parsed.minFetchedAt).toBeNull();
    expect(parsed.interArrivalGaps).toBeNull();
  });
});

describe('runAuditCommand', () => {
  it('preserves PostgreSQL settings while disabling all automatic schema changes', () => {
    // prettier-ignore
    expect(createAuditDataSourceOptions({ DATABASE_HOST: 'db', DATABASE_PORT: '5433', DATABASE_USER: 'audit', DATABASE_PASSWORD: 'secret', DATABASE_NAME: 'history' })).toMatchObject({
      type: 'postgres', host: 'db', port: 5433, username: 'audit', password: 'secret', database: 'history',
      synchronize: false, migrationsRun: false, logging: false,
    });
  });

  it('does not infer weakened TLS from production mode', () => {
    expect(createAuditDataSourceOptions({ NODE_ENV: 'production' })).toMatchObject({ ssl: false });
    expect(createAuditDataSourceOptions({ NODE_ENV: 'production', DATABASE_SSL: 'false' })).toMatchObject({
      ssl: false,
    });
  });

  it('enables certificate-authenticated TLS only when DATABASE_SSL is explicitly true', () => {
    expect(createAuditDataSourceOptions({ DATABASE_SSL: 'true' })).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });

  it('writes only JSON to stdout and destroys the connection on success or failure', async () => {
    const stdout = jest.fn();
    const stderr = jest.fn();
    // prettier-ignore
    const source = { initialize: jest.fn(), query: jest.fn().mockResolvedValue([]), destroy: jest.fn() } as unknown as DataSource;
    expect(await runAuditCommand(source, stdout, stderr)).toBe(0);
    expect(stdout).toHaveBeenCalledWith(`${formatCbpHistoryAuditReportJson(EMPTY_RESULT)}\n`);
    expect(stderr).not.toHaveBeenCalled();
    expect((source.destroy as jest.Mock).mock.calls).toHaveLength(1);

    // prettier-ignore
    const failure = { initialize: jest.fn(), query: jest.fn().mockRejectedValue(new Error('query failed')), destroy: jest.fn() } as unknown as DataSource;
    expect(await runAuditCommand(failure, stdout, stderr)).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('query failed'));
    expect((failure.destroy as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('reports cleanup rejection and returns failure instead of rejecting', async () => {
    const stdout = jest.fn();
    const stderr = jest.fn();
    // prettier-ignore
    const source = { initialize: jest.fn(), query: jest.fn().mockResolvedValue([]), destroy: jest.fn().mockRejectedValue(new Error('cleanup failed')) } as unknown as DataSource;

    await expect(runAuditCommand(source, stdout, stderr)).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith('CBP history audit cleanup failed: cleanup failed\n');
  });
});
