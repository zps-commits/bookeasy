import { TZDate } from '@date-fns/tz';

/**
 * Wall-clock time in a timezone, converted to a real instant.
 *
 * Opening hours are stored as a weekday and a minute from midnight, which
 * is a wall-clock fact: a business that opens at nine opens at nine on both
 * sides of a daylight saving change. Turning that into an instant is the
 * only place the timezone has to be applied, and it is applied here rather
 * than in every caller.
 */
export function instantAt(
  year: number,
  month1: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return new Date(
    new TZDate(year, month1 - 1, day, hours, minutes, 0, 0, timeZone).getTime(),
  );
}

/** The civil date parts of an instant, as seen in a timezone. */
export function civilParts(instant: Date, timeZone: string) {
  const zoned = new TZDate(instant.getTime(), timeZone);
  return {
    year: zoned.getFullYear(),
    month1: zoned.getMonth() + 1,
    day: zoned.getDate(),
    weekday: zoned.getDay(),
    minuteOfDay: zoned.getHours() * 60 + zoned.getMinutes(),
  };
}

/** "2026-03-17" in the given timezone. The key a calendar day is addressed by. */
export function civilDateKey(instant: Date, timeZone: string): string {
  const { year, month1, day } = civilParts(instant, timeZone);
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parses "2026-03-17" into its parts. Returns null for anything else. */
export function parseDateKey(key: string): { year: number; month1: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month1 = Number(match[2]);
  const day = Number(match[3]);
  if (month1 < 1 || month1 > 12 || day < 1 || day > 31) return null;
  // Rejects 2026-02-30, which passes the range check above but is not a day.
  const probe = new Date(Date.UTC(year, month1 - 1, day));
  if (probe.getUTCMonth() !== month1 - 1 || probe.getUTCDate() !== day) return null;
  return { year, month1, day };
}

/** The weekday (0 Sunday) of a civil date, independent of any timezone. */
export function weekdayOf(year: number, month1: number, day: number): number {
  return new Date(Date.UTC(year, month1 - 1, day)).getUTCDay();
}
