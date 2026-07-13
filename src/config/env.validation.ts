import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  DATABASE_PORT: number = 5432;

  @IsString()
  DATABASE_USER: string;

  @IsString()
  DATABASE_PASSWORD: string;

  @IsString()
  DATABASE_NAME: string;

  /**
   * Controls TypeORM schema auto-sync. Accepted values: "true" | "false".
   * Optional — when omitted, the app derives the value from NODE_ENV
   * (true in development/test, false in production).
   * NEVER set to "true" in production; use migrations instead.
   */
  @IsString()
  @IsOptional()
  DATABASE_SYNC?: string;

  /**
   * Controls SQL query logging. Accepted values: "true" | "false".
   * Optional — when omitted, the app derives the value from NODE_ENV.
   */
  @IsString()
  @IsOptional()
  DATABASE_LOGGING?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = '*';

  /**
   * Maximum JSON body size (e.g. "50kb", "100kb", "1mb").
   * Prevents large payloads from reaching controllers.
   */
  @IsString()
  @IsOptional()
  JSON_BODY_LIMIT: string = '50kb';

  /**
   * Static API key for admin endpoints.
   * Required before enabling admin operations in production.
   */
  @IsString()
  @IsOptional()
  ADMIN_API_KEY?: string;

  // ── Redis configuration ────────────────────────────────────────────────────

  /**
   * Redis connection URL. Format: redis://[:password@]host[:port][/db]
   * Optional — when omitted, Redis features are disabled gracefully.
   * Example: redis://default:password@redis.railway.internal:6379
   */
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  // ── Rate limiting configuration ────────────────────────────────────────────

  /**
   * Max requests per window (global throttle).
   * Default: 60 requests per minute.
   */
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_LIMIT: number = 60;

  /**
   * Throttle window in milliseconds.
   * Default: 60000 (1 minute).
   */
  @IsInt()
  @Min(1000)
  @IsOptional()
  THROTTLE_TTL_MS: number = 60000;

  /**
   * Max requests per window for POST /reports (per device).
   * Default: 5 reports per minute.
   */
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_REPORTS_LIMIT: number = 5;

  // ── CBP Adapter configuration ──────────────────────────────────────────────

  /**
   * Full URL to the CBP wait-times endpoint.
   * Default: https://bwt.cbp.gov/api/waittimes
   */
  @IsString()
  @IsOptional()
  CBP_BASE_URL: string = 'https://bwt.cbp.gov/api/waittimes';

  /**
   * Abort timeout in milliseconds for CBP API requests.
   * Default: 4000 (4 seconds).
   */
  @IsInt()
  @Min(100)
  @IsOptional()
  CBP_TIMEOUT_MS: number = 4000;

  /**
   * TTL in minutes before a persisted CBP snapshot is considered stale.
   * Default: 15 minutes.
   */
  @IsInt()
  @Min(1)
  @IsOptional()
  CBP_TTL_MINUTES: number = 15;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
