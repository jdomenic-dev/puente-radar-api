/**
 * estimate.calculator.ts
 *
 * Pure, no-I/O EstimateCalculator.
 * No NestJS decorators, no repositories, no network calls.
 * This makes it trivially testable and injectable into Slice C.
 *
 * Exports:
 *   - calculateEstimate (pure function) — used directly in tests and by EstimateCalculator class.
 *   - EstimateCalculator (@Injectable class) — thin NestJS wrapper; inject via DI into EstimatesService.
 *
 * Design reference: design.md rev2 — "Admin-adjusted component",
 * "Cold-start & Confidence", "Interfaces / Contracts".
 *
 * Weight constants (per design):
 *   Normal blend  — official: 0.60, community: 0.25, admin-slot: 0.15 (reserved)
 *   Renormalized over present sources only.
 *   With official + community both present (no admin slot in base):
 *     official  = 0.60 / 0.85
 *     community = 0.25 / 0.85
 *
 * Disagreement shift (|official.wait − community.value| > 30):
 *   Swap the weight roles: official → 0.25 / 0.85, community → 0.60 / 0.85.
 *   This makes the blend community-dominant while keeping the sum = 1.
 *   The -20 confidence penalty is ALSO applied.
 */

import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OfficialSource {
  wait: number;
  fresh: boolean;
  closed: boolean;
}

export interface CommunitySource {
  value: number;
  sampleSize: number;
}

export interface CalculatorInput {
  official?: OfficialSource;
  community?: CommunitySource;
  /** null or undefined → adjustment not active */
  adminAdjustmentMinutes?: number | null;
  cbpStale: boolean;
  sourceStale: boolean;
}

export type EstimateStatus = 'low' | 'medium' | 'high' | 'saturated';
export type ConfidenceLabel = 'low' | 'medium' | 'high';
export type UnavailableReason = 'laneClosed' | 'noData';

export interface CalculatorOutput {
  estimatedWaitMinutes?: number;
  estimateUnavailable?: UnavailableReason;
  status: EstimateStatus;
  confidenceScore: number;
  confidence: ConfidenceLabel;
  sourcesUsed: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Normal base weights (admin slot is reserved, not part of base blend). */
const W_OFFICIAL_NORMAL = 0.60;
const W_COMMUNITY_NORMAL = 0.25;
const W_SUM_NORMAL = W_OFFICIAL_NORMAL + W_COMMUNITY_NORMAL; // 0.85

/** Disagreement-shifted weights: swap roles to make community dominant. */
const W_OFFICIAL_SHIFTED = 0.25;
const W_COMMUNITY_SHIFTED = 0.60;
const W_SUM_SHIFTED = W_OFFICIAL_SHIFTED + W_COMMUNITY_SHIFTED; // 0.85

/** Maximum confidence score when there are ZERO usable community reports. */
const CBP_ONLY_CEILING = 70;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeStatus(minutes: number): EstimateStatus {
  if (minutes <= 30) return 'low';
  if (minutes <= 60) return 'medium';
  if (minutes <= 120) return 'high';
  return 'saturated';
}

function computeConfidenceLabel(score: number): ConfidenceLabel {
  if (score <= 49) return 'low';
  if (score <= 79) return 'medium';
  return 'high';
}

/**
 * Returns true when the admin adjustment is active.
 * Active = adminAdjustmentMinutes is a non-null, non-undefined number.
 */
function isAdminActive(adminAdjustmentMinutes: number | null | undefined): adminAdjustmentMinutes is number {
  return adminAdjustmentMinutes !== null && adminAdjustmentMinutes !== undefined;
}

// ---------------------------------------------------------------------------
// Main calculator (pure function)
// ---------------------------------------------------------------------------

export function calculateEstimate(input: CalculatorInput): CalculatorOutput {
  const { official, community, adminAdjustmentMinutes, cbpStale, sourceStale } = input;

  // ------------------------------------------------------------------
  // 1. Determine which sources are usable
  // ------------------------------------------------------------------
  const officialUsable = official !== undefined && !official.closed;
  const communityUsable =
    community !== undefined && community.sampleSize > 0;

  // Detect "closed lane" vs "no data" for unavailable paths
  const officialClosed = official !== undefined && official.closed;

  // ------------------------------------------------------------------
  // 2. Confidence score — compute penalties before clamping/ceiling
  // ------------------------------------------------------------------
  let score = 100;

  // Stale CBP snapshot
  if (cbpStale) score -= 20;

  // Stale source fallback
  if (sourceStale) score -= 15;

  // Community sample size 1 or 2 → small sample penalty
  if (communityUsable && community!.sampleSize <= 2) score -= 15;

  // Closed or N/A lane
  if (officialClosed) score -= 25;

  // Disagreement > 30 (computed against raw values; penalty applied regardless of which source wins)
  const disagreement =
    officialUsable && communityUsable
      ? Math.abs(official!.wait - community!.value) > 30
      : false;

  if (disagreement) score -= 20;

  // CBP-only ceiling: when there are ZERO usable community reports, cap at 70
  const cbpOnlyMode = !communityUsable;
  if (cbpOnlyMode) {
    score = Math.min(score, CBP_ONLY_CEILING);
  }

  // Clamp final score to [0, 100]
  score = Math.max(0, Math.min(100, score));

  // ------------------------------------------------------------------
  // 3. Compute base estimate via weighted blend over PRESENT sources
  // ------------------------------------------------------------------

  let base: number | undefined;
  const sourcesUsed: string[] = [];

  if (officialUsable && communityUsable) {
    // Both present — blend with (possibly shifted) weights
    let wOfficial: number;
    let wCommunity: number;
    let wSum: number;

    if (disagreement) {
      // Shift: community-dominant
      // official → 0.25 / 0.85, community → 0.60 / 0.85
      wOfficial = W_OFFICIAL_SHIFTED;
      wCommunity = W_COMMUNITY_SHIFTED;
      wSum = W_SUM_SHIFTED;
    } else {
      // Normal weights
      // official → 0.60 / 0.85, community → 0.25 / 0.85
      wOfficial = W_OFFICIAL_NORMAL;
      wCommunity = W_COMMUNITY_NORMAL;
      wSum = W_SUM_NORMAL;
    }

    base = (official!.wait * wOfficial + community!.value * wCommunity) / wSum;
    sourcesUsed.push('cbp', 'community');

  } else if (officialUsable) {
    // CBP-only (cold-start)
    base = official!.wait;
    sourcesUsed.push('cbp');

  } else if (communityUsable) {
    // Community-only (official absent or closed)
    base = community!.value;
    sourcesUsed.push('community');

  } else {
    // Neither source is usable → unavailable
    const reason: UnavailableReason = officialClosed ? 'laneClosed' : 'noData';

    // Status and confidence still reported for context
    const fallbackStatus = computeStatus(0); // arbitrary but consistent
    return {
      estimateUnavailable: reason,
      status: fallbackStatus,
      confidenceScore: score,
      confidence: computeConfidenceLabel(score),
      sourcesUsed: [],
    };
  }

  // ------------------------------------------------------------------
  // 4. Admin additive on top of base
  // ------------------------------------------------------------------
  let final = base;
  if (isAdminActive(adminAdjustmentMinutes)) {
    final = base + adminAdjustmentMinutes;
    sourcesUsed.push('admin');
  }

  // Clamp final estimate to >= 0
  final = Math.max(0, final);

  return {
    estimatedWaitMinutes: final,
    status: computeStatus(final),
    confidenceScore: score,
    confidence: computeConfidenceLabel(score),
    sourcesUsed,
  };
}

// ---------------------------------------------------------------------------
// Injectable wrapper (NestJS DI)
// ---------------------------------------------------------------------------

/**
 * Thin @Injectable wrapper around the pure calculateEstimate function.
 * Provides NestJS-compatible DI for EstimatesService without adding any I/O.
 */
@Injectable()
export class EstimateCalculator {
  calculate(input: CalculatorInput): CalculatorOutput {
    return calculateEstimate(input);
  }
}
