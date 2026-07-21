import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard.js';

describe('ApiKeyGuard', () => {
  const handler = () => undefined;
  class TestController {}

  function createGuard(expectedKey?: string, isPublic = false) {
    const configService = {
      get: jest.fn().mockReturnValue(expectedKey),
    } as unknown as ConfigService;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;

    return new ApiKeyGuard(configService, reflector);
  }

  function createContext(providedKey?: string): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({
          headers: providedKey === undefined ? {} : { 'x-api-key': providedKey },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows explicitly public endpoints without a configured key', () => {
    expect(createGuard(undefined, true).canActivate(createContext())).toBe(true);
  });

  it.each([undefined, '', '   '])('fails closed when the configured key is %p', (expectedKey) => {
    expect(() => createGuard(expectedKey).canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('rejects a missing key', () => {
    expect(() => createGuard('expected-key').canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('rejects an invalid key', () => {
    expect(() => createGuard('expected-key').canActivate(createContext('invalid-key'))).toThrow(UnauthorizedException);
  });

  it('accepts a valid key', () => {
    expect(createGuard('expected-key').canActivate(createContext('expected-key'))).toBe(true);
  });
});
