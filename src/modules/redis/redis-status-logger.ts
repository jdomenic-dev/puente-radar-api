/**
 * redis-status-logger.ts
 *
 * ioredis emits an "error" event on every failed reconnect attempt. This logs one warning per
 * outage and one line when the connection is back, so a Redis restart does not flood the logs.
 */

export interface StatusLogger {
  log(message: string): void;
  warn(message: string): void;
}

export function createRedisStatusLogger(logger: StatusLogger) {
  let down = false;

  return {
    onError(error: Error): void {
      if (down) return;
      down = true;
      logger.warn(
        `Redis unavailable (${error.message || 'no message'}); rate limiting and the CBP cache fall back to memory/PostgreSQL`,
      );
    },
    onReady(): void {
      logger.log(down ? 'Redis recovered' : 'Redis connected');
      down = false;
    },
  };
}
