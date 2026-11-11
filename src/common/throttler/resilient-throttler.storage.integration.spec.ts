/**
 * Runs the Lua rate-limit script against a real Redis. Skipped unless REDIS_TEST_URL is set,
 * e.g. REDIS_TEST_URL=redis://localhost:6390 (docker run --rm -p 6390:6379 redis:7-alpine).
 */
import Redis from 'ioredis';
import { ResilientThrottlerStorage, type ThrottlerRecord } from './resilient-throttler.storage.js';

const url = process.env.REDIS_TEST_URL;
const describeWithRedis = url ? describe : describe.skip;

describeWithRedis('ResilientThrottlerStorage with real Redis', () => {
  let redis: Redis;
  const warn = jest.fn();

  beforeAll(() => {
    redis = new Redis(url as string);
  });
  beforeEach(async () => {
    await redis.flushdb();
    warn.mockClear();
  });
  afterAll(async () => {
    await redis.quit();
  });

  it('counts hits, blocks above the limit and keeps the block for its duration', async () => {
    const storage = new ResilientThrottlerStorage(redis, { warn });

    const records: ThrottlerRecord[] = [];
    for (let i = 0; i < 4; i++) {
      records.push(await storage.increment('1.2.3.4', 60_000, 3, 60_000, 'default'));
    }

    expect(records.map((r) => r.totalHits)).toEqual([1, 2, 3, 4]);
    expect(records.map((r) => r.isBlocked)).toEqual([false, false, false, true]);
    expect(records[3].timeToBlockExpire).toBeGreaterThan(0);

    const stillBlocked = await storage.increment('1.2.3.4', 60_000, 3, 60_000, 'default');
    expect(stillBlocked.isBlocked).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps counters per key and per throttler name', async () => {
    const storage = new ResilientThrottlerStorage(redis, { warn });

    await storage.increment('1.1.1.1', 60_000, 1, 60_000, 'default');
    const other = await storage.increment('2.2.2.2', 60_000, 1, 60_000, 'default');
    const sameKeyOtherPolicy = await storage.increment('1.1.1.1', 60_000, 1, 60_000, 'reports');

    expect(other.totalHits).toBe(1);
    expect(sameKeyOtherPolicy.totalHits).toBe(1);
  });

  it('starts a fresh window after the ttl expires', async () => {
    const storage = new ResilientThrottlerStorage(redis, { warn });

    await storage.increment('9.9.9.9', 300, 1, 300, 'default');
    await storage.increment('9.9.9.9', 300, 1, 300, 'default');
    await new Promise((resolve) => setTimeout(resolve, 450));
    const fresh = await storage.increment('9.9.9.9', 300, 1, 300, 'default');

    expect(fresh.totalHits).toBe(1);
    expect(fresh.isBlocked).toBe(false);
  });
});
