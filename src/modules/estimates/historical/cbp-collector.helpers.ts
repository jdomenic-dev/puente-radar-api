/**
 * Pure, dependency-free helpers extracted from CbpCollectorService (task 4.5).
 * No I/O, no side effects — deterministic given their inputs.
 */

/**
 * Floor a timestamp down to the nearest UTC cadence boundary — derives the
 * collector-owned, non-null `slotStart` for `saveSlotSnapshot`. UTC-based
 * (not local-time-based); local-time grouping is a separate, later concern.
 */
export function floorToSlot(now: Date, cadenceMinutes: number): Date {
  const cadenceMs = cadenceMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / cadenceMs) * cadenceMs);
}

/**
 * Derive a stable advisory-lock key from a string seed (FNV-1a, 32-bit).
 * Same seed → same key across processes/instances, required for
 * pg_try_advisory_lock to provide real mutual exclusion. Returns a
 * non-negative integer, safe as the bigint arg of pg_try_advisory_lock.
 */
export function deriveAdvisoryLockKey(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
