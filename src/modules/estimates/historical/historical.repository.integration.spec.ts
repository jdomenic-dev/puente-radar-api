import { DataSource } from 'typeorm';
import { HistoricalRepository } from './historical.repository.js';
import { LaneType } from '../../../common/enums/lane.enum.js';
import { InitialSchema1740000000000 } from '../../../database/migrations/1740000000000-InitialSchema.js';
import { EstimatesEngine1750000000000 } from '../../../database/migrations/1750000000000-EstimatesEngine.js';
import { HistoricalCollection1785279091429 } from '../../../database/migrations/1785279091429-HistoricalCollection.js';

const describeIfDb = process.env.DATABASE_HOST ? describe : describe.skip;

describeIfDb('HistoricalRepository (PostgreSQL)', () => {
  let dataSource: DataSource;
  let bridgeId: string;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres', host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT), username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME, migrations: [InitialSchema1740000000000, EstimatesEngine1750000000000, HistoricalCollection1785279091429],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    [{ id: bridgeId }] = await dataSource.query(`INSERT INTO "bridges" ("name", "slug", "status", "sortOrder") VALUES ('HBTR fixture', 'hbtr-final-fixture', 'low', 99) RETURNING "id"`);
  });

  afterAll(async () => {
    await dataSource?.query(`DELETE FROM "bridges" WHERE "slug" = 'hbtr-final-fixture'`);
    await dataSource?.destroy();
  });

  it('uses DST-correct local bins, per-date medians, excludes NULL slots, and reports closures separately', async () => {
    const insert = async (fetchedAt: string, delayMinutes: number | null, isOpen = true, slotStart: string | null = fetchedAt) => dataSource.query(
      `INSERT INTO "cbp_snapshots" ("bridgeId", "laneType", "delayMinutes", "isOpen", "fetchedAt", "slotStart") VALUES ($1, $2, $3, $4, $5, $6)`,
      [bridgeId, LaneType.General, delayMinutes, isOpen, fetchedAt, slotStart],
    );
    await insert('2026-03-02T13:00:00.000Z', 10);
    await insert('2026-03-02T13:15:00.000Z', 30, true, '2026-03-02T13:15:00.000Z');
    await insert('2026-03-09T12:00:00.000Z', 40);
    await insert('2026-03-16T12:00:00.000Z', null, false);
    await insert('2026-03-16T12:00:00.000Z', 999, true, null);
    // Canonical collector slot is Monday 06:00 local, while fetchedAt is 05:50.
    // Historical grouping must follow slotStart, never request/transport timing.
    await insert('2026-03-23T11:50:00.000Z', 50, true, '2026-03-23T12:00:00.000Z');

    const [pattern] = await new HistoricalRepository(dataSource).findPatterns(LaneType.General, 1, '06:00', 'America/Ciudad_Juarez');
    expect(pattern).toEqual(expect.objectContaining({ bridgeId, median: 40, p25: 30, p75: 45, observationCount: 4, comparableLocalDates: 4, coverageStart: '2026-03-02', coverageEnd: '2026-03-23', coverageRatio: 1, closureRate: expect.any(Number) }));
    expect(pattern.closureRate).toBeGreaterThan(0);
  });

  it('uses the collector partial index for the slot-owned historical scan', async () => {
    await dataSource.query('SET enable_seqscan = off');
    const plan = await dataSource.query<Array<{ 'QUERY PLAN': string }>>(`EXPLAIN SELECT "bridgeId" FROM "cbp_snapshots" WHERE "slotStart" IS NOT NULL AND "laneType" = $1`, [LaneType.General]);
    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain('UQ_cbp_snapshots_bridge_lane_slot');
  });
});
