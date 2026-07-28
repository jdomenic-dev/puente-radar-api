/**
 * cbp-history-audit.query.ts — PR1 read-only audit over `cbp_snapshots`. No writes/schema/network.
 * `computeCbpHistoryAuditMetrics` is pure; only `fetchCbpHistoryAuditRows` touches the DB (one SELECT).
 */

import { DataSource } from 'typeorm';
import { LaneType } from '../../common/enums/lane.enum.js';

export interface CbpHistoryAuditRow {
  bridgeId: string;
  laneType: LaneType;
  fetchedAt: Date;
  isOpen: boolean;
  delayMinutes: number | null;
}
export interface CbpHistoryAuditOptions {
  timeZone?: string; // IANA timezone for local grouping. Default: America/Ciudad_Juarez.
  duplicateWindowMs?: number; // window (ms) for duplicate-burst detection. Default: 60000.
}
export interface InterArrivalGapStats {
  count: number;
  minMinutes: number;
  maxMinutes: number;
  meanMinutes: number;
  medianMinutes: number;
}
export interface CbpHistoryAuditResult {
  totalRows: number;
  minFetchedAt: Date | null;
  maxFetchedAt: Date | null;
  uniqueBridgeLaneHourBuckets: number; // distinct (bridgeId, laneType, localDate, localHour) combos
  interArrivalGaps: InterArrivalGapStats | null; // null when <2 fetches exist for any bridge/lane key
  duplicateConcentrationRate: number; // rows within duplicateWindowMs of another row for the same bridge/lane
  nullDelayRate: number;
  closedRate: number;
  missingLaneRate: number; // 1 - (observed bridge/lane pairs) / (observed bridges x known lane types)
  fetchesByLocalHour: Record<number, number>; // fetch count by local hour (0-23) — request-bias signal
}

export const AUDIT_DEFAULT_TIMEZONE = 'America/Ciudad_Juarez';
const DEFAULT_DUPLICATE_WINDOW_MS = 60_000;
const KNOWN_LANE_TYPE_COUNT = Object.values(LaneType).length;

function toLocalDateHour(date: Date, timeZone: string): { localDate: string; localHour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { localDate: `${get('year')}-${get('month')}-${get('day')}`, localHour: parseInt(get('hour'), 10) };
}

function computeInterArrivalGaps(byKeyTimestampsMs: Map<string, number[]>): InterArrivalGapStats | null {
  const gapMinutes: number[] = [];
  for (const timestampsMs of byKeyTimestampsMs.values()) {
    const sorted = [...timestampsMs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) gapMinutes.push((sorted[i] - sorted[i - 1]) / 60_000);
  }
  if (gapMinutes.length === 0) return null;
  const sorted = [...gapMinutes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMinutes = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    count: sorted.length,
    minMinutes: sorted[0],
    maxMinutes: sorted[sorted.length - 1],
    meanMinutes: sorted.reduce((sum, g) => sum + g, 0) / sorted.length,
    medianMinutes,
  };
}

/** Pure — no I/O. Empty fixture returns zeroed/null fields rather than fabricating coverage. */
export function computeCbpHistoryAuditMetrics(
  rows: CbpHistoryAuditRow[],
  options: CbpHistoryAuditOptions = {},
): CbpHistoryAuditResult {
  const timeZone = options.timeZone ?? AUDIT_DEFAULT_TIMEZONE;
  const duplicateWindowMs = options.duplicateWindowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;

  if (rows.length === 0) {
    return {
      totalRows: 0,
      minFetchedAt: null,
      maxFetchedAt: null,
      uniqueBridgeLaneHourBuckets: 0,
      interArrivalGaps: null,
      duplicateConcentrationRate: 0,
      nullDelayRate: 0,
      closedRate: 0,
      missingLaneRate: 0,
      fetchesByLocalHour: {},
    };
  }

  let minFetchedAt = rows[0].fetchedAt;
  let maxFetchedAt = rows[0].fetchedAt;
  let nullDelayCount = 0;
  let closedCount = 0;

  const uniqueBridgeLaneHourBucketKeys = new Set<string>();
  const uniqueBridges = new Set<string>();
  const observedBridgeLanePairs = new Set<string>();
  const fetchesByLocalHour: Record<number, number> = {};
  const byKeyTimestampsMs = new Map<string, number[]>();

  for (const r of rows) {
    if (r.fetchedAt < minFetchedAt) minFetchedAt = r.fetchedAt;
    if (r.fetchedAt > maxFetchedAt) maxFetchedAt = r.fetchedAt;
    if (r.delayMinutes === null) nullDelayCount++;
    if (!r.isOpen) closedCount++;
    uniqueBridges.add(r.bridgeId);
    observedBridgeLanePairs.add(`${r.bridgeId}|${r.laneType}`);
    const { localDate, localHour } = toLocalDateHour(r.fetchedAt, timeZone);
    uniqueBridgeLaneHourBucketKeys.add(`${r.bridgeId}|${r.laneType}|${localDate}|${localHour}`);
    fetchesByLocalHour[localHour] = (fetchesByLocalHour[localHour] ?? 0) + 1;
    const key = `${r.bridgeId}|${r.laneType}`;
    const ms = r.fetchedAt.getTime();
    const timestamps = byKeyTimestampsMs.get(key) ?? [];
    timestamps.push(ms);
    byKeyTimestampsMs.set(key, timestamps);
  }

  let duplicateRows = 0;
  for (const timestamps of byKeyTimestampsMs.values()) {
    const sorted = timestamps.sort((a, b) => a - b);
    const duplicateIndexes = new Set<number>();
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] <= duplicateWindowMs) duplicateIndexes.add(i - 1).add(i);
    }
    duplicateRows += duplicateIndexes.size;
  }
  const expectedPairs = uniqueBridges.size * KNOWN_LANE_TYPE_COUNT;

  return {
    totalRows: rows.length,
    minFetchedAt,
    maxFetchedAt,
    uniqueBridgeLaneHourBuckets: uniqueBridgeLaneHourBucketKeys.size,
    interArrivalGaps: computeInterArrivalGaps(byKeyTimestampsMs),
    duplicateConcentrationRate: duplicateRows / rows.length,
    nullDelayRate: nullDelayCount / rows.length,
    closedRate: closedCount / rows.length,
    missingLaneRate: expectedPairs === 0 ? 0 : 1 - observedBridgeLanePairs.size / expectedPairs,
    fetchesByLocalHour,
  };
}

/** Single read-only SELECT. No writes, no schema access, no CBP network call. */
const READ_ONLY_SELECT_SQL = `
  SELECT "bridgeId", "laneType", "fetchedAt", "isOpen", "delayMinutes"
  FROM "cbp_snapshots"
  ORDER BY "fetchedAt" ASC
`;

interface RawAuditRow {
  bridgeId: string;
  laneType: LaneType;
  fetchedAt: Date | string;
  isOpen: boolean;
  delayMinutes: number | string | null;
}
function normalizeDelayMinutes(raw: number | string | null): number | null {
  if (raw === null) return null;
  return typeof raw === 'number' ? raw : parseInt(raw, 10);
}

export async function fetchCbpHistoryAuditRows(dataSource: DataSource): Promise<CbpHistoryAuditRow[]> {
  const rawRows = await dataSource.query<RawAuditRow[]>(READ_ONLY_SELECT_SQL);
  return rawRows.map((r) => ({
    bridgeId: r.bridgeId,
    laneType: r.laneType,
    fetchedAt: r.fetchedAt instanceof Date ? r.fetchedAt : new Date(r.fetchedAt),
    isOpen: r.isOpen,
    delayMinutes: normalizeDelayMinutes(r.delayMinutes),
  }));
}

/** Fetch + compute in one call — the entry point used by the audit script. */
export async function runCbpHistoryAudit(
  dataSource: DataSource,
  options: CbpHistoryAuditOptions = {},
): Promise<CbpHistoryAuditResult> {
  const rows = await fetchCbpHistoryAuditRows(dataSource);
  return computeCbpHistoryAuditMetrics(rows, options);
}
