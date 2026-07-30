/**
 * PG-integration proof for the HistoricalCollection migration (tasks 2.4/2.5/2.6/2.10).
 *
 * Location note: this file MUST stay OUTSIDE src/database/migrations/. TypeORM's migrations
 * glob imports every .ts file in that directory as a migration class; a Jest spec there gets
 * re-imported during any other DataSource/AppModule bootstrap (e.g. the estimates e2e suite),
 * crashing with "Cannot add a test after tests have started running."
 *
 * Opt-in only (real PostgreSQL): skipped unless DATABASE_HOST is set, mirroring how
 * test/estimates.e2e-spec.ts is opt-in via `pnpm test:e2e`. CI has no DB service.
 * Local run (matches docker-compose.yml):
 *   $env:DATABASE_HOST="localhost"; $env:DATABASE_PORT="5433"; $env:DATABASE_USER="postgres";
 *   $env:DATABASE_PASSWORD="postgres"; $env:DATABASE_NAME="puente_radar";
 *   pnpm test -- historical-collection-migration
 * Never point this at staging/production — local/scratch databases only.
 */

import { DataSource } from 'typeorm';
import { join } from 'node:path';
import { LaneType } from '../common/enums/lane.enum.js';

const describeIfDb = process.env.DATABASE_HOST !== undefined ? describe : describe.skip;

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, './migrations/*{.ts,.js}')],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    logging: false,
  });
}

describeIfDb('HistoricalCollection migration (real PostgreSQL)', () => {
  let dataSource: DataSource;
  let seedBridgeId: string;

  beforeAll(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();
    await dataSource.runMigrations(); // no-op if already applied

    const bridges: Array<{ id: string }> = await dataSource.query(
      `SELECT "id" FROM "bridges" WHERE "slug" = $1 LIMIT 1`,
      ['puente-stanton-lerdo'],
    );
    if (bridges.length === 0) throw new Error('Expected seed bridge "puente-stanton-lerdo" to exist locally.');
    seedBridgeId = bridges[0].id;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('applies additive schema: nullable slotStart, partial unique index, cbp_collection_runs + status enum', async () => {
    const columns: Array<{ data_type: string; is_nullable: string }> = await dataSource.query(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_name = 'cbp_snapshots' AND column_name = 'slotStart'`,
    );
    expect(columns).toHaveLength(1);
    expect(columns[0].data_type).toBe('timestamp with time zone');
    expect(columns[0].is_nullable).toBe('YES');

    const indexes: Array<{ indexdef: string }> = await dataSource.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'cbp_snapshots' AND indexname = 'UQ_cbp_snapshots_bridge_lane_slot'`,
    );
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toContain('WHERE ("slotStart" IS NOT NULL)');

    const runColumns: Array<{ column_name: string }> = await dataSource.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'cbp_collection_runs'`,
    );
    expect(runColumns.map((c) => c.column_name).sort()).toEqual(
      [
        'id',
        'runStart',
        'status',
        'bridgesCovered',
        'lanesCovered',
        'duplicatesSuppressed',
        'error',
        'createdAt',
        'updatedAt',
      ].sort(),
    );

    await expect(
      dataSource.query(`INSERT INTO "cbp_collection_runs" ("runStart", "status") VALUES (now(), 'bogus-status')`),
    ).rejects.toThrow();
  });

  it('keeps request-driven inserts NULL-slot (no implicit backfill) and never colliding', async () => {
    const first: Array<{ id: string; slotStart: Date | null }> = await dataSource.query(
      `INSERT INTO "cbp_snapshots" ("bridgeId", "laneType", "isOpen") VALUES ($1, $2, true) RETURNING "id", "slotStart"`,
      [seedBridgeId, LaneType.General],
    );
    const second: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO "cbp_snapshots" ("bridgeId", "laneType", "isOpen") VALUES ($1, $2, true) RETURNING "id"`,
      [seedBridgeId, LaneType.General],
    );

    try {
      expect(first[0].slotStart).toBeNull();
      expect(second[0].id).not.toBe(first[0].id); // two NULL-slot rows never collide
    } finally {
      await dataSource.query(`DELETE FROM "cbp_snapshots" WHERE "id" = ANY($1)`, [[first[0].id, second[0].id]]);
    }
  });

  it('enforces the partial unique index on collector-owned (non-null) slots', async () => {
    const slotStart = new Date('2026-08-01T06:00:00.000Z');
    const first: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO "cbp_snapshots" ("bridgeId", "laneType", "isOpen", "slotStart")
       VALUES ($1, $2, true, $3) RETURNING "id"`,
      [seedBridgeId, LaneType.Sentri, slotStart],
    );

    try {
      await expect(
        dataSource.query(
          `INSERT INTO "cbp_snapshots" ("bridgeId", "laneType", "isOpen", "slotStart") VALUES ($1, $2, true, $3)`,
          [seedBridgeId, LaneType.Sentri, slotStart],
        ),
      ).rejects.toThrow();
    } finally {
      await dataSource.query(`DELETE FROM "cbp_snapshots" WHERE "id" = $1`, [first[0].id]);
    }
  });

  it('reverts cleanly (down) and re-applies (up), leaving the database migrated-up afterward', async () => {
    await dataSource.undoLastMigration();

    const afterDown: Array<{ column_name: string }> = await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'cbp_snapshots' AND column_name = 'slotStart'`,
    );
    expect(afterDown).toHaveLength(0);

    const tablesAfterDown: Array<{ table_name: string }> = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'cbp_collection_runs'`,
    );
    expect(tablesAfterDown).toHaveLength(0);

    await dataSource.runMigrations(); // re-apply so the local DB ends migrated-up

    const afterUp: Array<{ column_name: string }> = await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'cbp_snapshots' AND column_name = 'slotStart'`,
    );
    expect(afterUp).toHaveLength(1);
  });
});
