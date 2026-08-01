/**
 * PG-integration proof for CbpSnapshotCustomRepository.saveSlotSnapshot (PR3 tasks 3.6-3.7).
 *
 * Opt-in only (real PostgreSQL): skipped unless DATABASE_HOST is set, matching the
 * pattern used by src/database/historical-collection-migration.spec.ts (PR2). CI has
 * no DB service. Requires PR2's HistoricalCollection migration to already be applied
 * (slotStart column + UQ_cbp_snapshots_bridge_lane_slot partial unique index).
 *
 * Local run (matches docker-compose.yml):
 *   $env:DATABASE_HOST="localhost"; $env:DATABASE_PORT="5433"; $env:DATABASE_USER="postgres";
 *   $env:DATABASE_PASSWORD="postgres"; $env:DATABASE_NAME="puente_radar";
 *   pnpm test -- cbp-snapshot.repository.integration
 * Never point this at staging/production — local/scratch databases only.
 */

import { DataSource } from 'typeorm';
import { join } from 'node:path';
import { CbpSnapshotCustomRepository } from './cbp-snapshot.repository.js';
import { LaneType } from '../../common/enums/lane.enum.js';

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
    migrations: [join(__dirname, '../../database/migrations/*{.ts,.js}')],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    logging: false,
  });
}

describeIfDb('CbpSnapshotCustomRepository.saveSlotSnapshot (real PostgreSQL, PR3 persistence seam)', () => {
  let dataSource: DataSource;
  let repo: CbpSnapshotCustomRepository;
  let seedBridgeId: string;
  const insertedIds: string[] = [];

  beforeAll(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();
    await dataSource.runMigrations(); // no-op if already applied (requires PR2's migration)
    repo = new CbpSnapshotCustomRepository(dataSource);

    const bridges: Array<{ id: string }> = await dataSource.query(
      `SELECT "id" FROM "bridges" WHERE "slug" = $1 LIMIT 1`,
      ['puente-stanton-lerdo'],
    );
    if (bridges.length === 0) throw new Error('Expected seed bridge "puente-stanton-lerdo" to exist locally.');
    seedBridgeId = bridges[0].id;
  });

  afterEach(async () => {
    if (insertedIds.length > 0) {
      await dataSource.query(`DELETE FROM "cbp_snapshots" WHERE "id" = ANY($1)`, [insertedIds]);
      insertedIds.length = 0;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('inserts a collector-owned row and returns true; a duplicate (bridgeId,laneType,slotStart) is suppressed and returns false, without throwing', async () => {
    const slotStart = new Date('2026-08-02T06:15:00.000Z');
    const row = {
      bridgeId: seedBridgeId,
      laneType: LaneType.Sentri,
      delayMinutes: 5,
      lanesOpen: 2,
      operationalStatus: 'no delay',
      isOpen: true,
      sourceUpdateTimeRaw: '',
      fetchedAt: slotStart,
      slotStart,
    };

    const first = await repo.saveSlotSnapshot(row);
    const second = await repo.saveSlotSnapshot(row);

    expect(first).toBe(true);
    expect(second).toBe(false);

    const rows: Array<{ id: string }> = await dataSource.query(
      `SELECT "id" FROM "cbp_snapshots" WHERE "bridgeId" = $1 AND "laneType" = $2 AND "slotStart" = $3`,
      [seedBridgeId, LaneType.Sentri, slotStart],
    );
    expect(rows).toHaveLength(1); // exactly one row persisted despite two calls
    insertedIds.push(rows[0].id);
  });

  it('a request-driven save() (slotStart NULL) never collides with a saveSlotSnapshot row for the same bridge+lane', async () => {
    const slotStart = new Date('2026-08-02T06:30:00.000Z');

    const collectorInserted = await repo.saveSlotSnapshot({
      bridgeId: seedBridgeId,
      laneType: LaneType.ReadyLane,
      delayMinutes: 12,
      lanesOpen: 1,
      operationalStatus: 'delay',
      isOpen: true,
      sourceUpdateTimeRaw: '',
      fetchedAt: slotStart,
      slotStart,
    });
    expect(collectorInserted).toBe(true);

    // Existing request-driven path — unchanged, writes slotStart = NULL.
    await repo.save({
      bridgeId: seedBridgeId,
      laneType: LaneType.ReadyLane,
      delayMinutes: 12,
      lanesOpen: 1,
      operationalStatus: 'delay',
      isOpen: true,
      sourceUpdateTimeRaw: '',
      fetchedAt: slotStart,
    });

    const rows: Array<{ id: string; slotStart: Date | null }> = await dataSource.query(
      `SELECT "id", "slotStart" FROM "cbp_snapshots" WHERE "bridgeId" = $1 AND "laneType" = $2 ORDER BY "createdAt"`,
      [seedBridgeId, LaneType.ReadyLane],
    );
    expect(rows).toHaveLength(2); // both rows coexist — no collision
    insertedIds.push(...rows.map((r) => r.id));
  });
});
