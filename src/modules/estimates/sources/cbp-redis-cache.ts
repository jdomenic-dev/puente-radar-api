/**
 * cbp-redis-cache.ts
 *
 * Redis-backed cache layer for CBP wait-time snapshots.
 *
 * Strategy:
 *   - When Redis is available:
 *       GET cbp:lanes:<portNum>:<laneType>  → hit? return cached value (sourceStale=false)
 *       miss or expired? → fetch from CBP → SET EX <ttlSeconds> + persist to PG for audit/trend
 *   - When Redis is NOT available (null client):
 *       Fall through to the existing CbpAdapter.getLanes() which uses PostgreSQL TTL.
 *
 * This keeps the CbpAdapter (and its 40 unit tests) untouched, and adds Redis
 * as a transparent speed layer on top.
 *
 * Redis key format: cbp:lanes:<cbpPortNumber>:<laneType>
 * Value: JSON-serialized NormalizedLane (with fetchedAt as ISO string)
 */

import type Redis from 'ioredis';
import { LaneType } from '../../../common/enums/lane.enum.js';
import { NormalizedLane } from './wait-time-source.adapter.js';
import { CbpAdapter, GetLanesResult } from './cbp.adapter.js';

const REDIS_KEY_PREFIX = 'cbp:lanes';

function redisKey(portNumber: number, laneType: LaneType): string {
  return `${REDIS_KEY_PREFIX}:${portNumber}:${laneType}`;
}

function serializeLane(lane: NormalizedLane): string {
  return JSON.stringify({ ...lane, fetchedAt: lane.fetchedAt.toISOString() });
}

function deserializeLane(raw: string): NormalizedLane {
  const parsed = JSON.parse(raw) as NormalizedLane & { fetchedAt: string };
  return { ...parsed, fetchedAt: new Date(parsed.fetchedAt) };
}

export class CbpRedisCache {
  constructor(
    private readonly adapter: CbpAdapter,
    private readonly redis: Redis | null,
    private readonly ttlSeconds: number,
  ) {}

  /**
   * Get CBP lanes with Redis-first caching.
   *
   * Redis hit  → return cached lanes immediately (sourceStale=false)
   * Redis miss → fetch via CbpAdapter → write all lanes to Redis → return fresh
   * Redis null → delegate entirely to CbpAdapter.getLanes() (PostgreSQL TTL)
   */
  async getLanes(
    portToBridgeMap: Map<number, string>,
    now: Date,
  ): Promise<GetLanesResult> {
    if (!this.redis) {
      // No Redis — use existing PostgreSQL-based TTL in CbpAdapter
      return this.adapter.getLanes(portToBridgeMap, now);
    }

    // Try to read ALL expected lanes from Redis
    const portNumbers = Array.from(portToBridgeMap.keys());
    const allLaneTypes = [LaneType.General, LaneType.ReadyLane, LaneType.Sentri, LaneType.Pedestrian];
    const keys = portNumbers.flatMap(p => allLaneTypes.map(lt => redisKey(p, lt)));

    const cached = await this.redis.mget(...keys);
    const cachedLanes: NormalizedLane[] = [];

    for (const raw of cached) {
      if (raw !== null) {
        try {
          cachedLanes.push(deserializeLane(raw));
        } catch {
          // Corrupt entry — treat as miss and refresh
          cachedLanes.length = 0;
          break;
        }
      }
    }

    const expectedCount = portNumbers.length * allLaneTypes.length;
    if (cachedLanes.length === expectedCount) {
      // Full cache hit — return immediately
      return { lanes: cachedLanes, sourceStale: false };
    }

    // Cache miss or partial — fetch fresh from CBP
    const result = await this.adapter.getLanes(portToBridgeMap, now);

    if (!result.sourceStale && result.lanes.length > 0) {
      // Write fresh lanes to Redis (fire-and-forget, don't block response)
      void this._writeToRedis(result.lanes, portToBridgeMap);
    }

    return result;
  }

  private async _writeToRedis(
    lanes: NormalizedLane[],
    portToBridgeMap: Map<number, string>,
  ): Promise<void> {
    try {
      const pipeline = this.redis!.pipeline();
      for (const lane of lanes) {
        // Only cache lanes that belong to our known bridges
        if (!portToBridgeMap.has(lane.cbpPortNumber)) continue;
        const key = redisKey(lane.cbpPortNumber, lane.laneType);
        pipeline.set(key, serializeLane(lane), 'EX', this.ttlSeconds);
      }
      await pipeline.exec();
    } catch (err) {
      // Redis write failure is non-fatal — PG snapshot is the safety net
      console.error('[CbpRedisCache] write error:', (err as Error).message);
    }
  }
}
