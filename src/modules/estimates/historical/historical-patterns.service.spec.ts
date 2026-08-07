import { HistoricalPatternsService } from './historical-patterns.service.js';
import { LaneType } from '../../../common/enums/lane.enum.js';

const bridge = { id: 'bridge-1', name: 'Bridge One' };
const row = (overrides: Record<string, unknown> = {}) => ({
  bridgeId: 'bridge-1', median: 25, p25: 15, p75: 40, observationCount: 12, comparableLocalDates: 6,
  coverageStart: '2026-03-01', coverageEnd: '2026-03-06', coverageRatio: 0.8, closureRate: 0.2, ...overrides,
});

describe('HistoricalPatternsService', () => {
  function makeService(rows = [row()]) {
    const repository = { findPatterns: jest.fn().mockResolvedValue(rows) };
    const bridges = { findActive: jest.fn().mockResolvedValue([bridge]) };
    const config = { get: jest.fn((key: string) => ({ HISTORICAL_MIN_DATES: 6, HISTORICAL_MIN_COVERAGE_RATIO: 0.7, HISTORICAL_TZ: 'America/Ciudad_Juarez' })[key]) };
    return { service: new HistoricalPatternsService(repository as never, bridges as never, config as never, () => new Date('2026-04-01T00:00:00.000Z')), repository };
  }

  it('returns descriptive distributions and low, medium, and high confidence by comparable dates', async () => {
    const { service } = makeService([row({ comparableLocalDates: 6 }), row({ bridgeId: 'bridge-2', comparableLocalDates: 12 }), row({ bridgeId: 'bridge-3', comparableLocalDates: 24 })]);
    (service as unknown as { bridgesService: { findActive: jest.Mock } }).bridgesService.findActive.mockResolvedValue([bridge, { id: 'bridge-2', name: 'Bridge Two' }, { id: 'bridge-3', name: 'Bridge Three' }]);
    await expect(service.getPatterns({ laneType: LaneType.General, dayOfWeek: 1, time: '06:00' })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ bridgeId: 'bridge-1', median: 25, confidence: 'low', closureRate: 0.2, generatedAt: '2026-04-01T00:00:00.000Z' }),
      expect.objectContaining({ bridgeId: 'bridge-2', confidence: 'medium' }),
      expect.objectContaining({ bridgeId: 'bridge-3', confidence: 'high' }),
    ]));
  });

  it('returns insufficient data without a wait distribution for sparse, low-coverage, and closure-only rows', async () => {
    const { service } = makeService([row({ comparableLocalDates: 5 }), row({ bridgeId: 'bridge-2', coverageRatio: 0.69 }), row({ bridgeId: 'bridge-3', median: null, p25: null, p75: null, observationCount: 0, comparableLocalDates: 6, closureRate: 1 })]);
    (service as unknown as { bridgesService: { findActive: jest.Mock } }).bridgesService.findActive.mockResolvedValue([bridge, { id: 'bridge-2', name: 'Bridge Two' }, { id: 'bridge-3', name: 'Bridge Three' }]);
    const result = await service.getPatterns({ laneType: LaneType.General, dayOfWeek: 1, time: '06:00' });
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ bridgeId: 'bridge-1', insufficientData: true, median: null }),
      expect.objectContaining({ bridgeId: 'bridge-2', insufficientData: true, median: null }),
      expect.objectContaining({ bridgeId: 'bridge-3', insufficientData: true, closureRate: 1, median: null }),
    ]));
  });
});
