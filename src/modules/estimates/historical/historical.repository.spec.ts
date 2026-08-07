import { HistoricalRepository } from './historical.repository.js';
import { LaneType } from '../../../common/enums/lane.enum.js';

describe('HistoricalRepository', () => {
  it('uses canonical local-time SQL, excludes request rows, and passes only parameterized values', async () => {
    const query = jest.fn().mockResolvedValue([{ bridgeId: 'bridge-1', median: '20', p25: '10', p75: '30', observationCount: '8', comparableLocalDates: '6', coverageStart: '2026-03-01', coverageEnd: '2026-03-06', coverageRatio: '0.8', closureRate: '0.25' }]);
    const result = await new HistoricalRepository({ query } as never).findPatterns(LaneType.General, 1, '06:00', 'America/Ciudad_Juarez');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"slotStart" IS NOT NULL');
    expect(sql).toContain("AT TIME ZONE $4");
    expect(sql).toContain('percentile_cont');
    expect(sql).not.toContain('sourceUpdateTimeRaw');
    expect(params).toEqual([LaneType.General, 1, '06:00', 'America/Ciudad_Juarez']);
    expect(result[0]).toEqual(expect.objectContaining({ median: 20, comparableLocalDates: 6, closureRate: 0.25 }));
  });

  it('keeps closure rate separate when a bin has no open wait observations', async () => {
    const query = jest.fn().mockResolvedValue([{ bridgeId: 'bridge-1', median: null, p25: null, p75: null, observationCount: '0', comparableLocalDates: '6', coverageStart: '2026-03-01', coverageEnd: '2026-03-06', coverageRatio: '1', closureRate: '1' }]);
    const [result] = await new HistoricalRepository({ query } as never).findPatterns(LaneType.General, 0, '01:30', 'America/Ciudad_Juarez');
    expect(result).toEqual(expect.objectContaining({ median: null, p25: null, p75: null, observationCount: 0, closureRate: 1 }));
  });
});
