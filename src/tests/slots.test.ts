import { describe, expect, it } from 'vitest';
import { availableSlots, isSlotOffered, SLOT_STEP_MINUTES } from '@/domain/availability/slots';
import type { AvailabilityBlock, BusinessHours, BusyInterval } from '@/types/booking';

const ZONE = 'America/Recife';
const PRO = 'pro-1';

/** Monday to Friday, 09:00-12:00 and 13:00-18:00. */
function hours(weekdays = [1, 2, 3, 4, 5]): BusinessHours[] {
  return weekdays.flatMap((weekday) => [
    { professionalId: PRO, weekday, opensMinute: 540, closesMinute: 720 },
    { professionalId: PRO, weekday, opensMinute: 780, closesMinute: 1080 },
  ]);
}

const service = (durationMinutes: number) => ({ durationMinutes, active: true });

/** 2026-03-16 is a Monday. Well before any slot on the day. */
const EARLY = new Date('2026-03-16T00:00:00-03:00');

function query(overrides: Partial<Parameters<typeof availableSlots>[0]> = {}) {
  return {
    dateKey: '2026-03-16',
    service: service(60),
    professionalId: PRO,
    businessHours: hours(),
    blocks: [] as AvailabilityBlock[],
    busy: [] as BusyInterval[],
    timeZone: ZONE,
    now: EARLY,
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);
const starts = (slots: { startsAt: Date }[]) => slots.map((s) => s.startsAt.toISOString());

describe('1. opening hours', () => {
  it('offers slots on the grid inside each window', () => {
    const slots = availableSlots(query());
    expect(slots.length).toBeGreaterThan(0);
    expect(starts(slots)[0]).toBe('2026-03-16T12:00:00.000Z'); // 09:00 in Recife
  });

  it('never sells a service across the break between two windows', () => {
    // 11:30 + 60 minutes would end at 12:30, inside the closed hour.
    const slots = availableSlots(query());
    expect(starts(slots)).not.toContain('2026-03-16T14:30:00.000Z');
    // The last morning start that fits is 11:00.
    expect(starts(slots)).toContain('2026-03-16T14:00:00.000Z');
  });

  it('offers nothing on a day with no opening hours', () => {
    // 2026-03-15 is a Sunday.
    expect(availableSlots(query({ dateKey: '2026-03-15' }))).toEqual([]);
  });

  it('offers nothing for a service longer than every window', () => {
    expect(availableSlots(query({ service: service(400) }))).toEqual([]);
  });
});

describe('2. service duration', () => {
  it('fits more short services than long ones into the same day', () => {
    const short = availableSlots(query({ service: service(30) }));
    const long = availableSlots(query({ service: service(120) }));
    expect(short.length).toBeGreaterThan(long.length);
  });

  it('derives the end from the duration', () => {
    const [first] = availableSlots(query({ service: service(90) }));
    expect(first!.endsAt.getTime() - first!.startsAt.getTime()).toBe(90 * 60_000);
  });

  it('keeps starts on the step grid', () => {
    const slots = availableSlots(query({ service: service(45) }));
    for (const slot of slots) {
      expect(slot.startsAt.getUTCMinutes() % SLOT_STEP_MINUTES).toBe(0);
    }
  });

  it('refuses a duration that is not a positive whole number of minutes', () => {
    expect(availableSlots(query({ service: service(0) }))).toEqual([]);
    expect(availableSlots(query({ service: service(-30) }))).toEqual([]);
    expect(availableSlots(query({ service: service(22.5) }))).toEqual([]);
  });

  it('offers nothing for an inactive service', () => {
    expect(availableSlots(query({ service: { durationMinutes: 60, active: false } }))).toEqual([]);
  });
});

describe('3. the past', () => {
  it('does not offer a slot that has already started', () => {
    const now = at('2026-03-16T15:00:00-03:00');
    const slots = availableSlots(query({ now }));
    expect(slots.every((s) => s.startsAt.getTime() >= now.getTime())).toBe(true);
  });

  it('respects a lead time', () => {
    const now = at('2026-03-16T09:00:00-03:00');
    const slots = availableSlots(query({ now, leadTimeMinutes: 120 }));
    const earliest = now.getTime() + 120 * 60_000;
    expect(slots.every((s) => s.startsAt.getTime() >= earliest)).toBe(true);
  });

  it('offers nothing for a day already over', () => {
    expect(availableSlots(query({ now: at('2026-03-17T00:00:00-03:00') }))).toEqual([]);
  });
});

describe('4. blocks', () => {
  it('removes every slot touching a block', () => {
    const blocks: AvailabilityBlock[] = [
      {
        id: 'b1',
        professionalId: PRO,
        startsAt: at('2026-03-16T09:00:00-03:00'),
        endsAt: at('2026-03-16T11:00:00-03:00'),
        reason: 'Away',
      },
    ];
    const slots = starts(availableSlots(query({ blocks })));
    expect(slots).not.toContain('2026-03-16T12:00:00.000Z'); // 09:00
    expect(slots).not.toContain('2026-03-16T13:30:00.000Z'); // 10:30, would end 11:30
    expect(slots).toContain('2026-03-16T14:00:00.000Z'); // 11:00, clear of it
  });

  it('ignores a block belonging to another professional', () => {
    const blocks: AvailabilityBlock[] = [
      {
        id: 'b1',
        professionalId: 'someone-else',
        startsAt: at('2026-03-16T09:00:00-03:00'),
        endsAt: at('2026-03-16T18:00:00-03:00'),
        reason: null,
      },
    ];
    expect(availableSlots(query({ blocks })).length).toBeGreaterThan(0);
  });
});

describe('5. existing bookings', () => {
  it('removes slots that would overlap one', () => {
    const busy: BusyInterval[] = [
      {
        professionalId: PRO,
        startsAt: at('2026-03-16T14:00:00-03:00'),
        endsAt: at('2026-03-16T15:00:00-03:00'),
      },
    ];
    const slots = starts(availableSlots(query({ busy })));
    expect(slots).not.toContain('2026-03-16T17:00:00.000Z'); // 14:00
    expect(slots).not.toContain('2026-03-16T16:30:00.000Z'); // 13:30, would end 14:30
    expect(slots).toContain('2026-03-16T18:00:00.000Z'); // 15:00, starts as it ends
  });

  it('treats a booking that merely touches as no clash', () => {
    // Intervals are half-open, so 10:00-11:00 and 11:00-12:00 coexist.
    const busy: BusyInterval[] = [
      {
        professionalId: PRO,
        startsAt: at('2026-03-16T10:00:00-03:00'),
        endsAt: at('2026-03-16T11:00:00-03:00'),
      },
    ];
    expect(starts(availableSlots(query({ busy })))).toContain('2026-03-16T14:00:00.000Z');
  });
});

describe('6. timezones and daylight saving', () => {
  it('resolves opening hours in the business timezone, not the host one', () => {
    const [first] = availableSlots(query());
    // 09:00 in Recife is 12:00Z all year; Brazil has no daylight saving.
    expect(first!.startsAt.toISOString()).toBe('2026-03-16T12:00:00.000Z');
  });

  it('keeps the same wall-clock opening across a daylight saving change', () => {
    // New York moves to daylight time on 2026-03-08.
    const before = availableSlots(
      query({ dateKey: '2026-03-06', timeZone: 'America/New_York', now: at('2026-01-01T00:00:00Z') }),
    );
    const after = availableSlots(
      query({ dateKey: '2026-03-09', timeZone: 'America/New_York', now: at('2026-01-01T00:00:00Z') }),
    );
    // Different instants, because the offset changed...
    expect(before[0]!.startsAt.toISOString()).not.toBe(after[0]!.startsAt.toISOString());
    // ...but the same local hour on both days.
    const localHour = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false,
      }).format(d);
    expect(localHour(before[0]!.startsAt)).toBe(localHour(after[0]!.startsAt));
  });

  it('offers no duplicate start on a spring-forward day', () => {
    // 02:00 does not exist on 2026-03-08 in New York and resolves to 03:00,
    // which exists in its own right. Both wall-clock minutes produce the
    // same instant, and the same slot must not be offered twice.
    const slots = availableSlots({
      dateKey: '2026-03-08',
      service: service(30),
      professionalId: PRO,
      businessHours: [{ professionalId: PRO, weekday: 0, opensMinute: 0, closesMinute: 360 }],
      blocks: [],
      busy: [],
      timeZone: 'America/New_York',
      now: at('2026-01-01T00:00:00Z'),
    });
    const instants = slots.map((s) => s.startsAt.getTime());
    expect(new Set(instants).size).toBe(instants.length);
  });

  it('rejects a date key that is not a real day', () => {
    expect(availableSlots(query({ dateKey: '2026-02-30' }))).toEqual([]);
    expect(availableSlots(query({ dateKey: 'tomorrow' }))).toEqual([]);
    expect(availableSlots(query({ dateKey: '2026-13-01' }))).toEqual([]);
  });
});

describe('7. re-checking one slot', () => {
  it('confirms a start that is offered', () => {
    const q = query();
    const [first] = availableSlots(q);
    expect(isSlotOffered(q, first!.startsAt)).toBe(true);
  });

  it('refuses a start that is not on the grid', () => {
    const q = query();
    expect(isSlotOffered(q, at('2026-03-16T09:07:00-03:00'))).toBe(false);
  });

  it('refuses a start inside a block', () => {
    const q = query({
      blocks: [
        {
          id: 'b1',
          professionalId: PRO,
          startsAt: at('2026-03-16T09:00:00-03:00'),
          endsAt: at('2026-03-16T10:00:00-03:00'),
          reason: null,
        },
      ],
    });
    expect(isSlotOffered(q, at('2026-03-16T09:00:00-03:00'))).toBe(false);
  });
});
