import { NotFoundException } from '@nestjs/common';
import { HistoricalPatternsController } from './historical.controller.js';
import { LaneType } from '../../../common/enums/lane.enum.js';

describe('HistoricalPatternsController', () => {
  it('returns the sufficient descriptive baseline shape when enabled', async () => {
    const patterns = [{ bridgeId: 'bridge-1', median: 20, insufficientData: false, descriptiveBaseline: 'CBP historical baseline only' }];
    const controller = new HistoricalPatternsController({ getPatterns: jest.fn().mockResolvedValue(patterns) } as never, { get: jest.fn().mockReturnValue('true') } as never);
    await expect(controller.getPatterns({ laneType: LaneType.General, dayOfWeek: 1, time: '06:00' })).resolves.toEqual(patterns);
  });

  it('returns the insufficient shape and hides the endpoint while disabled', async () => {
    const enabled = new HistoricalPatternsController({ getPatterns: jest.fn().mockResolvedValue([{ bridgeId: 'bridge-1', median: null, insufficientData: true }]) } as never, { get: jest.fn().mockReturnValue('true') } as never);
    await expect(enabled.getPatterns({ laneType: LaneType.General, dayOfWeek: 1, time: '06:00' })).resolves.toEqual([expect.objectContaining({ insufficientData: true, median: null })]);
    const disabled = new HistoricalPatternsController({ getPatterns: jest.fn() } as never, { get: jest.fn().mockReturnValue('false') } as never);
    expect(() => disabled.getPatterns({ laneType: LaneType.General, dayOfWeek: 1, time: '06:00' })).toThrow(NotFoundException);
  });
});
