import { buildBridgeOverview, buildLaneOverview, mapTrend } from './overview.js';
import { LaneType } from '../../common/enums/lane.enum.js';
import { BridgeStatus } from '../../common/enums/bridge.enum.js';
import type { Bridge } from '../bridges/entities/bridge.entity.js';
import type { EstimateResponseEntry } from './estimates.service.js';

function entry(overrides: Partial<EstimateResponseEntry> = {}): EstimateResponseEntry {
  return {
    bridgeId: 'b1',
    bridgeName: 'Puente Santa Teresa',
    laneType: LaneType.General,
    lanesOpen: 4,
    estimatedWaitMinutes: 12,
    status: 'low',
    confidence: 'high',
    confidenceScore: 90,
    trend: 'down',
    sourcesUsed: ['official', 'community'],
    lastUpdatedAt: '2026-11-11T16:00:00.000Z',
    fetchedAt: '2026-11-11T16:00:00.000Z',
    laneAvailable: true,
    isBestOption: true,
    bestOptionFallback: false,
    cbpMinutes: 14,
    communityMinutes: 9,
    communityReportCount: 3,
    previousMinutes: 20,
    ...overrides,
  };
}

function bridge(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: 'b1',
    name: 'Puente Santa Teresa',
    slug: 'puente-santa-teresa',
    status: BridgeStatus.Low,
    waitMinutes: null,
    trend: null,
    cbpPortNumber: 240801,
    sortOrder: 6,
    shortName: 'Santa Teresa',
    tabLabel: null,
    latitude: 31.78287,
    longitude: -106.67976,
    opensAt: '06:00',
    closesAt: '22:00',
    lastUpdatedAt: new Date('2026-11-11T15:59:00.000Z'),
    reports: [],
    ...overrides,
  };
}

describe('mapTrend', () => {
  it('uses the same vocabulary as the bridge entity and the app', () => {
    expect(mapTrend('up')).toBe('rising');
    expect(mapTrend('down')).toBe('falling');
    expect(mapTrend('stable')).toBe('steady');
  });
});

describe('buildLaneOverview', () => {
  it('exposes the official minutes, the community estimate with its report count, and the wait 30 minutes ago', () => {
    const lane = buildLaneOverview(entry());

    expect(lane).toMatchObject({
      cbpMinutes: 14,
      communityMinutes: 9,
      reportCount: 3,
      previousMinutes: 20,
    });
  });

  it('keeps unknown figures as null (and zero reports), never as zero minutes', () => {
    const lane = buildLaneOverview(
      entry({ cbpMinutes: null, communityMinutes: null, communityReportCount: 0, previousMinutes: null }),
    );

    expect(lane.cbpMinutes).toBeNull();
    expect(lane.communityMinutes).toBeNull();
    expect(lane.reportCount).toBe(0);
    expect(lane.previousMinutes).toBeNull();
  });

  it('has no figures when the bridge has no entry for the lane', () => {
    expect(buildLaneOverview(undefined)).toMatchObject({
      cbpMinutes: null,
      communityMinutes: null,
      reportCount: 0,
      previousMinutes: null,
    });
  });

  it('describes an available lane', () => {
    expect(buildLaneOverview(entry())).toEqual({
      estimatedWaitMinutes: 12,
      status: 'low',
      trend: 'falling',
      lanesOpen: 4,
      available: true,
      unavailableReason: null,
      confidence: 'high',
      isBestOption: true,
      sourceStale: false,
      cbpMinutes: 14,
      communityMinutes: 9,
      reportCount: 3,
      previousMinutes: 20,
    });
  });

  it('reports a closed lane without a wait, status or trend', () => {
    const lane = buildLaneOverview(
      entry({
        laneAvailable: false,
        estimatedWaitMinutes: undefined,
        estimateUnavailable: 'laneClosed',
        lanesOpen: 0,
        isBestOption: false,
      }),
    );

    expect(lane).toMatchObject({
      estimatedWaitMinutes: null,
      status: null,
      trend: null,
      lanesOpen: 0,
      available: false,
      unavailableReason: 'laneClosed',
      isBestOption: false,
    });
  });

  it('flags stale official data', () => {
    expect(buildLaneOverview(entry({ sourceStale: true })).sourceStale).toBe(true);
  });

  it('treats a lane with no entry as having no data', () => {
    expect(buildLaneOverview(undefined)).toEqual({
      estimatedWaitMinutes: null,
      status: null,
      trend: null,
      lanesOpen: null,
      available: false,
      unavailableReason: 'noData',
      confidence: 'low',
      isBestOption: false,
      sourceStale: false,
      cbpMinutes: null,
      communityMinutes: null,
      reportCount: 0,
      previousMinutes: null,
    });
  });
});

describe('buildBridgeOverview', () => {
  const allLanes = (e: EstimateResponseEntry): Partial<Record<LaneType, EstimateResponseEntry>> => ({
    [LaneType.General]: e,
    [LaneType.ReadyLane]: { ...e, laneType: LaneType.ReadyLane, estimatedWaitMinutes: 8 },
    [LaneType.Sentri]: { ...e, laneType: LaneType.Sentri, estimatedWaitMinutes: 5 },
    [LaneType.Pedestrian]: { ...e, laneType: LaneType.Pedestrian, estimatedWaitMinutes: 10 },
  });

  it('exposes the four lanes, pedestrian included, keyed by lane type', () => {
    const result = buildBridgeOverview(bridge(), allLanes(entry()), 12);

    expect(Object.keys(result.lanes).sort()).toEqual(['general', 'pedestrian', 'ready_lane', 'sentri']);
    expect(result.lanes.pedestrian.estimatedWaitMinutes).toBe(10);
    expect(result.lanes.sentri.estimatedWaitMinutes).toBe(5);
  });

  it('carries the catalog data the Home needs', () => {
    expect(buildBridgeOverview(bridge(), allLanes(entry()), 12)).toMatchObject({
      id: 'b1',
      slug: 'puente-santa-teresa',
      name: 'Puente Santa Teresa',
      shortName: 'Santa Teresa',
      direction: 'MX_TO_US',
      sortOrder: 6,
      schedule: { is24h: false, label: '6:00 – 22:00' },
      recentReportCount: 12,
      lastUpdatedAt: '2026-11-11T16:00:00.000Z', // the lane fetch, not the row edit (15:59)
    });
  });

  it('includes the crossing coordinates so the app can draw the route without the admin key', () => {
    const result = buildBridgeOverview(bridge(), allLanes(entry()), 0);

    expect(result.latitude).toBe(31.78287);
    expect(result.longitude).toBe(-106.67976);
  });

  it('sends null coordinates when the catalog has none', () => {
    const result = buildBridgeOverview(bridge({ latitude: null, longitude: null }), allLanes(entry()), 0);

    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it('falls back to the full name when there is no short name', () => {
    expect(buildBridgeOverview(bridge({ shortName: null }), allLanes(entry()), 0).shortName).toBe(
      'Puente Santa Teresa',
    );
  });

  it('reports a 24 hour schedule when no opening hours are set', () => {
    const result = buildBridgeOverview(bridge({ opensAt: null, closesAt: null }), allLanes(entry()), 0);
    expect(result.schedule).toEqual({ is24h: true, label: 'Abierto 24 horas' });
  });

  it('is open while at least one lane is not closed', () => {
    const closed = entry({ laneAvailable: false, estimateUnavailable: 'laneClosed', estimatedWaitMinutes: undefined });
    const lanes = { ...allLanes(entry()), [LaneType.General]: closed };

    expect(buildBridgeOverview(bridge(), lanes, 0).isOpen).toBe(true);
  });

  it('is closed when every lane is closed', () => {
    const closed = entry({ laneAvailable: false, estimateUnavailable: 'laneClosed', estimatedWaitMinutes: undefined });
    const lanes = allLanes(closed);

    expect(buildBridgeOverview(bridge(), lanes, 0).isOpen).toBe(false);
  });

  it('reports when the wait data was last fetched from CBP, not when the bridge row was edited', () => {
    const lanes = allLanes(entry({ fetchedAt: '2026-11-12T16:30:00.415Z' }));
    lanes.sentri = entry({ fetchedAt: '2026-11-12T16:45:00.000Z' });

    const result = buildBridgeOverview(bridge({ lastUpdatedAt: new Date('2026-11-09T18:05:58.193Z') }), lanes, 0);

    expect(result.lastUpdatedAt).toBe('2026-11-12T16:45:00.000Z'); // the newest lane fetch
  });

  it('falls back to the bridge row date only when no lane has a CBP fetch time', () => {
    const result = buildBridgeOverview(
      bridge({ lastUpdatedAt: new Date('2026-11-09T18:05:58.193Z') }),
      allLanes(entry({ fetchedAt: null })),
      0,
    );

    expect(result.lastUpdatedAt).toBe('2026-11-09T18:05:58.193Z');
  });

  it('has a null lastUpdatedAt when the bridge was never updated and nothing was fetched', () => {
    expect(
      buildBridgeOverview(bridge({ lastUpdatedAt: null }), allLanes(entry({ fetchedAt: null })), 0).lastUpdatedAt,
    ).toBeNull();
  });
});
