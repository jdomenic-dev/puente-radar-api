/**
 * wait-time-source.adapter.ts
 *
 * Adapter interface for any wait-time data source.
 * Decouples the EstimatesService from a concrete data provider so future
 * sources (e.g. another port authority API) can slot in without touching
 * the orchestration layer.
 *
 * Design reference: design.md — "Adapter seam" decision.
 */

import { LaneType } from '../../../common/enums/lane.enum.js';

// ---------------------------------------------------------------------------
// Shared output shape
// ---------------------------------------------------------------------------

/**
 * One normalized lane observation as returned by any WaitTimeSourceAdapter
 * implementation. Fields mirror the CBP API's relevant data points but are
 * source-agnostic.
 */
export interface NormalizedLane {
  /** The CBP port_number integer this lane belongs to. */
  cbpPortNumber: number;

  /** Which physical lane type this observation covers. */
  laneType: LaneType;

  /**
   * Reported delay in whole minutes.
   * null when the source does not provide a numeric value
   * (e.g. empty string, "N/A", absent field).
   * Never coerced to 0 — missing ≠ zero delay.
   */
  delayMinutes: number | null;

  /**
   * Number of open lanes at time of fetch.
   * null when not available.
   */
  lanesOpen: number | null;

  /**
   * Raw operational_status string from the source (e.g. "delay",
   * "no delay", "Lanes Closed", "N/A").
   * Kept verbatim for display; do not parse for business logic.
   */
  operationalStatus: string;

  /**
   * Whether the lane is considered open and serving traffic.
   * false if port_status is "Closed" or lane operational_status is
   * "Lanes Closed" or "N/A".
   */
  isOpen: boolean;

  /**
   * Raw update_time string from the source (e.g. "At 2:00 pm EDT").
   * Kept verbatim because the timezone is ambiguous — do NOT parse
   * this for freshness decisions; use fetchedAt instead.
   */
  sourceUpdateTimeRaw: string;

  /** Wall-clock timestamp when this data was fetched. Injected by caller. */
  fetchedAt: Date;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * A WaitTimeSourceAdapter fetches and normalizes lane wait-time data from
 * one external source, returning a flat list of NormalizedLane entries.
 *
 * Implementations are responsible for:
 *   - Fetching from their upstream API.
 *   - Defensive parsing (missing/invalid fields → null, not thrown).
 *   - Filtering to known ports via the portToBridgeMap.
 *   - Persisting snapshots for TTL/stale-fallback decisions.
 *
 * The fetchAll method is the low-level "fetch now" primitive.
 * Higher-level TTL+stale logic is an implementation concern (see CbpAdapter.getLanes).
 */
export interface WaitTimeSourceAdapter {
  /**
   * Fetch fresh data from the source right now.
   *
   * @param portToBridgeMap  Map<cbpPortNumber, bridgeId> — filters and maps known ports.
   * @param now              Current timestamp — injected for determinism in tests.
   * @returns                Flat list of NormalizedLane; empty on total failure.
   */
  fetchAll(portToBridgeMap: Map<number, string>, now: Date): Promise<NormalizedLane[]>;
}
