/**
 * Strict TDD — RED-first unit coverage for the pure helpers extracted by
 * CbpCollectorService (task 4.5): slot flooring and lock-key derivation.
 */

import { deriveAdvisoryLockKey, floorToSlot } from './cbp-collector.helpers.js';

describe('floorToSlot', () => {
  it('4.5-a/b: floors a mid-cadence timestamp to the UTC boundary; an aligned timestamp is unchanged', () => {
    expect(floorToSlot(new Date('2026-06-19T13:07:00.000Z'), 15)).toEqual(new Date('2026-06-19T13:00:00.000Z'));
    expect(floorToSlot(new Date('2026-06-19T13:00:00.000Z'), 15)).toEqual(new Date('2026-06-19T13:00:00.000Z'));
  });

  it('4.5-c/d: respects a non-default cadence; UTC-based (23:59 does not roll to the next day early)', () => {
    expect(floorToSlot(new Date('2026-06-19T13:07:00.000Z'), 5)).toEqual(new Date('2026-06-19T13:05:00.000Z'));
    expect(floorToSlot(new Date('2026-06-19T23:59:00.000Z'), 15)).toEqual(new Date('2026-06-19T23:45:00.000Z'));
  });
});

describe('deriveAdvisoryLockKey', () => {
  it('4.5-e/f: deterministic for the same seed (stable across instances); differs for a different seed', () => {
    expect(deriveAdvisoryLockKey('cbp-collect')).toBe(deriveAdvisoryLockKey('cbp-collect'));
    expect(deriveAdvisoryLockKey('cbp-collect')).not.toBe(deriveAdvisoryLockKey('some-other-seed'));
  });

  it('4.5-g: returns a non-negative integer safe for pg_try_advisory_lock(bigint)', () => {
    const key = deriveAdvisoryLockKey('cbp-collect');
    expect(Number.isInteger(key)).toBe(true);
    expect(key).toBeGreaterThanOrEqual(0);
  });
});
