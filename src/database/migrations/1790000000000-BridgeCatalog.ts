import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BridgeCatalog migration — adds the reference data the app needs to show and navigate
 * to a bridge: a compact name, coordinates and opening hours.
 *
 * All columns are nullable and additive, so existing rows and clients are unaffected.
 * The six known bridges are filled by slug (opening hours as published by CBP, checked
 * 2026-11-11; coordinates from OpenStreetMap). Rows with other slugs keep NULLs, and
 * both NULL opening times mean "open 24 hours".
 */
export class BridgeCatalog1790000000000 implements MigrationInterface {
  name = 'BridgeCatalog1790000000000';

  private readonly catalog = [
    ['puente-libre', 'Puente Libre', 31.76521, -106.45159, null, null],
    ['puente-santa-fe', 'Puente Santa Fe', 31.74774, -106.48693, null, null],
    ['puente-zaragoza', 'Zaragoza / Ysleta', 31.67248, -106.33601, null, null],
    ['puente-guadalupe-tornillo', 'Guadalupe-Tornillo', 31.4328, -106.14797, '06:00', '22:00'],
    ['puente-stanton-lerdo', 'Stanton / Lerdo', 31.74948, -106.48343, '06:00', '24:00'],
    ['puente-santa-teresa', 'Santa Teresa', 31.78287, -106.67976, '06:00', '22:00'],
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bridges"
      ADD COLUMN IF NOT EXISTS "shortName" varchar(100) NULL DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS "latitude" double precision NULL DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS "longitude" double precision NULL DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS "opensAt" varchar(5) NULL DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS "closesAt" varchar(5) NULL DEFAULT NULL
    `);

    for (const [slug, shortName, latitude, longitude, opensAt, closesAt] of this.catalog) {
      await queryRunner.query(
        `UPDATE "bridges"
         SET "shortName" = $2, "latitude" = $3, "longitude" = $4, "opensAt" = $5, "closesAt" = $6
         WHERE "slug" = $1`,
        [slug, shortName, latitude, longitude, opensAt, closesAt],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bridges"
      DROP COLUMN IF EXISTS "closesAt",
      DROP COLUMN IF EXISTS "opensAt",
      DROP COLUMN IF EXISTS "longitude",
      DROP COLUMN IF EXISTS "latitude",
      DROP COLUMN IF EXISTS "shortName"
    `);
  }
}
