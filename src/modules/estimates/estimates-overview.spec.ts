import { EstimatesService } from './estimates.service.js';
import { EstimateCalculator } from './estimate.calculator.js';
import { LaneType } from '../../common/enums/lane.enum.js';
import { BridgeStatus } from '../../common/enums/bridge.enum.js';
import type { Bridge } from '../bridges/entities/bridge.entity.js';
import type { EstimateResponseEntry } from './estimates.service.js';

const BRIDGES: Bridge[] = [
  { id: 'b1', name: 'Puente Libre', slug: 'puente-libre', sortOrder: 1 },
  { id: 'b2', name: 'Puente Santa Fe', slug: 'puente-santa-fe', sortOrder: 2 },
].map((b) => ({
  ...b,
  status: BridgeStatus.Low,
  waitMinutes: null,
  trend: null,
  cbpPortNumber: null,
  shortName: null,
  tabLabel: null,
  latitude: null,
  longitude: null,
  opensAt: null,
  closesAt: null,
  lastUpdatedAt: null,
  reports: [],
}));

function entryFor(bridge: Bridge, laneType: LaneType, minutes: number): EstimateResponseEntry {
  return {
    bridgeId: bridge.id,
    bridgeName: bridge.name,
    laneType,
    lanesOpen: 2,
    estimatedWaitMinutes: minutes,
    status: 'low',
    confidence: 'medium',
    confidenceScore: 60,
    trend: 'stable',
    sourcesUsed: ['official'],
    lastUpdatedAt: null,
    fetchedAt: null,
    laneAvailable: true,
    isBestOption: false,
    bestOptionFallback: false,
    cbpMinutes: minutes,
    communityMinutes: null,
    communityReportCount: 0,
    previousMinutes: null,
  };
}

describe('EstimatesService.getOverview()', () => {
  const bridgesService = {
    findActive: jest.fn(),
    getHomeSummary: jest.fn(),
  };

  function makeService(): EstimatesService {
    return new EstimatesService(
      bridgesService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new EstimateCalculator(),
      { get: jest.fn() } as never,
    );
  }

  function stubEstimates(service: EstimatesService, minutesFor: (lane: LaneType) => number = () => 10) {
    return jest
      .spyOn(service, 'getEstimates')
      .mockImplementation((lane: LaneType) => Promise.resolve(BRIDGES.map((b) => entryFor(b, lane, minutesFor(lane)))));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    bridgesService.findActive.mockResolvedValue(BRIDGES);
    bridgesService.getHomeSummary.mockResolvedValue([
      { id: 'b1', recentReportCount: 12 },
      { id: 'b2', recentReportCount: 0 },
    ]);
  });

  it('queries the four lanes one after another, never concurrently', async () => {
    const service = makeService();
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    jest.spyOn(service, 'getEstimates').mockImplementation(async (lane: LaneType) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      order.push(lane);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return BRIDGES.map((b) => entryFor(b, lane, 10));
    });

    await service.getOverview();

    expect(order).toEqual([LaneType.General, LaneType.ReadyLane, LaneType.Sentri, LaneType.Pedestrian]);
    expect(maxRunning).toBe(1);
  });

  describe('short-lived cache', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('serves repeated calls from memory so a burst of requests hits the database once', async () => {
      const service = makeService();
      const spy = stubEstimates(service);

      const first = await service.getOverview();
      const second = await service.getOverview();

      expect(second).toBe(first);
      expect(spy).toHaveBeenCalledTimes(4); // four lanes, computed once
      expect(bridgesService.findActive).toHaveBeenCalledTimes(1);
    });

    it('shares one computation between concurrent callers', async () => {
      const service = makeService();
      const spy = stubEstimates(service);

      await Promise.all([service.getOverview(), service.getOverview(), service.getOverview()]);

      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('recomputes after the cache expires', async () => {
      jest.useFakeTimers({ now: new Date('2026-11-11T12:00:00Z') });
      const service = makeService();
      const spy = stubEstimates(service);

      await service.getOverview();
      jest.setSystemTime(new Date('2026-11-11T12:00:31Z'));
      await service.getOverview();

      expect(spy).toHaveBeenCalledTimes(8);
    });

    it('does not cache a failure: the next call tries again', async () => {
      const service = makeService();
      stubEstimates(service);
      bridgesService.findActive.mockRejectedValueOnce(new Error('db down'));

      await expect(service.getOverview()).rejects.toThrow('db down');
      const retry = await service.getOverview();

      expect(retry.bridges).toHaveLength(2);
    });
  });

  it('returns every active bridge with its four lanes, in catalog order', async () => {
    const service = makeService();
    stubEstimates(service, (lane) => (lane === LaneType.Sentri ? 5 : 12));

    const result = await service.getOverview();

    expect(result.bridges.map((b) => b.slug)).toEqual(['puente-libre', 'puente-santa-fe']);
    expect(result.bridges[0].lanes.sentri.estimatedWaitMinutes).toBe(5);
    expect(result.bridges[0].lanes.pedestrian.estimatedWaitMinutes).toBe(12);
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });

  it('adds the recent report count of each bridge', async () => {
    const service = makeService();
    stubEstimates(service);

    const result = await service.getOverview();

    expect(result.bridges.map((b) => b.recentReportCount)).toEqual([12, 0]);
  });

  it('treats a bridge missing from the report summary as having no reports', async () => {
    bridgesService.getHomeSummary.mockResolvedValue([{ id: 'b1', recentReportCount: 3 }]);
    const service = makeService();
    stubEstimates(service);

    const result = await service.getOverview();

    expect(result.bridges[1].recentReportCount).toBe(0);
  });
});
