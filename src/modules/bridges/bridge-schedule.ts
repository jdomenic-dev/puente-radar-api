/**
 * Opening hours of a bridge, stored as local "HH:mm" times. Both null means the bridge
 * never closes; "24:00" is midnight (closing at the end of the day).
 */

export interface ScheduleDescription {
  is24h: boolean;
  /** Spanish label for the app, e.g. "Abierto 24 horas" or "6:00 – 22:00". */
  label: string;
}

/** An opening time: 00:00 to 23:59. */
export const OPENING_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** A closing time: like an opening time, plus 24:00 for midnight. */
export const CLOSING_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export function isValidClockTime(value: string): boolean {
  return CLOSING_TIME_PATTERN.test(value);
}

/** "06:00" -> "6:00"; "24:00" -> "0:00" (midnight). */
function formatClockTime(value: string): string {
  const [hours, minutes] = value.split(':');
  return `${Number(hours) % 24}:${minutes}`;
}

export function describeSchedule(opensAt: string | null, closesAt: string | null): ScheduleDescription {
  if (opensAt === null && closesAt === null) {
    return { is24h: true, label: 'Abierto 24 horas' };
  }
  // A half-defined schedule is a data error: say it is unknown, never claim 24 hours.
  if (opensAt === null || closesAt === null) {
    return { is24h: false, label: 'Horario no disponible' };
  }
  return { is24h: false, label: `${formatClockTime(opensAt)} – ${formatClockTime(closesAt)}` };
}
