import 'reflect-metadata';
import { validate } from './env.validation.js';

const requiredConfig = {
  DATABASE_HOST: 'localhost',
  DATABASE_USER: 'test',
  DATABASE_PASSWORD: 'test',
  DATABASE_NAME: 'test',
};

describe('environment validation', () => {
  it.each([
    undefined,
    '',
    'short-key',
    ' '.repeat(32),
    `${'a'.repeat(16)}${' '.repeat(32)}${'b'.repeat(15)}`,
    `${'a'.repeat(31)}\t\n`,
  ])('rejects an inadequate production ADMIN_API_KEY (%p)', (adminApiKey) => {
    expect(() =>
      validate({
        ...requiredConfig,
        NODE_ENV: 'production',
        ADMIN_API_KEY: adminApiKey,
      }),
    ).toThrow('ADMIN_API_KEY must contain at least 32 non-whitespace characters in production.');
  });

  it('accepts a strong production ADMIN_API_KEY', () => {
    expect(
      validate({
        ...requiredConfig,
        NODE_ENV: 'production',
        ADMIN_API_KEY: 'a'.repeat(32),
      }).ADMIN_API_KEY,
    ).toHaveLength(32);
  });

  it('preserves internal whitespace when at least 32 non-whitespace characters are present', () => {
    const adminApiKey = `${'a'.repeat(16)} ${'b'.repeat(16)}`;

    expect(
      validate({
        ...requiredConfig,
        NODE_ENV: 'production',
        ADMIN_API_KEY: adminApiKey,
      }).ADMIN_API_KEY,
    ).toBe(adminApiKey);
  });

  it('keeps ADMIN_API_KEY optional outside production', () => {
    expect(validate({ ...requiredConfig, NODE_ENV: 'test' }).ADMIN_API_KEY).toBeUndefined();
  });
});

describe('historical collection configuration', () => {
  it('defaults every historical field to a safe, disabled state when omitted', () => {
    const result = validate({ ...requiredConfig });

    expect(result.HISTORICAL_TZ).toBe('America/Ciudad_Juarez');
    expect(result.HISTORICAL_COLLECTION_ENABLED).toBe('false');
    expect(result.HISTORICAL_API_ENABLED).toBe('false');
    expect(result.HISTORICAL_CADENCE_MINUTES).toBe(15);
    expect(result.HISTORICAL_MIN_DATES).toBe(6);
    expect(result.HISTORICAL_MIN_COVERAGE_RATIO).toBe(0.7);
  });

  it('accepts explicit overrides for every historical field, converting numeric strings', () => {
    const result = validate({
      ...requiredConfig,
      HISTORICAL_TZ: 'America/Denver',
      HISTORICAL_COLLECTION_ENABLED: 'true',
      HISTORICAL_API_ENABLED: 'true',
      HISTORICAL_CADENCE_MINUTES: '30',
      HISTORICAL_MIN_DATES: '10',
      HISTORICAL_MIN_COVERAGE_RATIO: '0.85',
    });

    expect(result.HISTORICAL_TZ).toBe('America/Denver');
    expect(result.HISTORICAL_COLLECTION_ENABLED).toBe('true');
    expect(result.HISTORICAL_API_ENABLED).toBe('true');
    expect(result.HISTORICAL_CADENCE_MINUTES).toBe(30);
    expect(result.HISTORICAL_MIN_DATES).toBe(10);
    expect(result.HISTORICAL_MIN_COVERAGE_RATIO).toBe(0.85);
  });

  it('rejects a cadence below 1 minute', () => {
    expect(() => validate({ ...requiredConfig, HISTORICAL_CADENCE_MINUTES: '0' })).toThrow();
  });

  it('rejects a coverage ratio outside the 0-1 range', () => {
    expect(() => validate({ ...requiredConfig, HISTORICAL_MIN_COVERAGE_RATIO: '1.5' })).toThrow();
    expect(() => validate({ ...requiredConfig, HISTORICAL_MIN_COVERAGE_RATIO: '-0.1' })).toThrow();
  });
});
