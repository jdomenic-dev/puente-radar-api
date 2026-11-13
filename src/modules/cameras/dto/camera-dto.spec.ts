import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCameraDto } from './create-camera.dto.js';
import { UpdateCameraDto } from './update-camera.dto.js';

const problems = async (cls: new () => object, body: object): Promise<string[]> => {
  const errors = await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
};

const valid = { bridgeSlug: 'puente-libre', videoId: 'mp3RS0y77tY', label: 'Norte' };

describe('CreateCameraDto', () => {
  it('accepts a minimal valid body', async () => {
    expect(await problems(CreateCameraDto, valid)).toEqual([]);
  });

  it('turns a pasted link into the bare video id', () => {
    const dto = plainToInstance(CreateCameraDto, {
      ...valid,
      videoId: 'https://www.youtube.com/watch?v=mp3RS0y77tY&source_ve_path=x',
    });

    expect(dto.videoId).toBe('mp3RS0y77tY');
  });

  it.each([
    ['a number', 12345678901],
    ['an object', { id: 'mp3RS0y77tY' }],
    ['an array', ['mp3RS0y77tY']],
    ['null', null],
  ])('rejects a videoId that is %s', async (_name, videoId) => {
    expect(await problems(CreateCameraDto, { ...valid, videoId })).toContain('videoId');
  });

  it('rejects a sortOrder beyond what the integer column can hold, instead of failing in the database', async () => {
    expect(await problems(CreateCameraDto, { ...valid, sortOrder: 99999999999 })).toContain('sortOrder');
  });

  it('rejects a bridgeSlug that no slug could be', async () => {
    expect(await problems(CreateCameraDto, { ...valid, bridgeSlug: 'x'.repeat(5000) })).toContain('bridgeSlug');
  });

  it('rejects a label that is only spaces', async () => {
    expect(await problems(CreateCameraDto, { ...valid, label: '    ' })).toContain('label');
  });

  it('trims the label and the description', () => {
    const dto = plainToInstance(CreateCameraDto, { ...valid, label: '  Norte  ', description: '  Hacia EE. UU.  ' });

    expect(dto.label).toBe('Norte');
    expect(dto.description).toBe('Hacia EE. UU.');
  });

  it('refuses fields it does not know, so nobody sets status or isActive when creating', async () => {
    expect(await problems(CreateCameraDto, { ...valid, isActive: false, status: 'live' })).toEqual(
      expect.arrayContaining(['isActive', 'status']),
    );
  });
});

describe('UpdateCameraDto', () => {
  it('accepts an empty body: nothing changes', async () => {
    expect(await problems(UpdateCameraDto, {})).toEqual([]);
  });

  it('rejects a status that is not live, offline or unknown', async () => {
    expect(await problems(UpdateCameraDto, { status: 'broken' })).toContain('status');
  });

  it('rejects an out-of-range sortOrder and a blank label', async () => {
    expect(await problems(UpdateCameraDto, { sortOrder: 99999999999, label: '   ' })).toEqual(
      expect.arrayContaining(['sortOrder', 'label']),
    );
  });

  it('refuses to move a camera to another bridge or rewrite its credit', async () => {
    expect(await problems(UpdateCameraDto, { bridgeId: 'x', sourceUrl: 'javascript:alert(1)' })).toEqual(
      expect.arrayContaining(['bridgeId', 'sourceUrl']),
    );
  });
});
