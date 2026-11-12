import { localSlot, pickBestTimes, pickUsual, type DayProfileBin, type EvidenceThresholds } from './day-insights.js';

const THRESHOLDS: EvidenceThresholds = { minDates: 6, minCoverage: 0.7 };

function bin(time: string, median: number | null, overrides: Partial<DayProfileBin> = {}): DayProfileBin {
  return { time, median, comparableLocalDates: 8, coverageRatio: 0.9, closureRate: 0, ...overrides };
}

/** Hours 06..21 with a quiet morning (10 min), a busy evening (60 min) and 30 min in between. */
function typicalDay(): DayProfileBin[] {
  const bins: DayProfileBin[] = [];
  for (let hour = 6; hour <= 21; hour++) {
    const median = hour < 10 ? 25 : hour < 13 ? 10 : hour < 17 ? 30 : hour < 20 ? 60 : 35;
    for (const minute of ['00', '30']) bins.push(bin(`${String(hour).padStart(2, '0')}:${minute}`, median));
  }
  return bins;
}

describe('localSlot', () => {
  it('returns the local weekday and the 30-minute bin in the given timezone', () => {
    // 17:05 UTC on Wednesday 2026-11-11 is 10:05 in Ciudad Juarez (UTC-7 in November).
    expect(localSlot(new Date('2026-11-11T17:05:00Z'), 'America/Ciudad_Juarez')).toEqual({
      dayOfWeek: 3,
      time: '10:00',
    });
  });

  it('floors to the previous half hour', () => {
    expect(localSlot(new Date('2026-11-11T17:44:00Z'), 'America/Ciudad_Juarez').time).toBe('10:30');
  });

  it('uses the local date, not the UTC one, around midnight', () => {
    // 02:15 UTC on Thursday is still Wednesday 19:15 in Ciudad Juarez.
    expect(localSlot(new Date('2026-11-12T02:15:00Z'), 'America/Ciudad_Juarez')).toEqual({
      dayOfWeek: 3,
      time: '19:00',
    });
  });
});

describe('pickUsual', () => {
  it('returns the rounded median of the current bin when the evidence is enough', () => {
    const result = pickUsual([bin('10:00', 17.6)], '10:00', THRESHOLDS);

    expect(result).toEqual({ medianMinutes: 18, comparableDates: 8 });
  });

  it('returns null with too few comparable dates', () => {
    expect(pickUsual([bin('10:00', 17, { comparableLocalDates: 5 })], '10:00', THRESHOLDS)).toBeNull();
  });

  it('returns null with low coverage', () => {
    expect(pickUsual([bin('10:00', 17, { coverageRatio: 0.5 })], '10:00', THRESHOLDS)).toBeNull();
  });

  it('returns null when the bin has no median or does not exist', () => {
    expect(pickUsual([bin('10:00', null)], '10:00', THRESHOLDS)).toBeNull();
    expect(pickUsual([bin('11:00', 20)], '10:00', THRESHOLDS)).toBeNull();
    expect(pickUsual([], '10:00', THRESHOLDS)).toBeNull();
  });
});

describe('pickBestTimes', () => {
  it('finds the freest and the busiest three-hour windows of the day', () => {
    const result = pickBestTimes(typicalDay(), THRESHOLDS);

    expect(result).toEqual({
      freest: { startHour: 10, endHour: 13, typicalMinutes: 10 },
      peak: { startHour: 17, endHour: 20, typicalMinutes: 60 },
    });
  });

  it('returns null when there is no complete window with enough evidence', () => {
    const sparse = typicalDay().map((b) => ({ ...b, comparableLocalDates: 2 }));

    expect(pickBestTimes(sparse, THRESHOLDS)).toBeNull();
  });

  it('ignores hours where evidence is missing for one of the two bins', () => {
    const day = typicalDay().filter((b) => !(b.time === '11:30')); // breaks 10-13 and 11-14

    const result = pickBestTimes(day, THRESHOLDS);

    expect(result?.freest.startHour).not.toBe(10);
  });

  it('returns null when the day is flat: there is no better or worse moment to recommend', () => {
    const flat = typicalDay().map((b) => ({ ...b, median: 20 }));

    expect(pickBestTimes(flat, THRESHOLDS)).toBeNull();
  });

  it('does not recommend hours when the bridge is usually closed', () => {
    const closedMorning = typicalDay().map((b) =>
      Number(b.time.slice(0, 2)) >= 10 && Number(b.time.slice(0, 2)) < 13 ? { ...b, closureRate: 0.8 } : b,
    );

    const result = pickBestTimes(closedMorning, THRESHOLDS);

    expect(result?.freest.startHour).not.toBe(10);
  });

  it('is empty-safe', () => {
    expect(pickBestTimes([], THRESHOLDS)).toBeNull();
  });
});
