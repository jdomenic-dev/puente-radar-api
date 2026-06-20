/**
 * estimate.calculator.spec.ts
 *
 * Unit tests for the pure EstimateCalculator.
 * Tests are written RED-first per Strict TDD protocol.
 *
 * Hand-computed reference values (weights are exact fractions):
 *
 *   Agreement blend (official=50, community=40, sampleSize=3):
 *     base = (50 × 0.60 + 40 × 0.25) / 0.85 = 40 / 0.85 ≈ 47.06
 *     confidence = 100 (no penalties, community present) → HIGH
 *
 *   Disagreement blend (official=80, community=20, diff=60 > 30):
 *     Shifted weights: official → 0.25/0.85, community → 0.60/0.85
 *     base = (80 × 0.25 + 20 × 0.60) / 0.85 = 32 / 0.85 ≈ 37.65
 *     confidence = 100 − 20 (disagreement) = 80 → HIGH
 *     Result is closer to community (20) than to official (80) ✓
 *
 *   Cold-start (official only, no community):
 *     base = official.wait = 45
 *     confidence: 100, CBP-only ceiling → min(100, 70) = 70 → MEDIUM ✓
 */

import { calculateEstimate, CalculatorInput, CalculatorOutput } from './estimate.calculator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function input(overrides: Partial<CalculatorInput> = {}): CalculatorInput {
  return {
    cbpStale: false,
    sourceStale: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task B1.1 RED — cold-start, neither-unavailable, status thresholds, penalties
// ---------------------------------------------------------------------------

describe('EstimateCalculator — cold-start (CBP only)', () => {
  it('B1.1-a: cold-start → valid estimate, NOT unavailable', () => {
    const result = calculateEstimate(
      input({ official: { wait: 45, fresh: true, closed: false } }),
    );

    expect(result.estimateUnavailable).toBeUndefined();
    expect(result.estimatedWaitMinutes).toBe(45);
  });

  it('B1.1-b: cold-start → confidence score is exactly 70 (CBP-only ceiling)', () => {
    const result = calculateEstimate(
      input({ official: { wait: 45, fresh: true, closed: false } }),
    );

    expect(result.confidenceScore).toBe(70);
  });

  it('B1.1-c: cold-start → confidence label is MEDIUM (50-79 band)', () => {
    const result = calculateEstimate(
      input({ official: { wait: 45, fresh: true, closed: false } }),
    );

    expect(result.confidence).toBe('medium');
  });

  it('B1.1-d: cold-start → sourcesUsed contains "cbp"', () => {
    const result = calculateEstimate(
      input({ official: { wait: 45, fresh: true, closed: false } }),
    );

    expect(result.sourcesUsed).toContain('cbp');
  });
});

describe('EstimateCalculator — neither source usable', () => {
  it('B1.1-e: official.closed and no community → estimateUnavailable: laneClosed', () => {
    const result = calculateEstimate(
      input({ official: { wait: 0, fresh: false, closed: true } }),
    );

    expect(result.estimateUnavailable).toBe('laneClosed');
    expect(result.estimatedWaitMinutes).toBeUndefined();
  });

  it('B1.1-f: no official and no community → estimateUnavailable: noData', () => {
    const result = calculateEstimate(input());

    expect(result.estimateUnavailable).toBe('noData');
    expect(result.estimatedWaitMinutes).toBeUndefined();
  });

  it('B1.1-g: no official and community sampleSize=0 → estimateUnavailable: noData', () => {
    const result = calculateEstimate(
      input({ community: { value: 30, sampleSize: 0 } }),
    );

    expect(result.estimateUnavailable).toBe('noData');
  });
});

describe('EstimateCalculator — status thresholds', () => {
  it('B1.1-h: wait=30 → status low', () => {
    const result = calculateEstimate(
      input({ official: { wait: 30, fresh: true, closed: false } }),
    );
    expect(result.status).toBe('low');
  });

  it('B1.1-i: wait=31 → status medium', () => {
    const result = calculateEstimate(
      input({ official: { wait: 31, fresh: true, closed: false } }),
    );
    expect(result.status).toBe('medium');
  });

  it('B1.1-j: wait=60 → status medium', () => {
    const result = calculateEstimate(
      input({ official: { wait: 60, fresh: true, closed: false } }),
    );
    expect(result.status).toBe('medium');
  });

  it('B1.1-k: wait=61 → status high', () => {
    const result = calculateEstimate(
      input({ official: { wait: 61, fresh: true, closed: false } }),
    );
    expect(result.status).toBe('high');
  });

  it('B1.1-l: wait=120 → status high', () => {
    const result = calculateEstimate(
      input({ official: { wait: 120, fresh: true, closed: false } }),
    );
    expect(result.status).toBe('high');
  });

  it('B1.1-m: wait=121 → status saturated', () => {
    const result = calculateEstimate(
      input({ official: { wait: 121, fresh: true, closed: false } }),
    );
    expect(result.status).toBe('saturated');
  });
});

describe('EstimateCalculator — confidence penalties', () => {
  it('B1.1-n: cbpStale=true → -20 penalty (70 base ceiling − ... wait, cbpStale only)', () => {
    // official-only (CBP-only ceiling = min(score, 70))
    // cbpStale adds -20 penalty before ceiling: score = 100 − 20 = 80, then min(80, 70) = 70
    // Wait: ceiling applies AFTER penalties? Let's clarify: penalties first then ceiling.
    // score = 100 − 20 (stale) = 80; cbp-only ceiling → min(80, 70) = 70
    const result = calculateEstimate(
      input({ official: { wait: 45, fresh: true, closed: false }, cbpStale: true }),
    );
    expect(result.confidenceScore).toBe(70); // ceiling still dominates
  });

  it('B1.1-o: sourceStale=true → -15 penalty (CBP-only: min(85,70)=70)', () => {
    const result = calculateEstimate(
      input({ official: { wait: 45, fresh: true, closed: false }, sourceStale: true }),
    );
    expect(result.confidenceScore).toBe(70); // min(85, 70)
  });

  it('B1.1-p: community sampleSize=1 → -15 penalty (no CBP-only ceiling since community present)', () => {
    // official + community sampleSize=1 → score = 100 − 15 = 85
    // community IS present so NO CBP-only ceiling
    const result = calculateEstimate(
      input({
        official: { wait: 45, fresh: true, closed: false },
        community: { value: 40, sampleSize: 1 },
      }),
    );
    expect(result.confidenceScore).toBe(85);
    expect(result.confidence).toBe('high');
  });

  it('B1.1-q: community sampleSize=2 → -15 penalty', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 45, fresh: true, closed: false },
        community: { value: 40, sampleSize: 2 },
      }),
    );
    expect(result.confidenceScore).toBe(85);
  });

  it('B1.1-r: community sampleSize=3 → no sampleSize penalty', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 45, fresh: true, closed: false },
        community: { value: 40, sampleSize: 3 },
      }),
    );
    expect(result.confidenceScore).toBe(100);
    expect(result.confidence).toBe('high');
  });

  it('B1.1-s: closed lane → -25 penalty (CBP-only ceiling not relevant since unavailable)', () => {
    // official.closed → unavailable (laneClosed); confidence computed anyway for reporting
    const result = calculateEstimate(
      input({ official: { wait: 0, fresh: false, closed: true } }),
    );
    // score = 100 − 25 = 75 (but CBP-only ceiling → min(75,70)=70 since no community)
    expect(result.confidenceScore).toBe(70);
  });

  it('B1.1-t: penalties stack and clamp to 0', () => {
    // cbpStale(-20) + sourceStale(-15) + sampleSize 1(-15) + disagreement >30(-20) = -70
    // score = 100 - 70 = 30 → low
    // disagreement: official=90, community=10 (diff=80 > 30)
    // community present → no CBP-only ceiling
    const result = calculateEstimate(
      input({
        official: { wait: 90, fresh: true, closed: false },
        community: { value: 10, sampleSize: 1 },
        cbpStale: true,
        sourceStale: true,
      }),
    );
    expect(result.confidenceScore).toBe(30);
    expect(result.confidence).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// Task B1.2 RED — blend normalization, admin additive, disagreement, inactive adjustment
// ---------------------------------------------------------------------------

describe('EstimateCalculator — blend normalization (both sources present)', () => {
  /**
   * official=50, community=40, sampleSize=3 (no penalty), no admin, no stale
   * base = (50 × 0.60 + 40 × 0.25) / (0.60 + 0.25)
   *       = (30 + 10) / 0.85
   *       = 40 / 0.85
   *       ≈ 47.0588...
   */
  it('B1.2-a: blended estimate = (50×0.60 + 40×0.25)/0.85 ≈ 47.06', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 50, fresh: true, closed: false },
        community: { value: 40, sampleSize: 3 },
      }),
    );

    // exact: 40/0.85 = 47.0588...
    expect(result.estimatedWaitMinutes).toBeCloseTo(47.06, 1);
  });

  it('B1.2-b: blended confidence = 100 (no penalties, large sampleSize)', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 50, fresh: true, closed: false },
        community: { value: 40, sampleSize: 3 },
      }),
    );

    expect(result.confidenceScore).toBe(100);
    expect(result.confidence).toBe('high');
  });

  it('B1.2-c: sourcesUsed contains both "cbp" and "community"', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 50, fresh: true, closed: false },
        community: { value: 40, sampleSize: 3 },
      }),
    );

    expect(result.sourcesUsed).toContain('cbp');
    expect(result.sourcesUsed).toContain('community');
  });
});

describe('EstimateCalculator — admin additive', () => {
  it('B1.2-d: admin additive: final = base + adminAdjustmentMinutes (CBP-only base)', () => {
    // official only (base=40), admin=10 → final=50
    const result = calculateEstimate(
      input({
        official: { wait: 40, fresh: true, closed: false },
        adminAdjustmentMinutes: 10,
      }),
    );

    expect(result.estimatedWaitMinutes).toBe(50);
    expect(result.sourcesUsed).toContain('admin');
  });

  it('B1.2-e: admin=null → not active, additive term=0 (CBP-only base=40)', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 40, fresh: true, closed: false },
        adminAdjustmentMinutes: null,
      }),
    );

    expect(result.estimatedWaitMinutes).toBe(40);
    expect(result.sourcesUsed).not.toContain('admin');
  });

  it('B1.2-f: admin=undefined → not active, additive term=0', () => {
    const result = calculateEstimate(
      input({ official: { wait: 40, fresh: true, closed: false } }),
    );

    expect(result.estimatedWaitMinutes).toBe(40);
    expect(result.sourcesUsed).not.toContain('admin');
  });

  it('B1.2-g: negative admin adjustment clamps final to 0 (base=10, admin=-20)', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 10, fresh: true, closed: false },
        adminAdjustmentMinutes: -20,
      }),
    );

    expect(result.estimatedWaitMinutes).toBe(0);
  });

  it('B1.2-h: admin with both sources — additive on top of blended base', () => {
    // base = (50×0.60 + 40×0.25)/0.85 ≈ 47.06, admin=5 → final ≈ 52.06
    const result = calculateEstimate(
      input({
        official: { wait: 50, fresh: true, closed: false },
        community: { value: 40, sampleSize: 3 },
        adminAdjustmentMinutes: 5,
      }),
    );

    expect(result.estimatedWaitMinutes).toBeCloseTo(52.06, 1);
    expect(result.sourcesUsed).toContain('admin');
  });
});

describe('EstimateCalculator — strong disagreement (|official − community| > 30)', () => {
  /**
   * official=80, community=20, diff=60 > 30 → community-dominant shift
   * Shifted weights: official → 0.25 (was community weight), community → 0.60 (was official weight)
   * Renormalized over present sources: sum = 0.25 + 0.60 = 0.85
   * base = (80 × 0.25 + 20 × 0.60) / 0.85 = (20 + 12) / 0.85 = 32 / 0.85 ≈ 37.647
   * confidence: 100 − 20 (disagreement) = 80
   */
  it('B1.2-i: disagreement → base ≈ 37.65 (shifted toward community)', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 80, fresh: true, closed: false },
        community: { value: 20, sampleSize: 3 },
      }),
    );

    // 32/0.85 = 37.6470...
    expect(result.estimatedWaitMinutes).toBeCloseTo(37.65, 1);
  });

  it('B1.2-j: disagreement result is closer to community (20) than to official (80)', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 80, fresh: true, closed: false },
        community: { value: 20, sampleSize: 3 },
      }),
    );

    const distToCommunity = Math.abs(result.estimatedWaitMinutes! - 20);
    const distToOfficial = Math.abs(result.estimatedWaitMinutes! - 80);
    expect(distToCommunity).toBeLessThan(distToOfficial);
  });

  it('B1.2-k: disagreement → confidence score = 80 (100 − 20 penalty)', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 80, fresh: true, closed: false },
        community: { value: 20, sampleSize: 3 },
      }),
    );

    expect(result.confidenceScore).toBe(80);
    expect(result.confidence).toBe('high');
  });

  it('B1.2-l: agreement (diff=30 exactly, not >30) → normal weights', () => {
    // diff = 70 − 40 = 30 — NOT >30, so normal weights apply
    // base = (70×0.60 + 40×0.25)/0.85 = (42+10)/0.85 = 52/0.85 ≈ 61.18
    const result = calculateEstimate(
      input({
        official: { wait: 70, fresh: true, closed: false },
        community: { value: 40, sampleSize: 3 },
      }),
    );

    // Should NOT be shifted: 52/0.85 ≈ 61.18
    expect(result.estimatedWaitMinutes).toBeCloseTo(61.18, 1);
    // No disagreement penalty → confidence = 100
    expect(result.confidenceScore).toBe(100);
  });
});

describe('EstimateCalculator — community-only (official closed or absent)', () => {
  it('B1.2-m: official.closed=true, community present → uses community value', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 0, fresh: false, closed: true },
        community: { value: 35, sampleSize: 2 },
      }),
    );

    expect(result.estimatedWaitMinutes).toBe(35);
    expect(result.estimateUnavailable).toBeUndefined();
  });

  it('B1.2-n: official absent, community present → uses community value', () => {
    const result = calculateEstimate(
      input({ community: { value: 25, sampleSize: 4 } }),
    );

    expect(result.estimatedWaitMinutes).toBe(25);
    expect(result.estimateUnavailable).toBeUndefined();
  });

  it('B1.2-o: community-only → sourcesUsed contains "community" not "cbp"', () => {
    const result = calculateEstimate(
      input({ community: { value: 25, sampleSize: 4 } }),
    );

    expect(result.sourcesUsed).toContain('community');
    expect(result.sourcesUsed).not.toContain('cbp');
  });

  it('B1.2-p: community sampleSize=2 → -15 penalty applied (no CBP-only ceiling)', () => {
    const result = calculateEstimate(
      input({
        official: { wait: 0, fresh: false, closed: true },
        community: { value: 35, sampleSize: 2 },
      }),
    );

    // score = 100 − 25 (closed) − 15 (sampleSize 1-2) = 60 → medium
    // But wait: official.closed means the lane IS closed, penalty applies
    expect(result.confidenceScore).toBe(60);
    expect(result.confidence).toBe('medium');
  });
});
