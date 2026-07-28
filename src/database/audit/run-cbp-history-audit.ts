/**
 * run-cbp-history-audit.ts — `pnpm run audit:cbp-history`. Read-only: no writes, no schema
 * changes, no CBP network call — only SELECTs `cbp_snapshots`; prints a deterministic JSON report.
 * EXTERNAL GATE (non-code, tracked for the future PR1 description): CBP crossing-direction and
 * polling-rate/ToS confirmation is required before `HISTORICAL_COLLECTION_ENABLED=true` in
 * production — not resolved here. Never point this at staging/production without explicit
 * maintainer authorization and DATABASE_* credentials.
 */

import 'dotenv/config';
import { basename } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { runCbpHistoryAudit } from './cbp-history-audit.query.js';
import { formatCbpHistoryAuditReportJson } from './cbp-history-audit.report.js';

export function createAuditDataSourceOptions(env: NodeJS.ProcessEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DATABASE_HOST,
    port: parseInt(env.DATABASE_PORT ?? '5432', 10),
    username: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}

export async function runAuditCommand(
  dataSource: DataSource,
  stdout: (value: string) => unknown = (value) => process.stdout.write(value),
  stderr: (value: string) => unknown = (value) => process.stderr.write(value),
): Promise<number> {
  let initialized = false;
  let exitCode = 0;
  try {
    await dataSource.initialize();
    initialized = true;
    stdout(`${formatCbpHistoryAuditReportJson(await runCbpHistoryAudit(dataSource))}\n`);
  } catch (error) {
    stderr(`CBP history audit failed: ${error instanceof Error ? error.message : String(error)}\n`);
    exitCode = 1;
  }
  if (initialized) {
    try {
      await dataSource.destroy();
    } catch (error) {
      stderr(`CBP history audit cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`);
      exitCode = 1;
    }
  }
  return exitCode;
}

if (basename(process.argv[1] ?? '').replace(/\.(?:t|j)s$/, '') === 'run-cbp-history-audit') {
  void runAuditCommand(new DataSource(createAuditDataSourceOptions(process.env))).then((code) => {
    process.exitCode = code;
  });
}
