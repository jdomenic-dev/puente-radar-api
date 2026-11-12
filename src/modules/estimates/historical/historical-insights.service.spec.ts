import { LaneType } from '../../../common/enums/lane.enum.js';
import { HistoricalInsightsService } from './historical-insights.service.js';
import type { HistoricalDayProfileRow } from './historical.repository.js';

const BRIDGE_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const BRIDGE_B = 'bbbbbbbb-0000-0000-0000-000000000002';

/** Wednesday 2026-11-11 10:05 in Ciudad Juarez. */
const NOW = new Date('2026-11-11T17:05:00Z');

function row(
  bridgeId: string,
  time: string,
  median: number,
  overrides: Partial<HistoricalDayProfileRow> = {},
): HistoricalDayProfileRow {
  return { bridgeId, time, median, comparableLocalDates: 8, coverageRatio: 0.9, closureRate: 0, ...overrides };
}

/** A full day for one bridge: quiet 10-13, busy 17-20. */
function fullDay(bridgeId: string): HistoricalDayProfileRow[] {
  const rows: HistoricalDayProfileRow[] = [];
  for (let hour = 6; hour <= 21; hour++) {
    const median = hour < 10 ? 25 : hour < 13 ? 10 : hour < 17 ? 30 : hour < 20 ? 60 : 35;
    for (const minute of ['00', '30']) rows.push(row(bridgeId, `${String(hour).padStart(2, '0')}:${minute}`, median));
  }
  return rows;
}

describe('HistoricalInsightsService', () => {
  const repository = { findDayProfile: jest.fn() };
  const bridges = { findActive: jest.fn() };
  let enabled = 'true';
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'HISTORICAL_API_ENABLED') return enabled;
      if (key === 'HISTORICAL_TZ') return 'America/Ciudad_Juarez';
      if (key === 'HISTORICAL_MIN_DATES') return 6;
      if (key === 'HISTORICAL_MIN_COVERAGE_RATIO') return 0.7;
      return undefined;
    }),
  };
  let clock = NOW;

  const service = () =>
    new HistoricalInsightsService(repository as never, bridges as never, config as never, () => clock);

  beforeEach(() => {
    jest.clearAllMocks();
    enabled = 'true';
    clock = NOW;
    bridges.findActive.mockResolvedValue([{ id: BRIDGE_A }, { id: BRIDGE_B }]);
    repository.findDayProfile.mockImplementation((lane: LaneType) =>
      Promise.resolve(lane === LaneType.General ? fullDay(BRIDGE_A) : []),
    );
  });

  it('answers with no figures at all while the historical API is switched off', async () => {
    enabled = 'false';

    const result = await service().getInsights();

    expect(result.historyEnabled).toBe(false);
    expect(repository.findDayProfile).not.toHaveBeenCalled();
    for (const bridge of result.bridges) {
      for (const lane of Object.values(bridge.lanes)) {
        expect(lane).toEqual({ usual: null, bestTimes: null });
      }
    }
  });

  it('computes the usual wait for the current half hour and the best times of the day', async () => {
    const result = await service().getInsights();

    const general = result.bridges.find((b) => b.bridgeId === BRIDGE_A)?.lanes.general;
    expect(general?.usual).toEqual({ medianMinutes: 10, comparableDates: 8 }); // 10:00 bin
    expect(general?.bestTimes).toEqual({
      freest: { startHour: 10, endHour: 13, typicalMinutes: 10 },
      peak: { startHour: 17, endHour: 20, typicalMinutes: 60 },
    });
  });

  it('says nothing for a bridge or lane without history', async () => {
    const result = await service().getInsights();

    const other = result.bridges.find((b) => b.bridgeId === BRIDGE_B);
    expect(other?.lanes.general).toEqual({ usual: null, bestTimes: null });
    expect(result.bridges.find((b) => b.bridgeId === BRIDGE_A)?.lanes.sentri).toEqual({
      usual: null,
      bestTimes: null,
    });
  });

  it('asks for every lane with the local weekday and the configured timezone', async () => {
    await service().getInsights();

    const calls = repository.findDayProfile.mock.calls as Array<[LaneType, number, string]>;
    const lanes = calls.map((call) => call[0]).sort();
    expect(lanes).toEqual([LaneType.General, LaneType.Pedestrian, LaneType.ReadyLane, LaneType.Sentri].sort());
    for (const call of calls) {
      expect(call[1]).toBe(3); // Wednesday
      expect(call[2]).toBe('America/Ciudad_Juarez');
    }
  });

  it('reports the local slot it used', async () => {
    const result = await service().getInsights();

    expect(result).toMatchObject({
      dayOfWeek: 3,
      time: '10:00',
      timezone: 'America/Ciudad_Juarez',
      historyEnabled: true,
    });
  });

  it('reuses the result for five minutes and recomputes afterwards', async () => {
    const instance = service();

    await instance.getInsights();
    clock = new Date(NOW.getTime() + 4 * 60_000);
    await instance.getInsights();
    expect(repository.findDayProfile).toHaveBeenCalledTimes(4);

    clock = new Date(NOW.getTime() + 6 * 60_000);
    await instance.getInsights();
    expect(repository.findDayProfile).toHaveBeenCalledTimes(8);
  });

  it('shares one computation between concurrent callers', async () => {
    const instance = service();

    await Promise.all([instance.getInsights(), instance.getInsights(), instance.getInsights()]);

    expect(repository.findDayProfile).toHaveBeenCalledTimes(4);
  });

  it('does not cache a failure', async () => {
    repository.findDayProfile.mockRejectedValueOnce(new Error('db down'));
    const instance = service();

    await expect(instance.getInsights()).rejects.toThrow('db down');
    await expect(instance.getInsights()).resolves.toBeDefined();
  });

  it('applies the evidence thresholds from configuration', async () => {
    repository.findDayProfile.mockImplementation((lane: LaneType) =>
      Promise.resolve(
        lane === LaneType.General ? fullDay(BRIDGE_A).map((r) => ({ ...r, comparableLocalDates: 3 })) : [],
      ),
    );

    const result = await service().getInsights();

    expect(result.bridges.find((b) => b.bridgeId === BRIDGE_A)?.lanes.general).toEqual({
      usual: null,
      bestTimes: null,
    });
  });
});
