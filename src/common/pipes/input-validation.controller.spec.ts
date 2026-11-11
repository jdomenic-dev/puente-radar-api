/**
 * Path ids must be UUIDs and `limit` must be bounded: bad input answers 400 before any service
 * (and therefore any database query) runs.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BridgesController } from '../../modules/bridges/bridges.controller.js';
import { BridgesService } from '../../modules/bridges/bridges.service.js';
import { ReportsController } from '../../modules/reports/reports.controller.js';
import { ReportsService } from '../../modules/reports/reports.service.js';

const UUID = '3b241101-e2bb-4255-8caf-4136c566a962';

describe('controller input validation', () => {
  let app: INestApplication;
  const bridgesService = { findOneById: jest.fn(), updateStatus: jest.fn() };
  const reportsService = { findRecentByBridge: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BridgesController, ReportsController],
      providers: [
        { provide: BridgesService, useValue: bridgesService },
        { provide: ReportsService, useValue: reportsService },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    bridgesService.findOneById.mockResolvedValue({ id: UUID });
    bridgesService.updateStatus.mockResolvedValue({ id: UUID });
    reportsService.findRecentByBridge.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /bridges/:id rejects a non-UUID id with 400 and does not query', async () => {
    await request(app.getHttpServer()).get('/bridges/not-a-uuid').expect(400);
    expect(bridgesService.findOneById).not.toHaveBeenCalled();
  });

  it('GET /bridges/:id accepts a UUID', async () => {
    await request(app.getHttpServer()).get(`/bridges/${UUID}`).expect(200);
    expect(bridgesService.findOneById).toHaveBeenCalledWith(UUID);
  });

  it('PATCH /bridges/:id/status rejects a non-UUID id with 400', async () => {
    await request(app.getHttpServer()).patch('/bridges/123/status').send({ status: 'low' }).expect(400);
    expect(bridgesService.updateStatus).not.toHaveBeenCalled();
  });

  it('GET /reports/bridge/:bridgeId/recent rejects a non-UUID bridgeId with 400', async () => {
    await request(app.getHttpServer()).get('/reports/bridge/abc/recent').expect(400);
    expect(reportsService.findRecentByBridge).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '101', '99999999', 'abc', '2.5'])('rejects limit=%s with 400', async (limit) => {
    await request(app.getHttpServer()).get(`/reports/bridge/${UUID}/recent?limit=${limit}`).expect(400);
    expect(reportsService.findRecentByBridge).not.toHaveBeenCalled();
  });

  it('uses 10 when limit is omitted and passes a valid limit through', async () => {
    await request(app.getHttpServer()).get(`/reports/bridge/${UUID}/recent`).expect(200);
    expect(reportsService.findRecentByBridge).toHaveBeenLastCalledWith(UUID, 10);

    await request(app.getHttpServer()).get(`/reports/bridge/${UUID}/recent?limit=100`).expect(200);
    expect(reportsService.findRecentByBridge).toHaveBeenLastCalledWith(UUID, 100);
  });
});
