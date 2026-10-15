import { beforeEach, describe, expect, it } from 'vitest';
import { bookAppointment } from '@/domain/bookings/book';
import { memoryRepository, resetMemoryRepository } from '@/lib/db/providers/memory';
import { availableSlots } from '@/domain/availability/slots';
import { hashToken, looksLikeToken } from '@/domain/bookings/tokens';
import { civilDateKey } from '@/lib/dates/zone';

const ZONE = 'America/Recife';
const SERVICE = 'aaaaaaaa-0000-0000-0000-000000000001'; // 60 minutes
const SHORT = 'aaaaaaaa-0000-0000-0000-000000000002'; // 30 minutes
const PRO = '11111111-1111-1111-1111-111111111111';

beforeEach(() => resetMemoryRepository());

/** The first bookable slot from now, so tests never depend on a fixed date. */
async function firstSlot(serviceId = SERVICE) {
  const [services, hours] = await Promise.all([
    memoryRepository.listServices(),
    memoryRepository.listBusinessHours(),
  ]);
  const service = services.find((s) => s.id === serviceId)!;
  for (let day = 0; day < 14; day += 1) {
    const probe = new Date(Date.now() + day * 86_400_000);
    const dateKey = civilDateKey(probe, ZONE);
    const slots = availableSlots({
      dateKey,
      service,
      professionalId: PRO,
      businessHours: hours,
      blocks: await memoryRepository.listBlocks(probe, new Date(probe.getTime() + 86_400_000)),
      busy: await memoryRepository.listBusy(probe, new Date(probe.getTime() + 86_400_000)),
      timeZone: ZONE,
      now: new Date(),
    });
    if (slots.length > 0) return slots[0]!;
  }
  throw new Error('no bookable slot in the next two weeks');
}

const attempt = (startsAt: Date, overrides = {}) => ({
  serviceId: SERVICE,
  professionalId: PRO,
  customerName: 'Ana Prado',
  customerContact: 'ana@example.test',
  startsAt,
  timeZone: ZONE,
  ...overrides,
});

describe('booking', () => {
  it('books a slot that is offered', async () => {
    const slot = await firstSlot();
    const result = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    expect(result.ok).toBe(true);
  });

  it('derives the end from the service, not from the caller', async () => {
    const slot = await firstSlot();
    const result = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    if (!result.ok) throw new Error('expected a booking');
    expect(result.slot.endsAt.getTime() - result.slot.startsAt.getTime()).toBe(60 * 60_000);
  });

  it('returns a cancellation token of the expected shape', async () => {
    const slot = await firstSlot();
    const result = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    if (!result.ok) throw new Error('expected a booking');
    expect(looksLikeToken(result.cancellationToken)).toBe(true);
  });

  it('refuses a time in the past', async () => {
    const past = new Date(Date.now() - 3_600_000);
    const result = await bookAppointment(memoryRepository, attempt(past));
    expect(result).toEqual({ ok: false, problem: 'in-the-past' });
  });

  it('refuses a time outside the opening hours', async () => {
    const slot = await firstSlot();
    // Three in the morning, same day.
    const odd = new Date(slot.startsAt.getTime() - 6 * 3_600_000);
    const result = await bookAppointment(memoryRepository, attempt(odd));
    expect(result.ok).toBe(false);
  });

  it('refuses a start that is not on the grid', async () => {
    const slot = await firstSlot();
    const offGrid = new Date(slot.startsAt.getTime() + 7 * 60_000);
    const result = await bookAppointment(memoryRepository, attempt(offGrid));
    expect(result.ok).toBe(false);
  });

  it('refuses an unknown service', async () => {
    const slot = await firstSlot();
    const result = await bookAppointment(
      memoryRepository,
      attempt(slot.startsAt, { serviceId: '00000000-0000-0000-0000-000000000000' }),
    );
    expect(result).toEqual({ ok: false, problem: 'service-unavailable' });
  });

  it('refuses a professional who does not perform the service', async () => {
    const slot = await firstSlot('aaaaaaaa-0000-0000-0000-000000000003');
    const result = await bookAppointment(
      memoryRepository,
      attempt(slot.startsAt, {
        serviceId: 'aaaaaaaa-0000-0000-0000-000000000003',
        professionalId: '22222222-2222-2222-2222-222222222222',
      }),
    );
    expect(result).toEqual({ ok: false, problem: 'professional-unavailable' });
  });

  it('refuses the same slot twice', async () => {
    const slot = await firstSlot();
    const first = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    expect(first.ok).toBe(true);
    const second = await bookAppointment(
      memoryRepository,
      attempt(slot.startsAt, { customerName: 'Bruno Lima' }),
    );
    expect(second).toEqual({ ok: false, problem: 'slot-taken' });
  });

  it('refuses a slot that merely overlaps an existing booking', async () => {
    const slot = await firstSlot();
    await bookAppointment(memoryRepository, attempt(slot.startsAt));
    // Thirty minutes into a sixty-minute booking.
    const overlapping = new Date(slot.startsAt.getTime() + 30 * 60_000);
    const result = await bookAppointment(
      memoryRepository,
      attempt(overlapping, { serviceId: SHORT }),
    );
    expect(result.ok).toBe(false);
  });

  it('survives two concurrent attempts on the same slot, accepting one', async () => {
    const slot = await firstSlot();
    const [a, b] = await Promise.all([
      bookAppointment(memoryRepository, attempt(slot.startsAt, { customerName: 'A' })),
      bookAppointment(memoryRepository, attempt(slot.startsAt, { customerName: 'B' })),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it('refuses a slot covered by a block', async () => {
    const slot = await firstSlot();
    await memoryRepository.createBlock({
      professionalId: PRO,
      startsAt: new Date(slot.startsAt.getTime() - 60_000),
      endsAt: new Date(slot.startsAt.getTime() + 60 * 60_000),
      reason: 'Away',
    });
    const result = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    expect(result.ok).toBe(false);
  });

  it('never exposes customer details through the busy list', async () => {
    const slot = await firstSlot();
    await bookAppointment(memoryRepository, attempt(slot.startsAt));
    const busy = await memoryRepository.listBusy(
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 30 * 86_400_000),
    );
    expect(busy.length).toBe(1);
    expect(JSON.stringify(busy)).not.toContain('Ana Prado');
    expect(JSON.stringify(busy)).not.toContain('ana@example.test');
  });
});

describe('cancellation', () => {
  it('cancels with the right token', async () => {
    const slot = await firstSlot();
    const result = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    if (!result.ok) throw new Error('expected a booking');
    const cancelled = await memoryRepository.cancelByTokenHash(
      await hashToken(result.cancellationToken),
    );
    expect(cancelled).toBe(true);
  });

  it('refuses a wrong token', async () => {
    const slot = await firstSlot();
    await bookAppointment(memoryRepository, attempt(slot.startsAt));
    expect(await memoryRepository.cancelByTokenHash(await hashToken('not-the-token'))).toBe(false);
  });

  it('frees the slot once cancelled', async () => {
    const slot = await firstSlot();
    const first = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    if (!first.ok) throw new Error('expected a booking');
    await memoryRepository.cancelByTokenHash(await hashToken(first.cancellationToken));
    const second = await bookAppointment(
      memoryRepository,
      attempt(slot.startsAt, { customerName: 'Bruno Lima' }),
    );
    expect(second.ok).toBe(true);
  });

  it('cannot be cancelled twice with the same token', async () => {
    const slot = await firstSlot();
    const result = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    if (!result.ok) throw new Error('expected a booking');
    const hash = await hashToken(result.cancellationToken);
    expect(await memoryRepository.cancelByTokenHash(hash)).toBe(true);
    expect(await memoryRepository.cancelByTokenHash(hash)).toBe(false);
  });

  it('stores only the hash, never the token', async () => {
    const slot = await firstSlot();
    const result = await bookAppointment(memoryRepository, attempt(slot.startsAt));
    if (!result.ok) throw new Error('expected a booking');
    const bookings = await memoryRepository.listBookings(
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 30 * 86_400_000),
    );
    expect(JSON.stringify(bookings)).not.toContain(result.cancellationToken);
  });
});
