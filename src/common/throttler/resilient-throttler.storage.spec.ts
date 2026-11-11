import { ResilientThrottlerStorage, type ThrottlerRecord, type ThrottlerRedis } from './resilient-throttler.storage.js';

const KEY = '203.0.113.7';

function fakeRedis(evalImpl: ThrottlerRedis['eval']): ThrottlerRedis {
  return { eval: evalImpl };
}

describe('ResilientThrottlerStorage', () => {
  it('counts in memory when there is no Redis client', async () => {
    const storage = new ResilientThrottlerStorage(null);

    // Nest's ThrottlerGuard passes blockDuration = ttl when none is configured.
    const first = await storage.increment(KEY, 60_000, 2, 60_000, 'default');
    const second = await storage.increment(KEY, 60_000, 2, 60_000, 'default');
    const third = await storage.increment(KEY, 60_000, 2, 60_000, 'default');

    expect([first.totalHits, second.totalHits, third.totalHits]).toEqual([1, 2, 3]);
    expect([first.isBlocked, second.isBlocked, third.isBlocked]).toEqual([false, false, true]);
  });

  it('delegates to Redis and maps the script reply to a record', async () => {
    const evalMock = jest.fn().mockResolvedValue([4, 42_500, 0, 0]);
    const storage = new ResilientThrottlerStorage(fakeRedis(evalMock));

    const record: ThrottlerRecord = await storage.increment(KEY, 60_000, 60, 0, 'default');

    expect(record).toEqual({
      totalHits: 4,
      timeToExpire: 43, // ceil(42_500 ms / 1000)
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const [, , ...args] = evalMock.mock.calls[0] as unknown[];
    expect(args).toEqual(expect.arrayContaining(['60000', '60', '0']));
  });

  it('reports a blocked key with the block expiry in seconds', async () => {
    const storage = new ResilientThrottlerStorage(fakeRedis(jest.fn().mockResolvedValue([61, 10_000, 1, 30_000])));

    const record = await storage.increment(KEY, 60_000, 60, 30_000, 'default');

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(30);
  });

  it('namespaces keys by throttler name so policies do not share counters', async () => {
    const evalMock = jest.fn().mockResolvedValue([1, 60_000, 0, 0]);
    const storage = new ResilientThrottlerStorage(fakeRedis(evalMock));

    await storage.increment(KEY, 60_000, 5, 0, 'reports');
    await storage.increment(KEY, 60_000, 60, 0, 'default');

    const keys = evalMock.mock.calls.map((call) => (call as unknown[])[2]);
    expect(new Set(keys).size).toBe(2);
    expect(String(keys[0])).toContain('reports');
  });

  it('fails open to in-memory counting when Redis errors, never throwing to the request', async () => {
    const warn = jest.fn();
    const storage = new ResilientThrottlerStorage(fakeRedis(jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))), {
      warn,
    });

    const first = await storage.increment(KEY, 60_000, 1, 60_000, 'default');
    const second = await storage.increment(KEY, 60_000, 1, 60_000, 'default');

    expect(first.isBlocked).toBe(false);
    expect(second.isBlocked).toBe(true); // still enforced locally
    expect(warn).toHaveBeenCalledTimes(1); // logged once, not once per request
  });

  it('fails open when Redis returns an unexpected reply', async () => {
    const storage = new ResilientThrottlerStorage(fakeRedis(jest.fn().mockResolvedValue('nope')), {
      warn: jest.fn(),
    });

    const record = await storage.increment(KEY, 60_000, 5, 0, 'default');

    expect(record.totalHits).toBe(1);
  });

  it('does not let a hung Redis stall the request: it times out and counts in memory', async () => {
    const hung = fakeRedis(() => new Promise(() => undefined)); // never settles
    const storage = new ResilientThrottlerStorage(hung, { warn: jest.fn() }, { timeoutMs: 20 });

    const started = Date.now();
    const record = await storage.increment(KEY, 60_000, 5, 60_000, 'default');

    expect(record.totalHits).toBe(1);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('keeps the timeout out of the way when Redis answers promptly', async () => {
    const storage = new ResilientThrottlerStorage(
      fakeRedis(jest.fn().mockResolvedValue([2, 30_000, 0, 0])),
      { warn: jest.fn() },
      { timeoutMs: 1000 },
    );

    const record = await storage.increment(KEY, 60_000, 5, 60_000, 'default');

    expect(record.totalHits).toBe(2);
  });

  it('logs again after Redis recovers and fails a second time', async () => {
    const warn = jest.fn();
    const evalMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce([1, 60_000, 0, 0])
      .mockRejectedValueOnce(new Error('down again'));
    const storage = new ResilientThrottlerStorage(fakeRedis(evalMock), { warn });

    await storage.increment(KEY, 60_000, 5, 60_000, 'default');
    await storage.increment(KEY, 60_000, 5, 60_000, 'default');
    await storage.increment(KEY, 60_000, 5, 60_000, 'default');

    expect(warn).toHaveBeenCalledTimes(2);
  });
});
