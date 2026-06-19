/**
 * Standalone TypeORM DataSource used exclusively by the TypeORM CLI.
 *
 * Usage:
 *   npx typeorm-ts-node-esm -d src/database/data-source.ts migration:generate src/database/migrations/MigrationName
 *   npx typeorm-ts-node-esm -d src/database/data-source.ts migration:run
 *   npx typeorm-ts-node-esm -d src/database/data-source.ts migration:revert
 *
 * This file reads env vars directly via process.env (dotenv loaded by the npm scripts).
 * It is NOT imported by the NestJS app — the app uses typeorm.config.ts instead.
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'node:path';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
  username: process.env['DATABASE_USER'] ?? 'postgres',
  password: process.env['DATABASE_PASSWORD'] ?? 'postgres',
  database: process.env['DATABASE_NAME'] ?? 'puente_radar',

  // Entities — use compiled JS in dist for CLI operations
  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],

  // Migrations directory and table name
  migrations: [join(__dirname, './migrations/*{.ts,.js}')],
  migrationsTableName: 'typeorm_migrations',

  // CLI should NEVER auto-sync; always use explicit migrations
  synchronize: false,
  logging: process.env['DATABASE_LOGGING'] === 'true',
});
