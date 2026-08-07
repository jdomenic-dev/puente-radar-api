import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BridgesService } from '../../bridges/bridges.service.js';
import { HISTORICAL_CLOCK, HistoricalPatternsService } from './historical-patterns.service.js';
import { HistoricalRepository } from './historical.repository.js';
import { EstimatesModule } from '../estimates.module.js';

type HistoricalClockProvider = { provide: typeof HISTORICAL_CLOCK; useValue: () => Date };

function isHistoricalClockProvider(provider: unknown): provider is HistoricalClockProvider {
  return (
    typeof provider === 'object' &&
    provider !== null &&
    'provide' in provider &&
    provider.provide === HISTORICAL_CLOCK &&
    'useValue' in provider &&
    typeof provider.useValue === 'function'
  );
}

describe('HistoricalPatternsService DI', () => {
  it('instantiates through Nest with its production dependencies', async () => {
    const nestReflect = Reflect as unknown as { getMetadata(metadataKey: string, target: object): unknown };
    const metadata = nestReflect.getMetadata(MODULE_METADATA.PROVIDERS, EstimatesModule);
    const productionProviders = Array.isArray(metadata) ? metadata : [];
    const clockProvider = productionProviders.find(isHistoricalClockProvider);

    expect(clockProvider).toBeDefined();
    expect(clockProvider?.provide).toBe(HISTORICAL_CLOCK);
    expect(typeof clockProvider?.useValue).toBe('function');

    const module = await Test.createTestingModule({
      providers: [
        HistoricalPatternsService,
        { provide: HistoricalRepository, useValue: { findPatterns: jest.fn() } },
        { provide: BridgesService, useValue: { findActive: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        clockProvider as HistoricalClockProvider,
      ],
    }).compile();

    expect(module.get(HistoricalPatternsService)).toBeInstanceOf(HistoricalPatternsService);
  });
});
