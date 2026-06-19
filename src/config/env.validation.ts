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
