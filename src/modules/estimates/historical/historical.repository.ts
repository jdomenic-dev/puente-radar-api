import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LaneType } from '../../../common/enums/lane.enum.js';

export interface HistoricalPatternRow {
  bridgeId: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
  observationCount: number;
  comparableLocalDates: number;
  coverageStart: string | null;
  coverageEnd: string | null;
  coverageRatio: number;
  closureRate: number;
}

@Injectable()
export class HistoricalRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findPatterns(
    laneType: LaneType,
    dayOfWeek: number,
    time: string,
    timezone: string,
  ): Promise<HistoricalPatternRow[]> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `
      WITH local_rows AS (
        SELECT "bridgeId", "isOpen", "delayMinutes",
           ("slotStart" AT TIME ZONE $4)::date AS local_date
        FROM "cbp_snapshots"
        WHERE "slotStart" IS NOT NULL AND "laneType" = $1
          AND EXTRACT(DOW FROM "slotStart" AT TIME ZONE $4) = $2
          AND to_char(
            date_trunc('hour', "slotStart" AT TIME ZONE $4)
              + floor(EXTRACT(MINUTE FROM "slotStart" AT TIME ZONE $4) / 30) * INTERVAL '30 minutes',
            'HH24:MI'
          ) = $3
      ), per_date AS (
        SELECT "bridgeId", local_date,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY "delayMinutes") FILTER (WHERE "isOpen" AND "delayMinutes" IS NOT NULL) AS date_median,
          count("delayMinutes") FILTER (WHERE "isOpen" AND "delayMinutes" IS NOT NULL) AS observations,
          avg((NOT "isOpen")::int)::float AS closure_rate
        FROM local_rows GROUP BY "bridgeId", local_date
      )
      SELECT "bridgeId", percentile_cont(0.5) WITHIN GROUP (ORDER BY date_median) AS median,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY date_median) AS p25,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY date_median) AS p75,
        coalesce(sum(observations), 0)::int AS "observationCount", count(*)::int AS "comparableLocalDates",
        min(local_date)::text AS "coverageStart", max(local_date)::text AS "coverageEnd",
        count(*)::float / greatest(1, ((max(local_date) - min(local_date)) / 7) + 1) AS "coverageRatio",
        coalesce(avg(closure_rate), 0) AS "closureRate"
      FROM per_date GROUP BY "bridgeId"
      `,
      [laneType, dayOfWeek, time, timezone],
    );
    return rows.map((row) => ({
      bridgeId: String(row.bridgeId),
      median: numberOrNull(row.median),
      p25: numberOrNull(row.p25),
      p75: numberOrNull(row.p75),
      observationCount: Number(row.observationCount),
      comparableLocalDates: Number(row.comparableLocalDates),
      coverageStart: stringOrNull(row.coverageStart),
      coverageEnd: stringOrNull(row.coverageEnd),
      coverageRatio: Number(row.coverageRatio),
      closureRate: Number(row.closureRate),
    }));
  }
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
