import type {
  AvailabilityBlock,
  BusinessHours,
  BusyInterval,
  Minutes,
  Service,
  Slot,
} from '@/types/booking';
import { instantAt, parseDateKey, weekdayOf } from '@/lib/dates/zone';
import { addMinutes, contains, overlaps } from './intervals';

/** How far apart offered start times are. Fifteen minutes is the grid. */
export const SLOT_STEP_MINUTES: Minutes = 15;

export type SlotQuery = {
  /** A civil date, "2026-03-17", in the business timezone. */
  dateKey: string;
  service: Pick<Service, 'durationMinutes' | 'active'>;
  professionalId: string;
  businessHours: BusinessHours[];
  blocks: AvailabilityBlock[];
  busy: BusyInterval[];
  timeZone: string;
  /** Injected rather than read from the clock, so the rule is testable. */
  now: Date;
  /** How long before a slot it stops being offered. */
  leadTimeMinutes?: Minutes;
};

/**
 * Every start time a service can actually be booked at on one day.
 *
 * A slot survives only if the whole service fits inside a single opening
 * window, touches no block, clashes with no existing booking, and does not
 * start before the lead time. The windows are evaluated one at a time so a
 * service can never be sold across a lunch break.
 */
export function availableSlots(query: SlotQuery): Slot[] {
  const {
    dateKey,
    service,
    professionalId,
    businessHours,
    blocks,
    busy,
    timeZone,
    now,
    leadTimeMinutes = 0,
  } = query;

  if (!service.active) return [];
  if (!Number.isInteger(service.durationMinutes) || service.durationMinutes <= 0) return [];

  const date = parseDateKey(dateKey);
  if (!date) return [];

  const weekday = weekdayOf(date.year, date.month1, date.day);
  const windows = businessHours
    .filter((h) => h.professionalId === professionalId && h.weekday === weekday)
    .filter((h) => h.closesMinute > h.opensMinute)
    .sort((a, b) => a.opensMinute - b.opensMinute);

  const relevantBlocks = blocks.filter((b) => b.professionalId === professionalId);
  const relevantBusy = busy.filter((b) => b.professionalId === professionalId);
  const earliest = addMinutes(now, leadTimeMinutes).getTime();

  const slots: Slot[] = [];
  // On a spring-forward day two different wall-clock minutes resolve to the
  // same instant: 02:00 does not exist, so it lands on 03:00, which also
  // exists. Without this the same start time is offered twice.
  const seen = new Set<number>();

  for (const window of windows) {
    const windowSlot: Slot = {
      startsAt: instantAt(date.year, date.month1, date.day, window.opensMinute, timeZone),
      endsAt: instantAt(date.year, date.month1, date.day, window.closesMinute, timeZone),
    };

    for (
      let minute = window.opensMinute;
      minute + service.durationMinutes <= window.closesMinute;
      minute += SLOT_STEP_MINUTES
    ) {
      const startsAt = instantAt(date.year, date.month1, date.day, minute, timeZone);
      const candidate: Slot = { startsAt, endsAt: addMinutes(startsAt, service.durationMinutes) };

      // A daylight saving jump can push a wall-clock minute outside the
      // window it belongs to once both ends are real instants. Re-checking
      // against the instants, not the minutes, is what catches it.
      if (!contains(windowSlot, candidate)) continue;
      if (candidate.startsAt.getTime() < earliest) continue;
      if (relevantBlocks.some((b) => overlaps(candidate, b))) continue;
      if (relevantBusy.some((b) => overlaps(candidate, b))) continue;

      if (seen.has(candidate.startsAt.getTime())) continue;
      seen.add(candidate.startsAt.getTime());
      slots.push(candidate);
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** True when that exact start is on offer. What the server re-checks before writing. */
export function isSlotOffered(query: SlotQuery, startsAt: Date): boolean {
  return availableSlots(query).some((slot) => slot.startsAt.getTime() === startsAt.getTime());
}
