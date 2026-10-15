import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AvailabilityBlock,
  Booking,
  BookingStatus,
  BusinessHours,
  BusyInterval,
  CurrencyCode,
  Professional,
  Service,
} from '@/types/booking';
import type {
  BookingRepository,
  CreateBookingInput,
  CreateBookingResult,
  CustomerBookingView,
} from '../repository';

/**
 * The Supabase implementation.
 *
 * Booking and cancellation go through database functions rather than table
 * writes, so this client never needs select on bookings. Availability is
 * read from a view that carries the busy interval and no customer data.
 */

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  active: boolean;
};

const toService = (row: ServiceRow): Service => ({
  id: row.id,
  name: row.name,
  description: row.description,
  durationMinutes: row.duration_minutes,
  priceCents: row.price_cents,
  currency: (row.currency === 'USD' ? 'USD' : 'BRL') as CurrencyCode,
  active: row.active,
});

/** Maps the database's error strings onto the problems the interface shows. */
function problemFor(message: string): CreateBookingResult {
  const known = ['service_unavailable', 'in_the_past', 'blocked', 'slot_taken'] as const;
  const match = known.find((code) => message.includes(code));
  switch (match) {
    case 'service_unavailable':
      return { ok: false, problem: 'service-unavailable' };
    case 'in_the_past':
      return { ok: false, problem: 'in-the-past' };
    case 'blocked':
      return { ok: false, problem: 'blocked' };
    case 'slot_taken':
      return { ok: false, problem: 'slot-taken' };
    default:
      // An unmapped database error is not surfaced verbatim: it can carry
      // schema detail that a visitor has no business reading.
      return { ok: false, problem: 'slot-taken' };
  }
}

export function supabaseRepository(client: SupabaseClient): BookingRepository {
  return {
    async listServices() {
      const { data, error } = await client
        .from('services')
        .select('id,name,description,duration_minutes,price_cents,currency,active')
        .eq('active', true);
      if (error) throw error;
      return (data ?? []).map((row) => toService(row as ServiceRow));
    },

    async listProfessionals() {
      const { data, error } = await client
        .from('professionals')
        .select('id,name,active,service_professionals(service_id)')
        .eq('active', true);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as { id: string; name: string; active: boolean; service_professionals: { service_id: string }[] };
        return {
          id: r.id,
          name: r.name,
          active: r.active,
          serviceIds: (r.service_professionals ?? []).map((sp) => sp.service_id),
        } satisfies Professional;
      });
    },

    async listBusinessHours() {
      const { data, error } = await client
        .from('business_hours')
        .select('professional_id,weekday,opens_minute,closes_minute');
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as { professional_id: string; weekday: number; opens_minute: number; closes_minute: number };
        return {
          professionalId: r.professional_id,
          weekday: r.weekday,
          opensMinute: r.opens_minute,
          closesMinute: r.closes_minute,
        } satisfies BusinessHours;
      });
    },

    async listBlocks(from, to) {
      const { data, error } = await client
        .from('availability_blocks')
        .select('id,professional_id,starts_at,ends_at,reason')
        .lt('starts_at', to.toISOString())
        .gt('ends_at', from.toISOString());
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as { id: string; professional_id: string; starts_at: string; ends_at: string; reason: string | null };
        return {
          id: r.id,
          professionalId: r.professional_id,
          startsAt: new Date(r.starts_at),
          endsAt: new Date(r.ends_at),
          reason: r.reason,
        } satisfies AvailabilityBlock;
      });
    },

    async listBusy(from, to) {
      const { data, error } = await client
        .from('public_busy_intervals')
        .select('professional_id,starts_at,ends_at')
        .lt('starts_at', to.toISOString())
        .gt('ends_at', from.toISOString());
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as { professional_id: string; starts_at: string; ends_at: string };
        return {
          professionalId: r.professional_id,
          startsAt: new Date(r.starts_at),
          endsAt: new Date(r.ends_at),
        } satisfies BusyInterval;
      });
    },

    async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      const { data, error } = await client.rpc('create_booking', {
        p_service_id: input.serviceId,
        p_professional_id: input.professionalId,
        p_customer_name: input.customerName,
        p_customer_contact: input.customerContact,
        p_starts_at: input.startsAt.toISOString(),
        p_token_hash: input.tokenHash,
      });
      if (error) return problemFor(error.message ?? '');
      const row = (data as { booking_id: string; starts_at: string; ends_at: string }[] | null)?.[0];
      if (!row) return { ok: false, problem: 'slot-taken' };
      return {
        ok: true,
        bookingId: row.booking_id,
        startsAt: new Date(row.starts_at),
        endsAt: new Date(row.ends_at),
      };
    },

    async cancelByTokenHash(tokenHash) {
      const { data, error } = await client.rpc('cancel_booking', { p_token_hash: tokenHash });
      if (error) return false;
      return typeof data === 'number' && data > 0;
    },

    async findByTokenHash(tokenHash): Promise<CustomerBookingView | null> {
      const { data, error } = await client.rpc('booking_by_token', { p_token_hash: tokenHash });
      if (error) return null;
      const row = (data as Record<string, string>[] | null)?.[0];
      if (!row) return null;
      return {
        serviceName: row.service_name!,
        professionalName: row.professional_name!,
        startsAt: new Date(row.starts_at!),
        endsAt: new Date(row.ends_at!),
        status: row.status as CustomerBookingView['status'],
        customerName: row.customer_name!,
      };
    },

    async listBookings(from, to) {
      const { data, error } = await client
        .from('bookings')
        .select('id,service_id,professional_id,customer_name,customer_contact,starts_at,ends_at,status,created_at')
        .lt('starts_at', to.toISOString())
        .gt('ends_at', from.toISOString())
        .order('starts_at');
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as Record<string, string>;
        return {
          id: r.id!,
          serviceId: r.service_id!,
          professionalId: r.professional_id!,
          customerName: r.customer_name!,
          customerContact: r.customer_contact!,
          startsAt: new Date(r.starts_at!),
          endsAt: new Date(r.ends_at!),
          status: r.status as BookingStatus,
          createdAt: new Date(r.created_at!),
        } satisfies Booking;
      });
    },

    async setBookingStatus(id, status) {
      const { error } = await client.from('bookings').update({ status }).eq('id', id);
      return !error;
    },

    async upsertService(service) {
      const payload = {
        ...(service.id ? { id: service.id } : {}),
        name: service.name,
        description: service.description,
        duration_minutes: service.durationMinutes,
        price_cents: service.priceCents,
        currency: service.currency,
        active: service.active,
      };
      const { data, error } = await client
        .from('services')
        .upsert(payload)
        .select('id,name,description,duration_minutes,price_cents,currency,active')
        .single();
      if (error) throw error;
      return toService(data as ServiceRow);
    },

    async createBlock(block) {
      const { data, error } = await client
        .from('availability_blocks')
        .insert({
          professional_id: block.professionalId,
          starts_at: block.startsAt.toISOString(),
          ends_at: block.endsAt.toISOString(),
          reason: block.reason,
        })
        .select('id,professional_id,starts_at,ends_at,reason')
        .single();
      if (error) throw error;
      const r = data as { id: string; professional_id: string; starts_at: string; ends_at: string; reason: string | null };
      return {
        id: r.id,
        professionalId: r.professional_id,
        startsAt: new Date(r.starts_at),
        endsAt: new Date(r.ends_at),
        reason: r.reason,
      };
    },

    async deleteBlock(id) {
      const { error } = await client.from('availability_blocks').delete().eq('id', id);
      return !error;
    },
  };
}
