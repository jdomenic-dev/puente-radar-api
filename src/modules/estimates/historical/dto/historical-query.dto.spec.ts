import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HistoricalQueryDto } from './historical-query.dto.js';
import { LaneType } from '../../../../common/enums/lane.enum.js';

describe('HistoricalQueryDto', () => {
  it('accepts a lane type, Sunday-through-Saturday weekday, and zero-padded 24-hour time', async () => {
    const errors = await validate(plainToInstance(HistoricalQueryDto, { laneType: LaneType.General, dayOfWeek: '6', time: '23:30' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid lane, weekday, and non-HH:mm time values', async () => {
    const errors = await validate(plainToInstance(HistoricalQueryDto, { laneType: 'invalid', dayOfWeek: 7, time: '6:30' }));
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['laneType', 'dayOfWeek', 'time']));
  });

  it.each(['06:15', '06:45'])('rejects %s because historical requests select 30-minute bins only', async (time) => {
    const errors = await validate(plainToInstance(HistoricalQueryDto, { laneType: LaneType.General, dayOfWeek: 1, time }));
    expect(errors.find((error) => error.property === 'time')).toBeDefined();
  });
});
