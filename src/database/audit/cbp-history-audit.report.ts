/**
 * cbp-history-audit.report.ts — deterministic JSON report formatting for a CbpHistoryAuditResult.
 * Pure formatting only — no I/O, no fabricated values.
 */

import { CbpHistoryAuditResult } from './cbp-history-audit.query.js';

/** Serializes the full audit result as deterministic, stably-keyed JSON. */
export function formatCbpHistoryAuditReportJson(result: CbpHistoryAuditResult): string {
  return JSON.stringify(
    {
      totalRows: result.totalRows,
      minFetchedAt: result.minFetchedAt ? result.minFetchedAt.toISOString() : null,
      maxFetchedAt: result.maxFetchedAt ? result.maxFetchedAt.toISOString() : null,
      uniqueBridgeLaneHourBuckets: result.uniqueBridgeLaneHourBuckets,
      interArrivalGaps: result.interArrivalGaps,
      duplicateConcentrationRate: result.duplicateConcentrationRate,
      nullDelayRate: result.nullDelayRate,
      closedRate: result.closedRate,
      missingLaneRate: result.missingLaneRate,
      fetchesByLocalHour: result.fetchesByLocalHour,
    },
    null,
    2,
  );
}
