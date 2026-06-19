import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * EstimatesEngine migration — Slice A
 *
 * Adds:
 *   - bridges.cbpPortNumber (nullable int)
 *   - reports.laneType (enum, nullable first → backfill → set NOT NULL default 'general')
 *   - reports.reportedWaitMinutes → nullable
 *   - Creates cbp_snapshots table
 *   - Creates estimate_adjustments table
 *
 * Data:
 *   - UPDATE existing 4 bridges with cbpPortNumber
 *   - INSERT 2 new bridge rows (puente-stanton-lerdo, puente-santa-teresa)
 *   - BACKFILL reports.laneType = 'general' for existing rows
 */
export class EstimatesEngine1750000000000 implements MigrationInterface {
  name = 'EstimatesEngine1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. bridges.cbpPortNumber ─────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "bridges"
      ADD COLUMN IF NOT EXISTS "cbpPortNumber" integer NULL
    `);

    // ── 2. reports.laneType — add nullable first, backfill, then set NOT NULL ─
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lane_type_enum') THEN
          CREATE TYPE "lane_type_enum" AS ENUM ('general', 'ready_lane', 'sentri', 'pedestrian');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "laneType" "lane_type_enum" NULL
    `);

    // Backfill existing rows to 'general' before setting NOT NULL
    await queryRunner.query(`
      UPDATE "reports"
      SET "laneType" = 'general'
      WHERE "laneType" IS NULL
    `);

    // Now set NOT NULL with default for future inserts
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "laneType" SET NOT NULL,
      ALTER COLUMN "laneType" SET DEFAULT 'general'
    `);

    // ── 3. reports.reportedWaitMinutes → nullable ────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "reportedWaitMinutes" DROP NOT NULL,
      ALTER COLUMN "reportedWaitMinutes" SET DEFAULT NULL
    `);

    // ── 4. Create cbp_snapshots table ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbp_snapshots" (
        "id"                   uuid          NOT NULL DEFAULT gen_random_uuid(),
        "bridgeId"             uuid          NOT NULL,
        "laneType"             "lane_type_enum" NOT NULL,
        "delayMinutes"         integer       NULL,
        "lanesOpen"            integer       NULL,
        "operationalStatus"    varchar(255)  NULL,
        "isOpen"               boolean       NOT NULL DEFAULT true,
        "sourceUpdateTimeRaw"  varchar(255)  NULL,
        "fetchedAt"            timestamptz   NOT NULL DEFAULT now(),
        "createdAt"            timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"            timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cbp_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cbp_snapshots_bridge"
          FOREIGN KEY ("bridgeId") REFERENCES "bridges"("id") ON DELETE CASCADE
      )
    `);

    // Index for fast TTL lookup: latest snapshot per bridge+lane
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cbp_snapshots_bridge_lane_fetched"
      ON "cbp_snapshots" ("bridgeId", "laneType", "fetchedAt" DESC)
    `);

    // ── 5. Create estimate_adjustments table ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "estimate_adjustments" (
        "id"                uuid          NOT NULL DEFAULT gen_random_uuid(),
        "bridgeId"          uuid          NOT NULL,
        "laneType"          "lane_type_enum" NOT NULL,
        "adjustmentMinutes" integer       NOT NULL,
        "reason"            varchar(500)  NULL,
        "isActive"          boolean       NOT NULL DEFAULT true,
        "createdAt"         timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_estimate_adjustments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_estimate_adjustments_bridge"
          FOREIGN KEY ("bridgeId") REFERENCES "bridges"("id") ON DELETE CASCADE
      )
    `);

    // ── 6. Bridge data: UPDATE cbpPortNumber for existing 4 bridges ──────────
    await queryRunner.query(`
      UPDATE "bridges" SET "cbpPortNumber" = 240201 WHERE "slug" = 'puente-libre'
    `);
    await queryRunner.query(`
      UPDATE "bridges" SET "cbpPortNumber" = 240202 WHERE "slug" = 'puente-santa-fe'
    `);
    await queryRunner.query(`
      UPDATE "bridges" SET "cbpPortNumber" = 240203 WHERE "slug" = 'puente-zaragoza'
    `);
    await queryRunner.query(`
      UPDATE "bridges" SET "cbpPortNumber" = 240401 WHERE "slug" = 'puente-guadalupe-tornillo'
    `);

    // ── 7. INSERT 2 new bridge rows ──────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "bridges" ("name", "slug", "status", "cbpPortNumber", "sortOrder", "waitMinutes", "trend")
      VALUES ('Puente Stanton / Lerdo', 'puente-stanton-lerdo', 'low', 240204, 5, NULL, NULL)
      ON CONFLICT ("slug") DO UPDATE
        SET "cbpPortNumber" = EXCLUDED."cbpPortNumber",
            "sortOrder"     = EXCLUDED."sortOrder"
    `);
    await queryRunner.query(`
      INSERT INTO "bridges" ("name", "slug", "status", "cbpPortNumber", "sortOrder", "waitMinutes", "trend")
      VALUES ('Puente Santa Teresa', 'puente-santa-teresa', 'low', 240801, 6, NULL, NULL)
      ON CONFLICT ("slug") DO UPDATE
        SET "cbpPortNumber" = EXCLUDED."cbpPortNumber",
            "sortOrder"     = EXCLUDED."sortOrder"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse in order: data, tables, columns, type

    // ── Remove the 2 new bridge rows ─────────────────────────────────────────
    await queryRunner.query(`DELETE FROM "bridges" WHERE "slug" IN ('puente-stanton-lerdo', 'puente-santa-teresa')`);

    // ── Clear cbpPortNumber for the 4 original bridges ───────────────────────
    await queryRunner.query(`
      UPDATE "bridges" SET "cbpPortNumber" = NULL
      WHERE "slug" IN ('puente-libre', 'puente-santa-fe', 'puente-zaragoza', 'puente-guadalupe-tornillo')
    `);

    // ── Drop estimate_adjustments ─────────────────────────────────────────────
    await queryRunner.query(`DROP TABLE IF EXISTS "estimate_adjustments"`);

    // ── Drop cbp_snapshots ────────────────────────────────────────────────────
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cbp_snapshots_bridge_lane_fetched"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cbp_snapshots"`);

    // ── Revert reports.reportedWaitMinutes to NOT NULL (default 0) ───────────
    // First ensure no NULLs remain (backfill so NOT NULL doesn't fail)
    await queryRunner.query(`UPDATE "reports" SET "reportedWaitMinutes" = 0 WHERE "reportedWaitMinutes" IS NULL`);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "reportedWaitMinutes" SET NOT NULL,
      ALTER COLUMN "reportedWaitMinutes" SET DEFAULT 0
    `);

    // ── Remove reports.laneType ───────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN IF EXISTS "laneType"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "lane_type_enum"`);

    // ── Remove bridges.cbpPortNumber ─────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "bridges" DROP COLUMN IF EXISTS "cbpPortNumber"`);
  }
}
