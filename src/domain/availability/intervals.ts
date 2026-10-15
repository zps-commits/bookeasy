import type { Slot } from '@/types/booking';

/** Half-open [start, end). Touching intervals do not overlap. */
export function overlaps(a: Slot, b: Slot): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

export function contains(outer: Slot, inner: Slot): boolean {
  return (
    outer.startsAt.getTime() <= inner.startsAt.getTime() &&
    inner.endsAt.getTime() <= outer.endsAt.getTime()
  );
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}
