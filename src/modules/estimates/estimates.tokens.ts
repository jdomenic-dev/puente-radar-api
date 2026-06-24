/**
 * estimates.tokens.ts
 *
 * DI tokens for the estimates module, kept in a standalone file to avoid
 * circular imports between estimates.module.ts and estimates.service.ts.
 */

/** Injection token for the CBP cache layer (CbpRedisCache). */
export const CBP_CACHE = 'CBP_CACHE';
