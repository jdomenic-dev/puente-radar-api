import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBridgeDto } from './create-bridge.dto.js';

const base = { name: 'Puente Libre', slug: 'puente-libre' };

async function errorsFor(extra: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateBridgeDto, { ...base, ...extra }));
  return errors.map((e) => e.property);
}

describe('CreateBridgeDto — catalog fields', () => {
  it('accepts a bridge with the full catalog', async () => {
    expect(
      await errorsFor({
        shortName: 'Puente Libre',
        latitude: 31.76521,
        longitude: -106.45159,
        opensAt: '06:00',
        closesAt: '24:00',
      }),
    ).toEqual([]);
  });

  it('keeps every catalog field optional', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('rejects out-of-range coordinates', async () => {
    expect(await errorsFor({ latitude: 91 })).toContain('latitude');
    expect(await errorsFor({ longitude: -181 })).toContain('longitude');
  });

  it('rejects malformed opening times', async () => {
    expect(await errorsFor({ opensAt: '6am' })).toContain('opensAt');
    expect(await errorsFor({ closesAt: '25:00' })).toContain('closesAt');
    expect(await errorsFor({ opensAt: '24:00' })).toContain('opensAt');
  });

  it('rejects an empty short name', async () => {
    expect(await errorsFor({ shortName: '' })).toContain('shortName');
  });
});
