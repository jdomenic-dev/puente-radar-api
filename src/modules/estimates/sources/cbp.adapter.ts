/**
 * cbp.adapter.ts
 *
 * CbpAdapter — fetches, normalizes, persists, and TTL-caches CBP wait-time
 * data for the 6 El Paso / Juárez border bridges.
 *
 * Design reference: design.md rev2 — "CBP adapter design".
 *
 * Key design choices:
 *   - All I/O (fetch, DB) injected via constructor → trivially testable.
 *   - portToBridgeMap passed at call time → no BridgesService dependency.
 *   - Clock injected as `now: Date` param → deterministic in tests.
 *   - Native fetch + AbortController → zero new runtime dependencies.
 *   - TTL decided from DB (fetchedAt column) → multi-instance safe.
 *   - Stale fallback: fetch failure + prior snapshot → return stale data
 *     instead of throwing.
 */

import { LaneType } from '../../../common/enums/lane.enum.js';
import { WaitTimeSourceAdapter, NormalizedLane } from './wait-time-source.adapter.js';
import { CbpSnapshot } from '../entities/cbp-snapshot.entity.js';

// ---------------------------------------------------------------------------
// CBP API response shapes (raw, unvalidated)
// ---------------------------------------------------------------------------

export interface CbpLaneObject {
  operational_status: string;
  update_time: string;
  delay_minutes: string;
  lanes_open: string;
}

export interface CbpPassengerVehicleLanes {
  maximum_lanes?: string;
  standard_lanes?: CbpLaneObject;
  NEXUS_SENTRI_lanes?: CbpLaneObject;
  ready_lanes?: CbpLaneObject;
}

export interface CbpPedestrianLanes {
  standard_lanes?: CbpLaneObject;
  ready_lanes?: CbpLaneObject;
}

export interface CbpApiPort {
  port_number: string;
  border: string;
  port_name: string;
  crossing_name: string;
  hours: string;
  date: string;
  time: string;
  port_status: string;
  passenger_vehicle_lanes: CbpPassengerVehicleLanes;
  pedestrian_lanes: CbpPedestrianLanes;
}

// ---------------------------------------------------------------------------
// Minimal snapshot repository interface (injected, mockable)
// ---------------------------------------------------------------------------

/**
 * All snapshot fields needed to reconstruct a NormalizedLane for stale fallback.
 * Must stay in sync with _snapshotsToNormalizedLanes — any field added there
 * must be added here.
 */
export type SnapshotLaneRow = Pick<
  CbpSnapshot,
  | 'bridgeId'
  | 'laneType'
  | 'fetchedAt'
  | 'delayMinutes'
  | 'lanesOpen'
  | 'operationalStatus'
  | 'isOpen'
  | 'sourceUpdateTimeRaw'
>;

/**
 * Minimal repository surface used by CbpAdapter.
 * The full TypeORM Repository<CbpSnapshot> does NOT provide findLatestPerBridgeLane
 * out of the box — Slice C MUST implement this as a custom query method, e.g.:
 *
 *   SELECT DISTINCT ON ("bridgeId", "laneType")
 *     "bridgeId", "laneType", "fetchedAt", "delayMinutes", "lanesOpen",
 *     "operationalStatus", "isOpen", "sourceUpdateTimeRaw"
 *   FROM "cbp_snapshots"
 *   WHERE "bridgeId" = ANY($1)
 *   ORDER BY "bridgeId", "laneType", "fetchedAt" DESC
 *
 * This is a SLICE C dependency: EstimatesModule must create a custom repository
 * or extend the TypeORM repository with this method before wiring CbpAdapter.
 *
 * Unit tests inject a plain mock object; the full return type is SnapshotLaneRow[]
 * so all fields needed for stale-fallback reconstruction are guaranteed to be present.
 */
export interface CbpSnapshotRepository {
  save(snapshot: Partial<CbpSnapshot>): Promise<unknown>;
  /**
   * Return the single most-recent snapshot per (bridgeId, laneType) combination,
   * including ALL fields needed to reconstruct a NormalizedLane.
   *
   * @param bridgeIds  Array of bridge UUIDs to query for.
   */
  findLatestPerBridgeLane(bridgeIds: string[]): Promise<SnapshotLaneRow[]>;
}

// ---------------------------------------------------------------------------
// Adapter config
// ---------------------------------------------------------------------------

export interface CbpAdapterConfig {
  /** Full URL to the CBP wait-times endpoint. */
  baseUrl: string;
  /** Abort timeout in milliseconds (default 4000). */
  timeoutMs: number;
  /** TTL in minutes before a snapshot is considered stale (default 15). */
  ttlMinutes: number;
  /**
   * Injectable fetch function — defaults to global `fetch`.
   * Pass a mock in tests to avoid real network calls.
   */
  fetchFn?: typeof fetch;
  /** Injectable snapshot repository. */
  snapshotRepo: CbpSnapshotRepository;
}

// ---------------------------------------------------------------------------
// getLanes result type
// ---------------------------------------------------------------------------

export interface GetLanesResult {
  /** Normalized lanes — may come from a fresh fetch OR a stale snapshot fallback. */
  lanes: NormalizedLane[];
  /**
   * true  → data came from a stale snapshot (fetch failed or was skipped).
   * false → data came from a fresh successful fetch.
   */
  sourceStale: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All lane types the CBP adapter maps — used for full-coverage freshness check. */
const ALL_LANE_TYPES: LaneType[] = [LaneType.General, LaneType.Sentri, LaneType.ReadyLane, LaneType.Pedestrian];

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a CBP delay_minutes string to a number or null.
 * Rules (per spec):
 *   - numeric string "10" → 10
 *   - "0"                 → 0   (not null — zero is a valid delay)
 *   - ""                  → null
 *   - "N/A"               → null
 *   - null / undefined    → null
 */
function parseDelayMinutes(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '' || raw.trim().toUpperCase() === 'N/A') {
    return null;
  }
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse a CBP lanes_open string to a number or null.
 * Rules:
 *   - numeric string "5" → 5
 *   - ""                 → null
 *   - null / undefined   → null
 */
function parseLanesOpen(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return null;
  }
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Determine whether a lane is open.
 * Closed when:
 *   - port_status === 'Closed'
 *   - lane operational_status === 'Lanes Closed'
 *   - lane operational_status === 'N/A'
 */
function isLaneOpen(portStatus: string, laneStatus: string): boolean {
  if (portStatus === 'Closed') return false;
  if (laneStatus === 'Lanes Closed' || laneStatus === 'N/A') return false;
  return true;
}

// ---------------------------------------------------------------------------
// CbpAdapter
// ---------------------------------------------------------------------------

export class CbpAdapter implements WaitTimeSourceAdapter {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly ttlMinutes: number;
  private readonly fetchFn: typeof fetch;
  private readonly snapshotRepo: CbpSnapshotRepository;

  constructor(config: CbpAdapterConfig) {
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
    this.ttlMinutes = config.ttlMinutes;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.snapshotRepo = config.snapshotRepo;
  }

  // -------------------------------------------------------------------------
  // WaitTimeSourceAdapter.fetchAll — fetch now, normalize, persist
  // -------------------------------------------------------------------------

  /**
   * Fetch fresh CBP data and normalize it — NO persistence side effect.
   * Extracted for the historical collector (PR4); never writes through the
   * adapter's request-driven `save` path.
   *
   * On fetch failure, returns [] BY DEFAULT — `fetchAll`/`getLanes` never
   * pass `options`, so their behavior is unchanged. Pass
   * `{ rethrowOnFailure: true }` to propagate the real error instead — used
   * by the collector to distinguish a genuine upstream failure from a
   * legitimately empty response (spec: cbp-historical-collection, "Failure
   * Isolation and Health").
   */
  async fetchAndNormalize(
    portToBridgeMap: Map<number, string>,
    now: Date,
    options?: { rethrowOnFailure?: boolean },
  ): Promise<NormalizedLane[]> {
    let rawPorts: CbpApiPort[];

    try {
      rawPorts = await this._fetchFromCbp();
    } catch (err) {
      if (options?.rethrowOnFailure) throw err;
      // Fetch failed — caller handles empty result
      return [];
    }

    return this._normalize(rawPorts, portToBridgeMap, now);
  }

  /**
   * Fetch fresh CBP data, normalize it, and persist one snapshot per
   * (bridgeId, laneType). Returns the normalized lanes.
   *
   * Composes fetchAndNormalize (fetch+normalize, no persist) with
   * _persistSnapshots (request-driven, slotStart NULL) — behavior unchanged.
   *
   * @param portToBridgeMap  Map<cbpPortNumber, bridgeId>
   * @param now              Injected clock for deterministic fetchedAt values.
   */
  async fetchAll(portToBridgeMap: Map<number, string>, now: Date): Promise<NormalizedLane[]> {
    const lanes = await this.fetchAndNormalize(portToBridgeMap, now);
    await this._persistSnapshots(lanes, portToBridgeMap);
    return lanes;
  }

  // -------------------------------------------------------------------------
  // getLanes — TTL check + stale fallback
  // -------------------------------------------------------------------------

  /**
   * Return lane data with TTL-aware caching and stale fallback.
   *
   * Algorithm:
   *   1. Query latest snapshots from DB.
   *   2. If ALL present and within TTL → return from DB (no fetch).
   *   3. If stale or missing → attempt refresh (fetchAll).
   *   4. If refresh succeeds → persist + return fresh (sourceStale=false).
   *   5. If refresh fails:
   *      a. Prior snapshots exist → return them (sourceStale=true).
   *      b. No prior snapshots → return [] (sourceStale=true).
   *
   * @param portToBridgeMap  Map<cbpPortNumber, bridgeId>
   * @param now              Injected clock.
   */
  async getLanes(portToBridgeMap: Map<number, string>, now: Date): Promise<GetLanesResult> {
    const bridgeIds = Array.from(portToBridgeMap.values());
    const latestSnapshots = await this.snapshotRepo.findLatestPerBridgeLane(bridgeIds);

    // Check freshness: ALL expected (bridgeId × laneType) combinations must be
    // present in the cache AND within TTL. A partial cache (missing bridges or
    // lanes) must trigger a refresh — returning incomplete data silently is worse
    // than a network call.
    //
    // "Expected" = every bridge in portToBridgeMap × all 4 LaneType values.
    // This is conservative: if a bridge genuinely has no data for a lane type,
    // the fresh fetch will return an empty NormalizedLane set for it, which is
    // the correct signal. We never skip a refresh just because the map is partial.
    const expectedCount = portToBridgeMap.size * ALL_LANE_TYPES.length;
    const isFresh =
      latestSnapshots.length === expectedCount &&
      latestSnapshots.every((snap) => {
        const ageMs = now.getTime() - snap.fetchedAt.getTime();
        return ageMs <= this.ttlMinutes * 60_000;
      });

    if (isFresh) {
      // Convert persisted snapshots back to NormalizedLane shape for callers
      const lanes = this._snapshotsToNormalizedLanes(latestSnapshots, portToBridgeMap);
      return { lanes, sourceStale: false };
    }

    // Stale or no snapshots — attempt a fresh fetch
    try {
      const rawPorts = await this._fetchFromCbp();
      const freshLanes = this._normalize(rawPorts, portToBridgeMap, now);
      await this._persistSnapshots(freshLanes, portToBridgeMap);
      return { lanes: freshLanes, sourceStale: false };
    } catch {
      // Fetch failed — fall back to stale snapshots (or empty)
      const staleLanes = this._snapshotsToNormalizedLanes(latestSnapshots, portToBridgeMap);
      return { lanes: staleLanes, sourceStale: true };
    }
  }

  // -------------------------------------------------------------------------
  // Private: fetch from CBP API
  // -------------------------------------------------------------------------

  private async _fetchFromCbp(): Promise<CbpApiPort[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(this.baseUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`CBP API returned HTTP ${response.status}`);
    }

    return response.json() as Promise<CbpApiPort[]>;
  }

  // -------------------------------------------------------------------------
  // Private: normalize CBP array → NormalizedLane[]
  // -------------------------------------------------------------------------

  private _normalize(ports: CbpApiPort[], portToBridgeMap: Map<number, string>, now: Date): NormalizedLane[] {
    const results: NormalizedLane[] = [];

    for (const port of ports) {
      const cbpPortNumber = parseInt(port.port_number, 10);
      if (!portToBridgeMap.has(cbpPortNumber)) {
        // Unknown port — filtered out
        continue;
      }

      const portStatus = port.port_status ?? '';

      // Passenger vehicle: standard → general
      if (port.passenger_vehicle_lanes?.standard_lanes) {
        results.push(
          this._normalizeOneLane(
            cbpPortNumber,
            LaneType.General,
            portStatus,
            port.passenger_vehicle_lanes.standard_lanes,
            now,
          ),
        );
      }

      // Passenger vehicle: NEXUS_SENTRI → sentri
      if (port.passenger_vehicle_lanes?.NEXUS_SENTRI_lanes) {
        results.push(
          this._normalizeOneLane(
            cbpPortNumber,
            LaneType.Sentri,
            portStatus,
            port.passenger_vehicle_lanes.NEXUS_SENTRI_lanes,
            now,
          ),
        );
      }

      // Passenger vehicle: ready_lanes → ready_lane
      if (port.passenger_vehicle_lanes?.ready_lanes) {
        results.push(
          this._normalizeOneLane(
            cbpPortNumber,
            LaneType.ReadyLane,
            portStatus,
            port.passenger_vehicle_lanes.ready_lanes,
            now,
          ),
        );
      }

      // Pedestrian: standard_lanes → pedestrian
      if (port.pedestrian_lanes?.standard_lanes) {
        results.push(
          this._normalizeOneLane(
            cbpPortNumber,
            LaneType.Pedestrian,
            portStatus,
            port.pedestrian_lanes.standard_lanes,
            now,
          ),
        );
      }
    }

    return results;
  }

  private _normalizeOneLane(
    cbpPortNumber: number,
    laneType: LaneType,
    portStatus: string,
    lane: CbpLaneObject,
    now: Date,
  ): NormalizedLane {
    const opStatus = lane.operational_status ?? '';
    return {
      cbpPortNumber,
      laneType,
      delayMinutes: parseDelayMinutes(lane.delay_minutes),
      lanesOpen: parseLanesOpen(lane.lanes_open),
      operationalStatus: opStatus,
      isOpen: isLaneOpen(portStatus, opStatus),
      sourceUpdateTimeRaw: lane.update_time ?? '',
      fetchedAt: now,
    };
  }

  // -------------------------------------------------------------------------
  // Private: persist one snapshot per bridge+lane
  // -------------------------------------------------------------------------

  private async _persistSnapshots(lanes: NormalizedLane[], portToBridgeMap: Map<number, string>): Promise<void> {
    for (const lane of lanes) {
      const bridgeId = portToBridgeMap.get(lane.cbpPortNumber);
      if (!bridgeId) continue;

      await this.snapshotRepo.save({
        bridgeId,
        laneType: lane.laneType,
        delayMinutes: lane.delayMinutes,
        lanesOpen: lane.lanesOpen,
        operationalStatus: lane.operationalStatus,
        isOpen: lane.isOpen,
        sourceUpdateTimeRaw: lane.sourceUpdateTimeRaw,
        fetchedAt: lane.fetchedAt,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private: convert snapshot rows back to NormalizedLane (for stale fallback)
  // -------------------------------------------------------------------------

  private _snapshotsToNormalizedLanes(
    snapshots: SnapshotLaneRow[],
    portToBridgeMap: Map<number, string>,
  ): NormalizedLane[] {
    // Build reverse map: bridgeId → cbpPortNumber
    const bridgeToPort = new Map<string, number>();
    for (const [portNum, bridgeId] of portToBridgeMap) {
      bridgeToPort.set(bridgeId, portNum);
    }

    return snapshots
      .filter((s) => bridgeToPort.has(s.bridgeId))
      .map((s) => ({
        cbpPortNumber: bridgeToPort.get(s.bridgeId)!,
        laneType: s.laneType,
        // Use real persisted values — never silently default them.
        // The SnapshotLaneRow type guarantees all fields are present.
        delayMinutes: s.delayMinutes,
        lanesOpen: s.lanesOpen,
        operationalStatus: s.operationalStatus ?? '',
        isOpen: s.isOpen,
        sourceUpdateTimeRaw: s.sourceUpdateTimeRaw ?? '',
        fetchedAt: s.fetchedAt,
      }));
  }
}
