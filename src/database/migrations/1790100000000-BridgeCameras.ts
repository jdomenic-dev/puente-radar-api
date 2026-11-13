import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BridgeCameras migration: the YouTube live cameras of the bridges.
 *
 * - bridges.tabLabel: a very short name for tabs ("Libre", "Zaragoza"), filled by slug
 * - bridge_cameras: one row per YouTube stream (video id only), with the credit to show
 * - the 11 streams below, verified on 2026-11-12: all published by the Fideicomiso de Puentes
 *   Fronterizos de Chihuahua (@fpfch), live and embeddable. They are attached to the bridges
 *   that already exist by slug; a bridge that is missing simply gets none (the seed adds them).
 *
 * Additive: no existing table or column changes meaning.
 */
export class BridgeCameras1790100000000 implements MigrationInterface {
  name = 'BridgeCameras1790100000000';

  private readonly tabLabels = [
    ['puente-libre', 'Libre'],
    ['puente-santa-fe', 'Santa Fe'],
    ['puente-zaragoza', 'Zaragoza'],
    ['puente-guadalupe-tornillo', 'Tornillo'],
    ['puente-stanton-lerdo', 'Lerdo'],
    ['puente-santa-teresa', 'Sta. Teresa'],
  ] as const;

  /** slug, videoId, label, description, sortOrder */
  private readonly cameras = [
    ['puente-libre', 'mp3RS0y77tY', 'Norte', 'Mirando hacia EE. UU.', 0],
    ['puente-libre', 'CZM5TpXLzE8', 'Sur', 'Mirando hacia México', 1],
    ['puente-libre', 'Y3OESQEXBlI', 'Av. Rafael Pérez Serna', 'Avenida de acceso', 2],
    ['puente-santa-fe', '0Pg3S6s76IE', 'Norte', 'Mirando hacia EE. UU.', 0],
    ['puente-santa-fe', 'IcvugJWPXz8', 'Sur', 'Mirando hacia México', 1],
    ['puente-zaragoza', 'KX-bm-Lhy3w', 'Norte', 'Mirando hacia EE. UU.', 0],
    ['puente-zaragoza', 'GC5RY3zipa4', 'Sur', 'Mirando hacia México', 1],
    ['puente-zaragoza', 'o5h9RB7qwY8', 'Av. Waterfill', 'Vista sur por la avenida', 2],
    ['puente-stanton-lerdo', 'CYhISA_wFQ8', 'Norte a Sur', 'Línea Exprés, vista de norte a sur', 0],
    ['puente-stanton-lerdo', 'sOHFG6_3zAs', 'Sur a Norte', 'Línea Exprés, vista de sur a norte', 1],
    ['puente-stanton-lerdo', 'RVXhhbkBGbI', 'Malecón', 'Línea Exprés, vista a Malecón', 2],
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bridges" ADD COLUMN IF NOT EXISTS "tabLabel" varchar(20) NULL DEFAULT NULL`);
    for (const [slug, label] of this.tabLabels) {
      await queryRunner.query(`UPDATE "bridges" SET "tabLabel" = $2 WHERE "slug" = $1`, [slug, label]);
    }

    await queryRunner.query(`CREATE TYPE "camera_status_enum" AS ENUM ('live', 'offline', 'unknown')`);
    await queryRunner.query(`
      CREATE TABLE "bridge_cameras" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "bridgeId" uuid NOT NULL,
        "videoId" varchar(11) NOT NULL,
        "label" varchar(80) NOT NULL,
        "description" varchar(160) NULL DEFAULT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "status" "camera_status_enum" NOT NULL DEFAULT 'unknown',
        "lastCheckedAt" TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
        "sourceName" varchar(120) NOT NULL DEFAULT 'Fideicomiso de Puentes Fronterizos de Chihuahua',
        "sourceUrl" varchar(255) NOT NULL DEFAULT 'https://www.youtube.com/@fpfch',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bridge_cameras" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bridge_cameras_videoId" UNIQUE ("videoId"),
        CONSTRAINT "FK_bridge_cameras_bridge" FOREIGN KEY ("bridgeId") REFERENCES "bridges"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_bridge_cameras_bridgeId" ON "bridge_cameras" ("bridgeId")`);

    for (const [slug, videoId, label, description, sortOrder] of this.cameras) {
      await queryRunner.query(
        `INSERT INTO "bridge_cameras" ("bridgeId", "videoId", "label", "description", "sortOrder", "status", "lastCheckedAt")
         SELECT "id", $2, $3, $4, $5, 'live', now() FROM "bridges" WHERE "slug" = $1
         ON CONFLICT ("videoId") DO NOTHING`,
        [slug, videoId, label, description, sortOrder],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bridge_cameras_bridgeId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bridge_cameras"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "camera_status_enum"`);
    await queryRunner.query(`ALTER TABLE "bridges" DROP COLUMN IF EXISTS "tabLabel"`);
  }
}
