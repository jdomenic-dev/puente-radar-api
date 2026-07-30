import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HistoricalCollection migration — PR2 (schema/config only; no collector/scheduler yet).
 * Adds cbp_snapshots.slotStart (nullable, no backfill — request-driven rows stay NULL forever),
 * a partial unique index on (bridgeId, laneType, slotStart) WHERE slotStart IS NOT NULL, and the
 * cbp_collection_runs health table (unused until a later PR wires the scheduled collector).
 * Both additions are additive/nullable and independent of existing data — safe to deploy alone.
 */
export class HistoricalCollection1785279091429 implements MigrationInterface {
  name = 'HistoricalCollection1785279091429';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cbp_snapshots"
      ADD COLUMN IF NOT EXISTS "slotStart" timestamptz NULL DEFAULT NULL
    `);

    // Constrains only collector-owned rows (slotStart NOT NULL); NULL-slot request rows never collide.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cbp_snapshots_bridge_lane_slot"
      ON "cbp_snapshots" ("bridgeId", "laneType", "slotStart")
      WHERE "slotStart" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cbp_collection_run_status_enum') THEN
          CREATE TYPE "cbp_collection_run_status_enum" AS ENUM ('success', 'failure');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbp_collection_runs" (
        "id"                   uuid          NOT NULL DEFAULT gen_random_uuid(),
        "runStart"             timestamptz   NOT NULL,
        "status"               "cbp_collection_run_status_enum" NOT NULL,
        "bridgesCovered"       integer       NOT NULL DEFAULT 0,
        "lanesCovered"         integer       NOT NULL DEFAULT 0,
        "duplicatesSuppressed" integer       NOT NULL DEFAULT 0,
        "error"                varchar(1000) NULL,
        "createdAt"            timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"            timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cbp_collection_runs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cbp_collection_runs_run_start"
      ON "cbp_collection_runs" ("runStart" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cbp_collection_runs_run_start"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cbp_collection_runs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cbp_collection_run_status_enum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cbp_snapshots_bridge_lane_slot"`);
    await queryRunner.query(`ALTER TABLE "cbp_snapshots" DROP COLUMN IF EXISTS "slotStart"`);
  }
}
