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
