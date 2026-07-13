import { MigrationInterface, QueryRunner } from 'typeorm';

/** Baseline schema that existed before the estimates engine was introduced. */
export class InitialSchema1740000000000 implements MigrationInterface {
  name = 'InitialSchema1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bridges_status_enum') THEN
          CREATE TYPE "bridges_status_enum" AS ENUM ('low', 'medium', 'high', 'saturated');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bridges_trend_enum') THEN
          CREATE TYPE "bridges_trend_enum" AS ENUM ('rising', 'steady', 'falling');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reports_source_enum') THEN
          CREATE TYPE "reports_source_enum" AS ENUM ('user', 'sensor', 'official');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reports_linestatus_enum') THEN
          CREATE TYPE "reports_linestatus_enum" AS ENUM ('pending', 'verified', 'rejected');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bridges" (
        "id"            uuid                    NOT NULL DEFAULT gen_random_uuid(),
        "name"          varchar(255)            NOT NULL,
        "slug"          varchar(255)            NOT NULL,
        "status"        "bridges_status_enum"  NOT NULL DEFAULT 'low',
        "waitMinutes"   integer                 NULL DEFAULT NULL,
        "trend"         "bridges_trend_enum"   NULL DEFAULT NULL,
        "sortOrder"     integer                 NOT NULL DEFAULT 0,
        "lastUpdatedAt" timestamptz             NULL DEFAULT now(),
        CONSTRAINT "PK_bridges" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bridges_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reports" (
        "id"                  uuid                      NOT NULL DEFAULT gen_random_uuid(),
        "bridgeId"            uuid                      NOT NULL,
        "reportedWaitMinutes" integer                   NOT NULL,
        "source"              "reports_source_enum"    NOT NULL DEFAULT 'user',
        "lineStatus"          "reports_linestatus_enum" NOT NULL DEFAULT 'pending',
        "comment"             varchar(300)              NULL DEFAULT NULL,
        "anonymousDeviceId"   varchar(255)              NULL DEFAULT NULL,
        "createdAt"           timestamptz               NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reports_bridge"
          FOREIGN KEY ("bridgeId") REFERENCES "bridges"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bridges"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reports_linestatus_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reports_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bridges_trend_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bridges_status_enum"`);
  }
}
