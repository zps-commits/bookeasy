import type { BookingProblem, Service, Slot } from '@/types/booking';
import type { BookingRepository } from '@/lib/db/repository';
import { availableSlots } from '@/domain/availability/slots';
import { civilDateKey } from '@/lib/dates/zone';
import { createCancellationToken, hashToken } from './tokens';

export type BookAttempt = {
  serviceId: string;
  professionalId: string;
  customerName: string;
  customerContact: string;
  startsAt: Date;
  timeZone: string;
  leadTimeMinutes?: number;
};

export type BookOutcome =
  | { ok: true; bookingId: string; slot: Slot; service: Service; cancellationToken: string }
  | { ok: false; problem: BookingProblem };

/**
 * Makes a booking, after re-deriving availability on the server.
 *
 * The browser already filtered the slot list, and that filtering is not
 * evidence: the request can be replayed, edited, or simply arrive after
 * someone else took the slot. Everything is recomputed here from storage,
 * and the storage layer refuses an overlap again underneath. Three checks
 * sounds redundant until two people press the button in the same second.
 */
export async function bookAppointment(
  repo: BookingRepository,
  attempt: BookAttempt,
): Promise<BookOutcome> {
  const [services, professionals] = await Promise.all([
    repo.listServices(),
    repo.listProfessionals(),
  ]);

  const service = services.find((s) => s.id === attempt.serviceId);
  if (!service || !service.active) return { ok: false, problem: 'service-unavailable' };

  const professional = professionals.find((p) => p.id === attempt.professionalId);
  if (!professional || !professional.active || !professional.serviceIds.includes(service.id)) {
    return { ok: false, problem: 'professional-unavailable' };
  }

  if (!Number.isFinite(attempt.startsAt.getTime())) {
    return { ok: false, problem: 'invalid-details' };
  }

  const dateKey = civilDateKey(attempt.startsAt, attempt.timeZone);
  const dayStart = new Date(attempt.startsAt.getTime() - 48 * 3_600_000);
  const dayEnd = new Date(attempt.startsAt.getTime() + 48 * 3_600_000);

  const [businessHours, blocks, busy] = await Promise.all([
    repo.listBusinessHours(),
    repo.listBlocks(dayStart, dayEnd),
    repo.listBusy(dayStart, dayEnd),
  ]);

  const offered = availableSlots({
    dateKey,
    service,
    professionalId: professional.id,
    businessHours,
    blocks,
    busy,
    timeZone: attempt.timeZone,
    now: new Date(),
    leadTimeMinutes: attempt.leadTimeMinutes ?? 0,
  });

  const match = offered.find((slot) => slot.startsAt.getTime() === attempt.startsAt.getTime());
  if (!match) {
    // Distinguish a slot that never existed from one that is simply gone,
    // because the two need different words in front of a customer.
    const past = attempt.startsAt.getTime() < Date.now();
    if (past) return { ok: false, problem: 'in-the-past' };
    const clash = busy.some(
      (b) =>
        b.professionalId === professional.id &&
        b.startsAt.getTime() < attempt.startsAt.getTime() + service.durationMinutes * 60_000 &&
        attempt.startsAt.getTime() < b.endsAt.getTime(),
    );
    return { ok: false, problem: clash ? 'slot-taken' : 'outside-business-hours' };
  }

  const token = createCancellationToken();
  const tokenHash = await hashToken(token);

  const created = await repo.createBooking({
    serviceId: service.id,
    professionalId: professional.id,
    customerName: attempt.customerName,
    customerContact: attempt.customerContact,
    startsAt: attempt.startsAt,
    tokenHash,
  });

  if (!created.ok) return created;

  return {
    ok: true,
    bookingId: created.bookingId,
    slot: { startsAt: created.startsAt, endsAt: created.endsAt },
    service,
    cancellationToken: token,
  };
}

/** Words for each refusal. One message per problem, no generic failure. */
export const PROBLEM_MESSAGE: Record<BookingProblem, string> = {
  'service-unavailable': 'That service is no longer being offered.',
  'professional-unavailable': 'That person is not taking this service.',
  'in-the-past': 'That time has already passed. Please pick another.',
  'outside-business-hours': 'That time is outside the opening hours.',
  blocked: 'That time is not available.',
  'slot-taken': 'Someone booked that time while you were filling this in. Please pick another.',
  'invalid-details': 'Please check the details and try again.',
};
