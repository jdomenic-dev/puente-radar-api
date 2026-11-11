import { SEED_BRIDGES } from './seed-data.js';

/** Rough box around Ciudad Juárez - El Paso - Santa Teresa. */
const REGION = { minLat: 31.3, maxLat: 31.9, minLng: -106.8, maxLng: -106.0 };

describe('SEED_BRIDGES', () => {
  it('contains the six Juárez–El Paso bridges with unique slugs and CBP ports', () => {
    expect(SEED_BRIDGES).toHaveLength(6);
    expect(new Set(SEED_BRIDGES.map((b) => b.slug)).size).toBe(6);
    expect(new Set(SEED_BRIDGES.map((b) => b.cbpPortNumber)).size).toBe(6);
  });

  it('gives every bridge a short name for compact UI', () => {
    for (const bridge of SEED_BRIDGES) {
      expect(bridge.shortName && bridge.shortName.length > 0).toBe(true);
    }
  });

  it('gives every bridge coordinates inside the region', () => {
    for (const bridge of SEED_BRIDGES) {
      expect(bridge.latitude).toBeGreaterThan(REGION.minLat);
      expect(bridge.latitude).toBeLessThan(REGION.maxLat);
      expect(bridge.longitude).toBeGreaterThan(REGION.minLng);
      expect(bridge.longitude).toBeLessThan(REGION.maxLng);
    }
  });

  it('uses the opening hours CBP publishes for each port', () => {
    const hours = Object.fromEntries(SEED_BRIDGES.map((b) => [b.slug, [b.opensAt ?? null, b.closesAt ?? null]]));
    expect(hours).toEqual({
      'puente-libre': [null, null],
      'puente-santa-fe': [null, null],
      'puente-zaragoza': [null, null],
      'puente-stanton-lerdo': ['06:00', '24:00'],
      'puente-guadalupe-tornillo': ['06:00', '22:00'],
      'puente-santa-teresa': ['06:00', '22:00'],
    });
  });

  it('never defines only one end of the schedule', () => {
    for (const bridge of SEED_BRIDGES) {
      expect(Boolean(bridge.opensAt)).toBe(Boolean(bridge.closesAt));
    }
  });
});
