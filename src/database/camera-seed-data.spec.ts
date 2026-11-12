import { SEED_BRIDGES } from './seed-data.js';
import { SEED_CAMERAS } from './camera-seed-data.js';
import { isYouTubeVideoId } from '../modules/cameras/youtube-video-id.js';

describe('SEED_CAMERAS', () => {
  it('uses valid YouTube video ids, each one only once', () => {
    const ids = SEED_CAMERAS.map((c) => c.videoId);

    expect(ids.every(isYouTubeVideoId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attaches every camera to a bridge of the seed', () => {
    const slugs = new Set(SEED_BRIDGES.map((b) => b.slug));

    for (const camera of SEED_CAMERAS) expect(slugs.has(camera.bridgeSlug)).toBe(true);
  });

  it('numbers the views of each bridge from 0 without gaps', () => {
    const bySlug = new Map<string, number[]>();
    for (const c of SEED_CAMERAS) bySlug.set(c.bridgeSlug, [...(bySlug.get(c.bridgeSlug) ?? []), c.sortOrder]);

    for (const orders of bySlug.values()) expect([...orders].sort()).toEqual(orders.map((_, i) => i));
  });

  it('gives every seeded bridge a tab label short enough for a tab', () => {
    for (const bridge of SEED_BRIDGES) {
      expect(bridge.tabLabel?.length ?? 0).toBeGreaterThan(0);
      expect((bridge.tabLabel ?? '').length).toBeLessThanOrEqual(11);
    }
  });
});
