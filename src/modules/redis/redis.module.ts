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
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis | null => {
    const url = config.get<string>('REDIS_URL');
    if (!url) return null;

    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on('error', (err: Error) => {
      // Log but don't crash — app degrades gracefully without Redis
      console.error('[Redis] connection error:', err.message);
    });

    client.on('connect', () => {
      console.log('[Redis] connected');
    });

    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [redisProvider],
})
export class RedisModule {}
