import { describeSchedule, isValidClockTime } from './bridge-schedule.js';

describe('describeSchedule', () => {
  it('describes a bridge that never closes', () => {
    expect(describeSchedule(null, null)).toEqual({ is24h: true, label: 'Abierto 24 horas' });
  });

  it('describes a daily window', () => {
    expect(describeSchedule('06:00', '22:00')).toEqual({ is24h: false, label: '6:00 – 22:00' });
  });

  it('shows midnight as 0:00', () => {
    expect(describeSchedule('06:00', '24:00')).toEqual({ is24h: false, label: '6:00 – 0:00' });
  });

  it('keeps minutes', () => {
    expect(describeSchedule('05:30', '23:45').label).toBe('5:30 – 23:45');
  });

  it('treats a half-defined schedule as unknown, never as 24 hours', () => {
    expect(describeSchedule('06:00', null)).toEqual({ is24h: false, label: 'Horario no disponible' });
    expect(describeSchedule(null, '22:00')).toEqual({ is24h: false, label: 'Horario no disponible' });
  });
});

describe('isValidClockTime', () => {
  it.each(['00:00', '06:00', '23:59', '24:00'])('accepts %s', (value) => {
    expect(isValidClockTime(value)).toBe(true);
  });

  it.each(['6:00', '24:01', '25:00', '12:60', '', 'noon', '12-00'])('rejects %s', (value) => {
    expect(isValidClockTime(value)).toBe(false);
  });
});
