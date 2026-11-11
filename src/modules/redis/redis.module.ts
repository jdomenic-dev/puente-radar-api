/**
 * redis.module.ts
 *
 * Global Redis module — provides an ioredis client as REDIS_CLIENT token.
 *
 * Usage:
 *   Inject with @Inject(REDIS_CLIENT) client: Redis
 *
 * When REDIS_URL is not set the provider returns null and callers must
 * handle that gracefully (Redis is optional for local development).
 *
 * Railway provides REDIS_URL automatically when a Redis plugin is added.
 */

import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { createRedisStatusLogger } from './redis-status-logger.js';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis | null => {
    const url = config.get<string>('REDIS_URL');
    if (!url) return null;

    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
      // Fail immediately while disconnected instead of queueing commands: callers fall back to
      // memory/PostgreSQL, so a Redis outage never adds latency to requests.
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });

    const status = createRedisStatusLogger(new Logger('Redis'));

    client.on('error', (err: Error) => status.onError(err));
    client.on('ready', () => status.onReady());

    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [redisProvider],
})
export class RedisModule {}
