import type {
  AvailabilityBlock,
  Booking,
  BookingProblem,
  BusinessHours,
  BusyInterval,
  Professional,
  Service,
} from '@/types/booking';

export type CreateBookingInput = {
  serviceId: string;
  professionalId: string;
  customerName: string;
  customerContact: string;
  startsAt: Date;
  tokenHash: string;
};

export type CreateBookingResult =
  | { ok: true; bookingId: string; startsAt: Date; endsAt: Date }
  | { ok: false; problem: BookingProblem };

/**
 * Everything the application needs from storage.
 *
 * Two implementations exist: one over Supabase, and one in memory. The
 * in-memory one is not a mock bolted on for tests — it is what the
 * application runs on when no credentials are configured, so the demo and
 * the test suite exercise the same code path.
 */
/** What a customer may see of their own booking. No internal ids. */
export type CustomerBookingView = {
  serviceName: string;
  professionalName: string;
  startsAt: Date;
  endsAt: Date;
  status: Booking['status'];
  customerName: string;
};

export type BookingRepository = {
  listServices(): Promise<Service[]>;
  listProfessionals(): Promise<Professional[]>;
  listBusinessHours(): Promise<BusinessHours[]>;
  listBlocks(from: Date, to: Date): Promise<AvailabilityBlock[]>;
  /** Busy intervals only. Never carries customer details. */
  listBusy(from: Date, to: Date): Promise<BusyInterval[]>;
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
  /** Returns true when a confirmed, future booking was cancelled. */
  cancelByTokenHash(tokenHash: string): Promise<boolean>;
  /**
   * The customer's own booking, looked up by the hash of the token only
   * they hold. Returns null for anything else, so a wrong token and a
   * nonexistent booking are indistinguishable.
   */
  findByTokenHash(tokenHash: string): Promise<CustomerBookingView | null>;

  /* Administration. Every one of these requires an authenticated caller. */
  listBookings(from: Date, to: Date): Promise<Booking[]>;
  setBookingStatus(id: string, status: Booking['status']): Promise<boolean>;
  upsertService(service: Omit<Service, 'id'> & { id?: string }): Promise<Service>;
  createBlock(block: Omit<AvailabilityBlock, 'id'>): Promise<AvailabilityBlock>;
  deleteBlock(id: string): Promise<boolean>;
};
