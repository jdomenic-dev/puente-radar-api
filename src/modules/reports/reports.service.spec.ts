import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';
import { ReportsService } from './reports.service.js';
import { BridgesService } from '../bridges/bridges.service.js';
import { Report } from './entities/report.entity.js';
import { Bridge } from '../bridges/entities/bridge.entity.js';
import { ReportSource, ReportStatus } from '../../common/enums/report.enum.js';
import { BridgeStatus } from '../../common/enums/bridge.enum.js';
import { LaneType } from '../../common/enums/lane.enum.js';

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
    id: 'bridge-uuid-1',
    name: 'Puente Libre',
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

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-uuid-1',
    bridgeId: 'bridge-uuid-1',
    bridge: makeBridge(),
    reportedWaitMinutes: 30,
    laneType: LaneType.General,
    source: ReportSource.User,
    lineStatus: ReportStatus.Pending,
    comment: null,
    anonymousDeviceId: null,
    createdAt: new Date('2026-06-18T12:00:00Z'),
    ...overrides,
  };
}

const mockBridgesService = {
  findOneById: jest.fn(),
  getHomeSummary: jest.fn(),
};

describe('ReportsService', () => {
  let service: ReportsService;
  let repo: MockRepository<Report>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Report),
          useValue: createMockRepository<Report>(),
        },
        {
          provide: BridgesService,
          useValue: mockBridgesService,
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    repo = module.get<MockRepository<Report>>(getRepositoryToken(Report));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates and saves a report when bridge exists', async () => {
      const bridge = makeBridge();
      mockBridgesService.findOneById.mockResolvedValue(bridge);

      const created = makeReport();
      repo.create!.mockReturnValue(created);
      repo.save!.mockResolvedValue(created);

      const result = await service.create({
        bridgeId: 'bridge-uuid-1',
        laneType: LaneType.General,
        lineStatus: ReportStatus.Pending,
        reportedWaitMinutes: 30,
      });

      expect(mockBridgesService.findOneById).toHaveBeenCalledWith('bridge-uuid-1');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bridgeId: 'bridge-uuid-1',
          lineStatus: ReportStatus.Pending,
          reportedWaitMinutes: 30,
          source: ReportSource.User,
        }),
      );
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it('saves reportedWaitMinutes as null (not 0) when omitted', async () => {
      mockBridgesService.findOneById.mockResolvedValue(makeBridge());
      const created = makeReport({ reportedWaitMinutes: null as unknown as number });
      repo.create!.mockReturnValue(created);
      repo.save!.mockResolvedValue(created);

      await service.create({ bridgeId: 'bridge-uuid-1', laneType: LaneType.General, lineStatus: ReportStatus.Pending });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reportedWaitMinutes: null }),
      );
    });

    it('throws NotFoundException when bridge is not found', async () => {
      mockBridgesService.findOneById.mockRejectedValue(new NotFoundException('Bridge not found'));

      await expect(service.create({ bridgeId: 'nonexistent', laneType: LaneType.General, lineStatus: ReportStatus.Pending })).rejects.toThrow(
        NotFoundException,
      );

      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('applies bridgeId filter when provided', async () => {
      const reports = [makeReport()];
      const mockQb = {
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(reports),
      };
      repo.createQueryBuilder!.mockReturnValue(mockQb);

      const result = await service.findAll({ bridgeId: 'bridge-uuid-1', limit: 5 });

      expect(mockQb.where).toHaveBeenCalledWith('report.bridgeId = :bridgeId', { bridgeId: 'bridge-uuid-1' });
      expect(mockQb.limit).toHaveBeenCalledWith(5);
      expect(result).toEqual(reports);
    });

    it('omits where clause when bridgeId is not provided', async () => {
      const mockQb = {
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repo.createQueryBuilder!.mockReturnValue(mockQb);

      await service.findAll({});

      expect(mockQb.where).not.toHaveBeenCalled();
    });

    it('defaults limit to 20 when not specified', async () => {
      const mockQb = {
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repo.createQueryBuilder!.mockReturnValue(mockQb);

      await service.findAll({});

      expect(mockQb.limit).toHaveBeenCalledWith(20);
    });
  });

  // ── findRecentByBridge ────────────────────────────────────────────────────

  describe('findRecentByBridge()', () => {
    it('returns recent reports for a valid bridge', async () => {
      mockBridgesService.findOneById.mockResolvedValue(makeBridge());
      const reports = Array.from({ length: 10 }, (_, i) => makeReport({ id: `report-${i}` }));
      repo.find!.mockResolvedValue(reports);

      const result = await service.findRecentByBridge('bridge-uuid-1');

      expect(mockBridgesService.findOneById).toHaveBeenCalledWith('bridge-uuid-1');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { bridgeId: 'bridge-uuid-1' },
          order: { createdAt: 'DESC' },
          take: 10,
        }),
      );
      expect(result).toHaveLength(10);
    });

    it('defaults limit to 10', async () => {
      mockBridgesService.findOneById.mockResolvedValue(makeBridge());
      repo.find!.mockResolvedValue([]);

      await service.findRecentByBridge('bridge-uuid-1');

      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });

    it('throws NotFoundException when bridge does not exist', async () => {
      mockBridgesService.findOneById.mockRejectedValue(new NotFoundException());

      await expect(service.findRecentByBridge('nonexistent')).rejects.toThrow(NotFoundException);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  // ── getHomeSummary ────────────────────────────────────────────────────────

  describe('getHomeSummary()', () => {
    it('delegates to BridgesService.getHomeSummary()', async () => {
      const summary = [{ id: 'uuid-1', name: 'Puente Libre', recentReportCount: 3 }];
      mockBridgesService.getHomeSummary.mockResolvedValue(summary);

      const result = await service.getHomeSummary();

      expect(mockBridgesService.getHomeSummary).toHaveBeenCalled();
      expect(result).toEqual(summary);
    });
  });

  // ── findUsableReports ─────────────────────────────────────────────────────

  describe('findUsableReports()', () => {
    const now = new Date('2026-06-19T12:00:00Z');

    function makeUsableReport(overrides: Partial<Report> & { minutesAgo: number }): Report {
      const { minutesAgo, ...rest } = overrides;
      const createdAt = new Date(now.getTime() - minutesAgo * 60 * 1000);
      return makeReport({ createdAt, lineStatus: ReportStatus.Pending, reportedWaitMinutes: 30, ...rest });
    }

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns weighted reports within 90 min for same bridge and laneType', async () => {
      const reports = [
        makeUsableReport({ minutesAgo: 10, reportedWaitMinutes: 20 }), // weight 1.0
        makeUsableReport({ minutesAgo: 25, reportedWaitMinutes: 40 }), // weight 0.8
      ];
      repo.find!.mockResolvedValue(reports);

      const result = await service.findUsableReports('bridge-uuid-1', LaneType.General);

      // weighted mean: (20*1.0 + 40*0.8) / (1.0 + 0.8) = (20+32)/1.8 = 52/1.8 ≈ 28.89
      expect(result.sampleSize).toBe(2);
      expect(result.weightedMean).toBeCloseTo(28.89, 1);
    });

    it('excludes rejected reports', async () => {
      const reports = [
        makeUsableReport({ minutesAgo: 5, reportedWaitMinutes: 30, lineStatus: ReportStatus.Rejected }),
        makeUsableReport({ minutesAgo: 5, reportedWaitMinutes: 60 }),
      ];
      repo.find!.mockResolvedValue(reports);

      const result = await service.findUsableReports('bridge-uuid-1', LaneType.General);

      expect(result.sampleSize).toBe(1);
      expect(result.weightedMean).toBeCloseTo(60, 0);
    });

    it('excludes reports with null reportedWaitMinutes', async () => {
      const reports = [
        makeUsableReport({ minutesAgo: 5, reportedWaitMinutes: null as unknown as number }),
        makeUsableReport({ minutesAgo: 5, reportedWaitMinutes: 45 }),
      ];
      repo.find!.mockResolvedValue(reports);

      const result = await service.findUsableReports('bridge-uuid-1', LaneType.General);

      expect(result.sampleSize).toBe(1);
      expect(result.weightedMean).toBeCloseTo(45, 0);
    });

    it('excludes reports older than 90 minutes', async () => {
      const reports = [
        makeUsableReport({ minutesAgo: 95, reportedWaitMinutes: 50 }), // excluded
        makeUsableReport({ minutesAgo: 89, reportedWaitMinutes: 20 }), // weight 0.3
      ];
      repo.find!.mockResolvedValue(reports);

      const result = await service.findUsableReports('bridge-uuid-1', LaneType.General);

      expect(result.sampleSize).toBe(1);
      expect(result.weightedMean).toBeCloseTo(20, 0);
    });

    it('excludes reports with wait minutes outside 0-360 range', async () => {
      const reports = [
        makeUsableReport({ minutesAgo: 5, reportedWaitMinutes: 361 }), // excluded
        makeUsableReport({ minutesAgo: 5, reportedWaitMinutes: 0 }),   // valid
      ];
      repo.find!.mockResolvedValue(reports);

      const result = await service.findUsableReports('bridge-uuid-1', LaneType.General);

      expect(result.sampleSize).toBe(1);
      expect(result.weightedMean).toBeCloseTo(0, 0);
    });

    it('applies correct recency weights: 0-15min=1.0, 16-30=0.8, 31-60=0.5, 61-90=0.3', async () => {
      const reports = [
        makeUsableReport({ minutesAgo: 10, reportedWaitMinutes: 100 }), // weight 1.0
        makeUsableReport({ minutesAgo: 20, reportedWaitMinutes: 100 }), // weight 0.8
        makeUsableReport({ minutesAgo: 45, reportedWaitMinutes: 100 }), // weight 0.5
        makeUsableReport({ minutesAgo: 75, reportedWaitMinutes: 100 }), // weight 0.3
      ];
      repo.find!.mockResolvedValue(reports);

      const result = await service.findUsableReports('bridge-uuid-1', LaneType.General);

      // All same value (100), so weighted mean = 100 regardless of weights
      expect(result.sampleSize).toBe(4);
      expect(result.weightedMean).toBeCloseTo(100, 0);
    });

    it('returns sampleSize 0 and weightedMean null when no usable reports', async () => {
      repo.find!.mockResolvedValue([]);

      const result = await service.findUsableReports('bridge-uuid-1', LaneType.General);

      expect(result.sampleSize).toBe(0);
      expect(result.weightedMean).toBeNull();
    });
  });
});
