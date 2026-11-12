import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CameraStatus } from '../../common/enums/camera.enum.js';
import { CamerasService } from './cameras.service.js';

type Row = Record<string, unknown>;

const bridge = (id: string, sortOrder: number, extra: Row = {}): Row => ({
  id,
  slug: `slug-${id}`,
  name: `Puente ${id}`,
  shortName: `Corto ${id}`,
  tabLabel: null,
  sortOrder,
  ...extra,
});

const camera = (id: string, bridgeId: string, sortOrder: number, extra: Row = {}): Row => ({
  id,
  bridgeId,
  videoId: `vid${id}`.padEnd(11, 'x'),
  label: `Vista ${id}`,
  description: null,
  sortOrder,
  isActive: true,
  status: CameraStatus.Live,
  sourceName: 'Fideicomiso',
  sourceUrl: 'https://www.youtube.com/@fpfch',
  ...extra,
});

const duplicateKey = () =>
  new QueryFailedError('write', [], Object.assign(new Error('duplicate key value'), { code: '23505' }));

describe('CamerasService', () => {
  const repo = { find: jest.fn(), findOne: jest.fn(), count: jest.fn(), create: jest.fn(), save: jest.fn() };
  const bridges = { findActive: jest.fn(), findOneById: jest.fn(), findOneBySlug: jest.fn() };
  const service = () => new CamerasService(repo as never, bridges as never);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-11-12T12:00:00Z') });
    bridges.findActive.mockResolvedValue([bridge('b1', 1), bridge('b2', 2), bridge('b3', 3)]);
    repo.find.mockResolvedValue([camera('c1', 'b1', 2), camera('c2', 'b1', 1), camera('c3', 'b3', 1)]);
    repo.create.mockImplementation((x: Row) => ({ ...x }));
    repo.save.mockImplementation((x: Row) => Promise.resolve({ id: 'new', ...x }));
    repo.count.mockResolvedValue(2);
  });
  afterEach(() => jest.useRealTimers());

  describe('getPublicCameras', () => {
    it('lists bridges in catalog order with their cameras, leaving out bridges without cameras', async () => {
      const result = await service().getPublicCameras();

      expect(result.bridges.map((b) => b.bridgeId)).toEqual(['b1', 'b3']);
    });

    it('orders the cameras of a bridge by sortOrder', async () => {
      const result = await service().getPublicCameras();

      expect(result.bridges[0].cameras.map((c) => c.id)).toEqual(['c2', 'c1']);
    });

    it('asks only for active cameras', async () => {
      await service().getPublicCameras();

      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    });

    it('gives each bridge its tab label, falling back to the short name and then the name', async () => {
      bridges.findActive.mockResolvedValue([
        bridge('b1', 1, { tabLabel: 'Libre' }),
        bridge('b3', 2, { shortName: null }),
      ]);

      const result = await service().getPublicCameras();

      expect(result.bridges.map((b) => b.tabLabel)).toEqual(['Libre', 'Puente b3']);
    });

    it('carries what a client needs per camera: id, video id, label, description, status and credit', async () => {
      const result = await service().getPublicCameras();

      expect(result.bridges[1].cameras[0]).toEqual({
        id: 'c3',
        videoId: 'vidc3xxxxxx',
        label: 'Vista c3',
        description: null,
        status: 'live',
        source: { name: 'Fideicomiso', url: 'https://www.youtube.com/@fpfch' },
      });
    });

    it('keeps cameras whose status is unknown, so a failed check never hides a working stream', async () => {
      repo.find.mockResolvedValue([camera('c1', 'b1', 1, { status: CameraStatus.Unknown })]);

      const result = await service().getPublicCameras();

      expect(result.bridges[0].cameras[0].status).toBe('unknown');
    });

    it('reuses the answer for a minute and recomputes afterwards', async () => {
      const instance = service();

      await instance.getPublicCameras();
      jest.setSystemTime(new Date('2026-11-12T12:00:50Z'));
      await instance.getPublicCameras();
      expect(repo.find).toHaveBeenCalledTimes(1);

      jest.setSystemTime(new Date('2026-11-12T12:01:10Z'));
      await instance.getPublicCameras();
      expect(repo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('resolves the bridge by slug and stores the camera after the existing ones', async () => {
      bridges.findOneBySlug.mockResolvedValue(bridge('b1', 1));

      const saved = await service().create({ bridgeSlug: 'puente-libre', videoId: 'mp3RS0y77tY', label: 'Norte' });

      expect(bridges.findOneBySlug).toHaveBeenCalledWith('puente-libre');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bridgeId: 'b1', videoId: 'mp3RS0y77tY', label: 'Norte', sortOrder: 2 }),
      );
      expect(saved).toMatchObject({ videoId: 'mp3RS0y77tY' });
    });

    it('resolves the bridge by id when given one', async () => {
      bridges.findOneById.mockResolvedValue(bridge('b2', 2));

      await service().create({ bridgeId: 'b2', videoId: 'mp3RS0y77tY', label: 'Sur', sortOrder: 5 });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ bridgeId: 'b2', sortOrder: 5 }));
    });

    it('needs exactly one of bridgeId and bridgeSlug', async () => {
      await expect(service().create({ videoId: 'mp3RS0y77tY', label: 'x' })).rejects.toThrow(BadRequestException);
      await expect(
        service().create({ bridgeId: 'b1', bridgeSlug: 's', videoId: 'mp3RS0y77tY', label: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('answers 409 when the video is already registered', async () => {
      bridges.findOneBySlug.mockResolvedValue(bridge('b1', 1));
      repo.save.mockRejectedValue(duplicateKey());

      await expect(
        service().create({ bridgeSlug: 'puente-libre', videoId: 'mp3RS0y77tY', label: 'Norte' }),
      ).rejects.toThrow(ConflictException);
    });

    it('lets other database errors through untouched', async () => {
      bridges.findOneBySlug.mockResolvedValue(bridge('b1', 1));
      repo.save.mockRejectedValue(new Error('connection lost'));

      await expect(
        service().create({ bridgeSlug: 'puente-libre', videoId: 'mp3RS0y77tY', label: 'Norte' }),
      ).rejects.toThrow('connection lost');
    });

    it('makes the next public read see the new camera', async () => {
      const instance = service();
      bridges.findOneBySlug.mockResolvedValue(bridge('b1', 1));
      await instance.getPublicCameras();

      await instance.create({ bridgeSlug: 'puente-libre', videoId: 'mp3RS0y77tY', label: 'Norte' });
      await instance.getPublicCameras();

      expect(repo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('update', () => {
    it('answers 404 for an unknown camera', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service().update('nope', { label: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('changes only the fields that were sent', async () => {
      repo.findOne.mockResolvedValue(camera('c1', 'b1', 1, { label: 'Norte', description: 'a' }));

      const updated = await service().update('c1', { isActive: false });

      expect(updated).toMatchObject({ isActive: false, label: 'Norte', description: 'a' });
    });

    it('can replace the video id when the stream id changes', async () => {
      repo.findOne.mockResolvedValue(camera('c1', 'b1', 1));

      const updated = await service().update('c1', { videoId: 'sOHFG6_3zAs' });

      expect(updated).toMatchObject({ videoId: 'sOHFG6_3zAs' });
    });

    it('answers 409 when the new video id belongs to another camera', async () => {
      repo.findOne.mockResolvedValue(camera('c1', 'b1', 1));
      repo.save.mockRejectedValue(duplicateKey());

      await expect(service().update('c1', { videoId: 'sOHFG6_3zAs' })).rejects.toThrow(ConflictException);
    });

    it('makes the next public read see the change', async () => {
      const instance = service();
      repo.findOne.mockResolvedValue(camera('c1', 'b1', 1));
      await instance.getPublicCameras();

      await instance.update('c1', { isActive: false });
      await instance.getPublicCameras();

      expect(repo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('upsertSeed', () => {
    const seed = {
      bridgeSlug: 'puente-libre',
      videoId: 'mp3RS0y77tY',
      label: 'Norte',
      description: 'Mirando hacia EE. UU.',
      sortOrder: 0,
    };

    it('creates a camera that does not exist yet, attached to the bridge by slug', async () => {
      repo.findOne.mockResolvedValue(null);
      bridges.findOneBySlug.mockResolvedValue(bridge('b1', 1));

      await service().upsertSeed(seed);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bridgeId: 'b1', videoId: 'mp3RS0y77tY', label: 'Norte', sortOrder: 0 }),
      );
    });

    it('refreshes the reference data of an existing camera without touching what operations set', async () => {
      repo.findOne.mockResolvedValue(
        camera('c1', 'b1', 5, {
          videoId: 'mp3RS0y77tY',
          label: 'Viejo',
          isActive: false,
          status: CameraStatus.Offline,
        }),
      );

      const result = await service().upsertSeed(seed);

      expect(result).toMatchObject({ label: 'Norte', description: 'Mirando hacia EE. UU.', sortOrder: 0 });
      expect(result).toMatchObject({ isActive: false, status: CameraStatus.Offline }); // never reset by a re-seed
      expect(bridges.findOneBySlug).not.toHaveBeenCalled();
    });
  });
});
