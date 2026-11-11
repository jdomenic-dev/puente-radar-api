/**
 * resilient-throttler.storage.ts
 *
 * Rate-limit counters kept in Redis so they survive deploys and are shared by every API
 * instance. If Redis is not configured or fails, requests are counted in memory instead:
 * the limiter fails OPEN to local counting, never to a 500 and never to "no limit".
 */

import { ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';

export type ThrottlerRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/** The only Redis capability needed, so tests can fake it without a server. */
export interface ThrottlerRedis {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

interface WarnLogger {
  warn(message: string): void;
}

const KEY_PREFIX = 'throttle';

/** A Redis call slower than this is treated as a failure so requests never wait on a sick Redis. */
const DEFAULT_TIMEOUT_MS = 250;

export interface ResilientThrottlerOptions {
  timeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis did not answer within ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Atomic fixed-window counter with optional blocking.
 * KEYS[1] = hits key, KEYS[2] = block key
 * ARGV[1] = ttl ms, ARGV[2] = limit, ARGV[3] = block duration ms
 * Returns { totalHits, timeToExpireMs, isBlocked (0|1), timeToBlockExpireMs }.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { current, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
local blockDuration = tonumber(ARGV[3])
if hits > tonumber(ARGV[2]) and blockDuration > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', blockDuration)
  return { hits, ttl, 1, blockDuration }
end
return { hits, ttl, 0, 0 }
`;

export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly fallback = new ThrottlerStorageService();
  private warned = false;

  constructor(
    private readonly redis: ThrottlerRedis | null,
    private readonly logger: WarnLogger = console,
    private readonly options: ResilientThrottlerOptions = {},
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    if (this.redis) {
      try {
        const hitsKey = `${KEY_PREFIX}:${throttlerName}:${key}`;
        const reply = await withTimeout(
          this.redis.eval(
            INCREMENT_SCRIPT,
            2,
            hitsKey,
            `${hitsKey}:blocked`,
            String(ttl),
            String(limit),
            String(blockDuration),
          ),
          this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
        const record = this.toRecord(reply);
        this.warned = false; // Redis answered: warn again if it goes down later
        return record;
      } catch (error) {
        this.warnOnce(error);
      }
    }
    return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
  }

  private toRecord(reply: unknown): ThrottlerRecord {
    if (!Array.isArray(reply) || reply.length < 4 || reply.some((n) => typeof n !== 'number')) {
      throw new Error('Unexpected reply from the rate-limit script');
    }
    const [totalHits, ttlMs, blocked, blockMs] = reply as number[];
    return {
      totalHits,
      timeToExpire: Math.ceil(ttlMs / 1000),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.ceil(blockMs / 1000),
    };
  }

  private warnOnce(error: unknown): void {
    if (this.warned) return;
    this.warned = true;
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.warn(`[Throttler] Redis unavailable, counting in memory instead: ${reason}`);
  }
}
