/**
 * day-insights.ts
 *
 * Pure helpers that turn a bridge's historical day profile (one row per 30-minute bin for one
 * weekday and lane) into what the app shows: the usual wait right now and the best and worst
 * moments of the day.
 *
 * Nothing here invents data: a bin only counts when it has enough comparable dates and
 * coverage, and every function answers null when the evidence is not there.
 */

/** One 30-minute bin of the day profile (local time, e.g. "10:30"). */
export interface DayProfileBin {
  time: string;
  median: number | null;
  comparableLocalDates: number;
  coverageRatio: number;
  closureRate: number;
}

export interface EvidenceThresholds {
  minDates: number;
  minCoverage: number;
}

export interface UsualWait {
  medianMinutes: number;
  comparableDates: number;
}

export interface TimeWindow {
  startHour: number;
  endHour: number;
  typicalMinutes: number;
}

export interface BestTimes {
  freest: TimeWindow;
  peak: TimeWindow;
}

/** Length of the recommended windows, in hours. */
export const WINDOW_HOURS = 3;

/** A day whose best and worst windows differ by less than this is not worth recommending. */
export const MIN_WINDOW_DIFFERENCE_MINUTES = 5;

/** Hours where the bridge is closed at least this often are never recommended. */
const MAX_CLOSURE_RATE = 0.5;

/** Local weekday (0 = Sunday) and the 30-minute bin ("HH:00" or "HH:30") of a moment. */
export function localSlot(moment: Date, timeZone: string): { dayOfWeek: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(moment);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hour = part('hour').padStart(2, '0');
  const minute = Number(part('minute')) < 30 ? '00' : '30';

  return { dayOfWeek: weekdays.indexOf(part('weekday')), time: `${hour}:${minute}` };
}

function hasEvidence(bin: DayProfileBin, thresholds: EvidenceThresholds): bin is DayProfileBin & { median: number } {
  return (
    bin.median !== null &&
    bin.comparableLocalDates >= thresholds.minDates &&
    bin.coverageRatio >= thresholds.minCoverage
  );
}

/** The usual wait for the given bin, or null when there is not enough evidence. */
export function pickUsual(profile: DayProfileBin[], time: string, thresholds: EvidenceThresholds): UsualWait | null {
  const bin = profile.find((candidate) => candidate.time === time);
  if (!bin || !hasEvidence(bin, thresholds)) return null;
  return { medianMinutes: Math.round(bin.median), comparableDates: bin.comparableLocalDates };
}

/** Typical wait of each hour that has evidence in both of its bins and is usually open. */
function hourlyMedians(profile: DayProfileBin[], thresholds: EvidenceThresholds): Map<number, number> {
  const byHour = new Map<number, DayProfileBin[]>();
  for (const bin of profile) {
    const hour = Number(bin.time.slice(0, 2));
    byHour.set(hour, [...(byHour.get(hour) ?? []), bin]);
  }

  const result = new Map<number, number>();
  for (const [hour, bins] of byHour) {
    const usable = bins.length === 2 && bins.every((bin) => hasEvidence(bin, thresholds));
    const open = bins.every((bin) => bin.closureRate < MAX_CLOSURE_RATE);
    if (usable && open) {
      result.set(hour, bins.reduce((sum, bin) => sum + bin.median, 0) / 2);
    }
  }
  return result;
}

/** The freest and busiest three-hour windows of the day, or null without enough evidence. */
export function pickBestTimes(profile: DayProfileBin[], thresholds: EvidenceThresholds): BestTimes | null {
  const hours = hourlyMedians(profile, thresholds);

  const windows: Array<{ startHour: number; mean: number }> = [];
  for (const start of [...hours.keys()].sort((a, b) => a - b)) {
    const members = Array.from({ length: WINDOW_HOURS }, (_, offset) => hours.get(start + offset));
    if (members.every((value): value is number => value !== undefined)) {
      windows.push({ startHour: start, mean: members.reduce((sum, value) => sum + value, 0) / WINDOW_HOURS });
    }
  }
  if (windows.length === 0) return null;

  // Ties go to the earliest window.
  const freest = windows.reduce((best, w) => (w.mean < best.mean ? w : best));
  const peak = windows.reduce((worst, w) => (w.mean > worst.mean ? w : worst));
  if (peak.mean - freest.mean < MIN_WINDOW_DIFFERENCE_MINUTES) return null;

  const toWindow = (w: { startHour: number; mean: number }): TimeWindow => ({
    startHour: w.startHour,
    endHour: w.startHour + WINDOW_HOURS,
    typicalMinutes: Math.round(w.mean),
  });
  return { freest: toWindow(freest), peak: toWindow(peak) };
}
