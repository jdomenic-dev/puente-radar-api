import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { join } from 'node:path';

export const typeormConfig: TypeOrmModuleAsyncOptions = {
  useFactory: (configService: ConfigService) => {
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    // DATABASE_SYNC controls schema auto-sync. In production it is ALWAYS false.
    // Migrations must be run explicitly before deployment.
    // In non-production it defaults to true for convenience.
    if (isProduction && configService.get<string>('DATABASE_SYNC') === 'true') {
      throw new Error(
        'DATABASE_SYNC=true is not allowed in production. Run migrations with "npm run migration:run" instead.',
      );
    }
    const syncEnv = configService.get<string>('DATABASE_SYNC');
    const synchronize = isProduction ? false : syncEnv !== undefined ? syncEnv === 'true' : true;

    // DATABASE_LOGGING enables SQL query logging. Defaults to false in production.
    const loggingEnv = configService.get<string>('DATABASE_LOGGING');
    const logging = loggingEnv !== undefined ? loggingEnv === 'true' : !isProduction;

    const sslEnabled = configService.get<string>('DATABASE_SSL') === 'true';

    return {
      type: 'postgres',
      host: configService.get<string>('DATABASE_HOST'),
      port: configService.get<number>('DATABASE_PORT'),
      username: configService.get<string>('DATABASE_USER'),
      password: configService.get<string>('DATABASE_PASSWORD'),
      database: configService.get<string>('DATABASE_NAME'),
      entities: [join(__dirname, '/../**/*.entity{.ts,.js}')],

      // PostgreSQL SSL — required by managed services such as Amazon RDS.
      // For production, replace rejectUnauthorized: false with the CA bundle
      // from AWS and set rejectUnauthorized: true.
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,

      // Migrations — managed via CLI using src/database/data-source.ts
      // Run `npm run migration:run` before deploying to production.
      migrations: [join(__dirname, '/../database/migrations/*{.ts,.js}')],
      migrationsTableName: 'typeorm_migrations',
      // migrationsRun is intentionally false: migrations must be run explicitly via CLI.
      migrationsRun: false,

      synchronize,
      logging,
    };
  },
  inject: [ConfigService],
};
