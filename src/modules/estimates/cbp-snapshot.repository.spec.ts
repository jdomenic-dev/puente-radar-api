/**
 * cbp-snapshot.repository.spec.ts
 *
 * Strict TDD — unit-level coverage for CbpSnapshotCustomRepository.saveSlotSnapshot
 * (PR3 persistence seam, tasks 3.4-3.5). DataSource is mocked here; real
 * ON CONFLICT DO NOTHING behavior against the partial unique index is proven
 * separately by cbp-snapshot.repository.integration.spec.ts (task 3.6).
 */

import { DataSource } from 'typeorm';
import { CbpSnapshotCustomRepository } from './cbp-snapshot.repository.js';
import { LaneType } from '../../common/enums/lane.enum.js';

function makeMockDataSource(queryResult: unknown[]): { dataSource: DataSource; queryMock: jest.Mock } {
  const queryMock = jest.fn().mockResolvedValue(queryResult);
  return { dataSource: { query: queryMock } as unknown as DataSource, queryMock };
}

const SLOT_START = new Date('2026-06-19T13:00:00.000Z');

const SLOT_ROW = {
  bridgeId: 'bridge-uuid-1',
  laneType: LaneType.General,
  delayMinutes: 10,
  lanesOpen: 5,
  operationalStatus: 'delay',
  isOpen: true,
  sourceUpdateTimeRaw: '',
  fetchedAt: SLOT_START,
  slotStart: SLOT_START,
};

describe('CbpSnapshotCustomRepository — saveSlotSnapshot', () => {
  it('B3.4-a: returns true when the insert succeeds (RETURNING has one row)', async () => {
    const { dataSource } = makeMockDataSource([{ id: 'snap-uuid-1' }]);
    const repo = new CbpSnapshotCustomRepository(dataSource);

    const inserted = await repo.saveSlotSnapshot(SLOT_ROW);

    expect(inserted).toBe(true);
  });

  it('B3.4-b: returns false when ON CONFLICT DO NOTHING suppresses the insert (RETURNING empty)', async () => {
    const { dataSource } = makeMockDataSource([]);
    const repo = new CbpSnapshotCustomRepository(dataSource);

    const inserted = await repo.saveSlotSnapshot(SLOT_ROW);

    expect(inserted).toBe(false);
  });

  it('B3.4-c: a conflict-suppressed insert resolves normally — never rejects', async () => {
    const { dataSource } = makeMockDataSource([]);
    const repo = new CbpSnapshotCustomRepository(dataSource);

    await expect(repo.saveSlotSnapshot(SLOT_ROW)).resolves.toBe(false);
  });

  it('B3.4-d: query params carry the non-null slotStart value (proves the collector-owned slot is passed through)', async () => {
    const { dataSource, queryMock } = makeMockDataSource([{ id: 'snap-uuid-1' }]);
    const repo = new CbpSnapshotCustomRepository(dataSource);

    await repo.saveSlotSnapshot(SLOT_ROW);

    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(params).toContain(SLOT_START);
  });
});
