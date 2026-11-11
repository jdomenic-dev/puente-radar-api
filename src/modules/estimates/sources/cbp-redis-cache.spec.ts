import { LaneType } from '../../../common/enums/lane.enum.js';
import type { NormalizedLane } from './wait-time-source.adapter.js';
import { CbpRedisCache } from './cbp-redis-cache.js';

const PORT = 240201;
const NOW = new Date('2026-11-11T12:00:00Z');
const PORT_MAP = new Map<number, string>([[PORT, 'bridge-1']]);

function lane(laneType: LaneType): NormalizedLane {
  return { cbpPortNumber: PORT, laneType, fetchedAt: NOW } as unknown as NormalizedLane;
}

function serialized(laneType: LaneType): string {
  return JSON.stringify({ ...lane(laneType), fetchedAt: NOW.toISOString() });
}

describe('CbpRedisCache', () => {
  const freshLanes = [lane(LaneType.General)];
  const adapter = { getLanes: jest.fn() };
  const pipeline = { set: jest.fn(), exec: jest.fn().mockResolvedValue([]) };
  const redis = { mget: jest.fn(), pipeline: jest.fn(() => pipeline) };
  const build = (client: unknown = redis) => new CbpRedisCache(adapter as never, client as never, 60);

  beforeEach(() => {
    jest.clearAllMocks();
    adapter.getLanes.mockResolvedValue({ lanes: freshLanes, sourceStale: false });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delegates to the adapter when there is no Redis client', async () => {
    const result = await build(null).getLanes(PORT_MAP, NOW);

    expect(result.lanes).toBe(freshLanes);
    expect(adapter.getLanes).toHaveBeenCalledTimes(1);
  });

  it('returns a full cache hit without calling CBP', async () => {
    redis.mget.mockResolvedValue(Object.values(LaneType).map((type) => serialized(type)));

    const result = await build().getLanes(PORT_MAP, NOW);

    expect(result.lanes).toHaveLength(4);
    expect(result.sourceStale).toBe(false);
    expect(adapter.getLanes).not.toHaveBeenCalled();
  });

  it('fetches from the adapter on a miss and stores the fresh lanes', async () => {
    redis.mget.mockResolvedValue([null, null, null, null]);

    const result = await build().getLanes(PORT_MAP, NOW);

    expect(result.lanes).toBe(freshLanes);
    expect(pipeline.set).toHaveBeenCalledTimes(1);
  });

  it('keeps serving from the adapter when Redis fails to read: an outage must never cause a 500', async () => {
    redis.mget.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await build().getLanes(PORT_MAP, NOW);

    expect(result.lanes).toBe(freshLanes);
    expect(adapter.getLanes).toHaveBeenCalledTimes(1);
  });

  it('does not write back to Redis after a failed read', async () => {
    redis.mget.mockRejectedValue(new Error('ECONNREFUSED'));

    await build().getLanes(PORT_MAP, NOW);

    expect(redis.pipeline).not.toHaveBeenCalled();
  });
});
