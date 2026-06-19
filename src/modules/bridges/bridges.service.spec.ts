import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';
import { BridgesService } from './bridges.service.js';
import { Bridge } from './entities/bridge.entity.js';
import { BridgeStatus, WaitTrend } from '../../common/enums/bridge.enum.js';

type MockRepository<T extends ObjectLiteral = ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockRepository = <T extends ObjectLiteral = ObjectLiteral>(): MockRepository<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
});

function makeBridge(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: 'uuid-1',
    name: 'Puente Libre / Córdova-Américas',
    slug: 'puente-libre',
    status: BridgeStatus.Low,
    waitMinutes: null,
    trend: null,
    sortOrder: 1,
    lastUpdatedAt: null,
    cbpPortNumber: null,
    reports: [],
    ...overrides,
  };
}

describe('BridgesService', () => {
  let service: BridgesService;
  let repo: MockRepository<Bridge>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgesService,
        {
          provide: getRepositoryToken(Bridge),
          useValue: createMockRepository<Bridge>(),
        },
      ],
    }).compile();

    service = module.get<BridgesService>(BridgesService);
    repo = module.get<MockRepository<Bridge>>(getRepositoryToken(Bridge));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns an array of bridges ordered by sortOrder then name', async () => {
      const bridges = [makeBridge({ sortOrder: 1 }), makeBridge({ id: 'uuid-2', sortOrder: 2 })];
      repo.find!.mockResolvedValue(bridges);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({
        where: { status: undefined },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      expect(result).toEqual(bridges);
    });

    it('returns empty array when no bridges exist', async () => {
      repo.find!.mockResolvedValue([]);

      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  // ── findOneById ───────────────────────────────────────────────────────────

  describe('findOneById()', () => {
    it('returns the bridge when found', async () => {
      const bridge = makeBridge();
      repo.findOne!.mockResolvedValue(bridge);

      const result = await service.findOneById('uuid-1');
      expect(result).toEqual(bridge);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    });

    it('throws NotFoundException when bridge is missing', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.findOneById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOneBySlug ─────────────────────────────────────────────────────────

  describe('findOneBySlug()', () => {
    it('returns the bridge when found by slug', async () => {
      const bridge = makeBridge();
      repo.findOne!.mockResolvedValue(bridge);

      const result = await service.findOneBySlug('puente-libre');
      expect(result).toEqual(bridge);
    });

    it('throws NotFoundException for unknown slug', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.findOneBySlug('unknown-slug')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('updates status, waitMinutes, and trend and saves', async () => {
      const bridge = makeBridge();
      repo.findOne!.mockResolvedValue(bridge);
      const updated = { ...bridge, status: BridgeStatus.High, waitMinutes: 75, trend: WaitTrend.Rising };
      repo.save!.mockResolvedValue(updated);

      const result = await service.updateStatus('uuid-1', {
        status: BridgeStatus.High,
        waitMinutes: 75,
        trend: WaitTrend.Rising,
      });

      expect(repo.save).toHaveBeenCalled();
      expect(result.status).toBe(BridgeStatus.High);
      expect(result.waitMinutes).toBe(75);
    });

    it('throws NotFoundException when updating non-existent bridge', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.updateStatus('nonexistent', { status: BridgeStatus.High })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── upsertBySlug ──────────────────────────────────────────────────────────

  describe('upsertBySlug()', () => {
    it('creates a new bridge when slug does not exist', async () => {
      repo.findOne!.mockResolvedValue(null);
      const newBridge = makeBridge({ slug: 'puente-nuevo', cbpPortNumber: null });
      repo.create!.mockReturnValue(newBridge);
      repo.save!.mockResolvedValue(newBridge);

      const result = await service.upsertBySlug({ name: 'Puente Nuevo', slug: 'puente-nuevo' });

      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
      expect(result.slug).toBe('puente-nuevo');
    });

    it('updates cbpPortNumber on an existing row and saves', async () => {
      const existing = makeBridge({ slug: 'puente-libre', cbpPortNumber: null });
      repo.findOne!.mockResolvedValue(existing);
      const updated = { ...existing, cbpPortNumber: 240201 };
      repo.save!.mockResolvedValue(updated);

      const result = await service.upsertBySlug({ name: 'Puente Libre / Córdova-Américas', slug: 'puente-libre', cbpPortNumber: 240201 });

      expect(repo.save).toHaveBeenCalled();
      expect(result.cbpPortNumber).toBe(240201);
    });

    it('does not overwrite cbpPortNumber when dto omits it', async () => {
      const existing = makeBridge({ slug: 'puente-libre', cbpPortNumber: 240201 });
      repo.findOne!.mockResolvedValue(existing);
      const saved = { ...existing };
      repo.save!.mockResolvedValue(saved);

      const result = await service.upsertBySlug({ name: 'Puente Libre / Córdova-Américas', slug: 'puente-libre' });

      expect(result.cbpPortNumber).toBe(240201);
    });
  });

  // ── getHomeSummary ────────────────────────────────────────────────────────

  describe('getHomeSummary()', () => {
    it('returns aggregated summary with recentReportCount from raw results', async () => {
      const bridge = makeBridge();
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawAndEntities: jest.fn().mockResolvedValue({
          entities: [bridge],
          raw: [{ recentReportCount: '3' }],
        }),
      };
      repo.createQueryBuilder!.mockReturnValue(mockQb);

      const result = await service.getHomeSummary();

      expect(result).toHaveLength(1);
      expect(result[0].recentReportCount).toBe(3);
      expect(result[0].id).toBe(bridge.id);
      expect(result[0].slug).toBe(bridge.slug);
    });

    it('defaults recentReportCount to 0 when raw value is missing', async () => {
      const bridge = makeBridge();
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawAndEntities: jest.fn().mockResolvedValue({
          entities: [bridge],
          raw: [{}],
        }),
      };
      repo.createQueryBuilder!.mockReturnValue(mockQb);

      const result = await service.getHomeSummary();
      expect(result[0].recentReportCount).toBe(0);
    });
  });
});
