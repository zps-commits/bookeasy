import type {
  AvailabilityBlock,
  Booking,
  BusinessHours,
  Professional,
  Service,
} from '@/types/booking';
import { overlaps } from '@/domain/availability/intervals';
import type {
  BookingRepository,
  CreateBookingInput,
  CreateBookingResult,
  CustomerBookingView,
} from '../repository';

/**
 * The in-memory repository.
 *
 * This is what the application runs on with no Supabase credentials, and
 * what every test runs against. It reproduces the two rules the database
 * enforces with constraints — no overlapping confirmed booking, and an end
 * time derived from the service rather than supplied by the caller —
 * because a demo that accepts a double booking is not demonstrating the
 * product.
 */

const DEMO_PROFESSIONALS: Professional[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Alex Moreira',
    active: true,
    serviceIds: [
      'aaaaaaaa-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000002',
      'aaaaaaaa-0000-0000-0000-000000000003',
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Rita Canuto',
    active: true,
    serviceIds: ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'],
  },
];

const DEMO_SERVICES: Service[] = [
  {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Strategy consultation',
    description: 'A focused hour on one problem, with written notes afterwards.',
    durationMinutes: 60,
    priceCents: 35000,
    currency: 'BRL',
    active: true,
  },
  {
    id: 'aaaaaaaa-0000-0000-0000-000000000002',
    name: 'Follow-up session',
    description: 'A shorter check-in for work already under way.',
    durationMinutes: 30,
    priceCents: 18000,
    currency: 'BRL',
    active: true,
  },
  {
    id: 'aaaaaaaa-0000-0000-0000-000000000003',
    name: 'Full review',
    description: 'A long session covering a whole project end to end.',
    durationMinutes: 120,
    priceCents: 62000,
    currency: 'BRL',
    active: true,
  },
];

/** Weekdays, 09:00-12:00 and 13:00-18:00, as two windows rather than a hole. */
const DEMO_HOURS: BusinessHours[] = DEMO_PROFESSIONALS.flatMap((p) =>
  [1, 2, 3, 4, 5].flatMap((weekday) => [
    { professionalId: p.id, weekday, opensMinute: 540, closesMinute: 720 },
    { professionalId: p.id, weekday, opensMinute: 780, closesMinute: 1080 },
  ]),
);

type State = {
  services: Service[];
  professionals: Professional[];
  hours: BusinessHours[];
  blocks: AvailabilityBlock[];
  bookings: (Booking & { tokenHash: string })[];
};

function seed(): State {
  return {
    services: DEMO_SERVICES.map((s) => ({ ...s })),
    professionals: DEMO_PROFESSIONALS.map((p) => ({ ...p, serviceIds: [...p.serviceIds] })),
    hours: DEMO_HOURS.map((h) => ({ ...h })),
    blocks: [],
    bookings: [],
  };
}

let state: State = seed();

/** Test seam. Returns the store to its demonstration contents. */
export function resetMemoryRepository(): void {
  state = seed();
}

const inWindow = (from: Date, to: Date) => (item: { startsAt: Date; endsAt: Date }) =>
  item.endsAt.getTime() > from.getTime() && item.startsAt.getTime() < to.getTime();

export const memoryRepository: BookingRepository = {
  async listServices() {
    return state.services.map((s) => ({ ...s }));
  },

  async listProfessionals() {
    return state.professionals.map((p) => ({ ...p, serviceIds: [...p.serviceIds] }));
  },

  async listBusinessHours() {
    return state.hours.map((h) => ({ ...h }));
  },

  async listBlocks(from, to) {
    return state.blocks.filter(inWindow(from, to)).map((b) => ({ ...b }));
  },

  async listBusy(from, to) {
    // Only the interval. The customer's name never leaves this function.
    return state.bookings
      .filter((b) => b.status === 'confirmed')
      .filter(inWindow(from, to))
      .map((b) => ({ professionalId: b.professionalId, startsAt: b.startsAt, endsAt: b.endsAt }));
  },

  async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
    const service = state.services.find((s) => s.id === input.serviceId);
    if (!service || !service.active) return { ok: false, problem: 'service-unavailable' };

    const professional = state.professionals.find((p) => p.id === input.professionalId);
    if (!professional || !professional.active || !professional.serviceIds.includes(service.id)) {
      return { ok: false, problem: 'professional-unavailable' };
    }

    // Derived here, never taken from the caller.
    const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
    if (input.startsAt.getTime() < Date.now()) return { ok: false, problem: 'in-the-past' };

    const candidate = { startsAt: input.startsAt, endsAt };

    if (
      state.blocks
        .filter((b) => b.professionalId === professional.id)
        .some((b) => overlaps(candidate, b))
    ) {
      return { ok: false, problem: 'blocked' };
    }

    // The same rule the exclusion constraint enforces in PostgreSQL.
    if (
      state.bookings
        .filter((b) => b.status === 'confirmed' && b.professionalId === professional.id)
        .some((b) => overlaps(candidate, b))
    ) {
      return { ok: false, problem: 'slot-taken' };
    }

    const booking: Booking & { tokenHash: string } = {
      id: crypto.randomUUID(),
      serviceId: service.id,
      professionalId: professional.id,
      customerName: input.customerName,
      customerContact: input.customerContact,
      startsAt: input.startsAt,
      endsAt,
      status: 'confirmed',
      createdAt: new Date(),
      tokenHash: input.tokenHash,
    };
    state.bookings.push(booking);
    return { ok: true, bookingId: booking.id, startsAt: booking.startsAt, endsAt };
  },

  async cancelByTokenHash(tokenHash) {
    const booking = state.bookings.find(
      (b) =>
        b.tokenHash === tokenHash && b.status === 'confirmed' && b.startsAt.getTime() > Date.now(),
    );
    if (!booking) return false;
    booking.status = 'cancelled';
    return true;
  },

  async findByTokenHash(tokenHash): Promise<CustomerBookingView | null> {
    const booking = state.bookings.find((b) => b.tokenHash === tokenHash);
    if (!booking) return null;
    const service = state.services.find((s) => s.id === booking.serviceId);
    const professional = state.professionals.find((p) => p.id === booking.professionalId);
    return {
      serviceName: service?.name ?? 'Service',
      professionalName: professional?.name ?? 'Team',
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      customerName: booking.customerName,
    };
  },

  async listBookings(from, to) {
    return state.bookings
      .filter(inWindow(from, to))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      // The hash never leaves this module, not even to the admin panel.
      .map((booking) => {
        const copy: Record<string, unknown> = { ...booking };
        delete copy.tokenHash;
        return copy as Booking;
      });
  },

  async setBookingStatus(id, status) {
    const booking = state.bookings.find((b) => b.id === id);
    if (!booking) return false;
    booking.status = status;
    return true;
  },

  async upsertService(service) {
    if (service.id) {
      const index = state.services.findIndex((s) => s.id === service.id);
      if (index >= 0) {
        const next = { ...state.services[index]!, ...service, id: service.id };
        state.services[index] = next;
        return { ...next };
      }
    }
    const created: Service = { ...service, id: service.id ?? crypto.randomUUID() };
    state.services.push(created);
    return { ...created };
  },

  async createBlock(block) {
    const created: AvailabilityBlock = { ...block, id: crypto.randomUUID() };
    state.blocks.push(created);
    return { ...created };
  },

  async deleteBlock(id) {
    const before = state.blocks.length;
    state.blocks = state.blocks.filter((b) => b.id !== id);
    return state.blocks.length < before;
  },
};
