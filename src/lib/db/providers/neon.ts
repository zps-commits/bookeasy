import { Pool } from '@neondatabase/serverless';
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
 * PostgreSQL, over a Neon connection.
 *
 * Two things this provider is responsible for and the interface is not:
 *
 * 1. Administrative statements run inside a transaction that sets
 *    app.is_admin, which the row level security policies read. The flag is
 *    set only after the application's own authorisation check has passed,
 *    and `set local` means it dies with the transaction.
 *
 * 2. Database errors are translated into the problems the interface knows
 *    how to put into words. A raw error message can carry schema detail a
 *    visitor has no business reading.
 */

let pool: Pool | null = null;

export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() ?? '';
}

export const postgresConfigured = (): boolean => databaseUrl().length > 0;

function getPool(): Pool {
  if (!pool) {
    const connectionString = databaseUrl();
    if (!connectionString) {
      // A clear failure beats a connection attempt to an empty string.
      throw new Error('DATABASE_URL is not set. The application runs in demo mode without it.');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/** Test seam, and what a long-lived process should call on shutdown. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

type Row = Record<string, unknown>;

async function query<T = Row>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, values);
  return result.rows as T[];
}

/**
 * Runs statements with the administrator flag set, inside one transaction.
 * The flag is scoped to the transaction, so it cannot leak to the next
 * statement on a pooled connection.
 */
async function asAdmin<T>(run: (exec: typeof query) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.is_admin', 'true', true)");
    const exec = async <R = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
      const result = await client.query(text, values);
      return result.rows as R[];
    };
    const value = await run(exec as typeof query);
    await client.query('commit');
    return value;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const num = (value: unknown): number => Number(value);
const str = (value: unknown): string => String(value);
const date = (value: unknown): Date => new Date(String(value));

const toService = (row: Row): Service => ({
  id: str(row.id),
  name: str(row.name),
  description: row.description === null ? null : str(row.description),
  durationMinutes: num(row.duration_minutes),
  priceCents: num(row.price_cents),
  currency: (str(row.currency) === 'USD' ? 'USD' : 'BRL') as CurrencyCode,
  active: Boolean(row.active),
});

/** Maps a raised database error onto a problem the interface can phrase. */
function problemFor(message: string): CreateBookingResult {
  if (message.includes('service_unavailable')) return { ok: false, problem: 'service-unavailable' };
  if (message.includes('in_the_past')) return { ok: false, problem: 'in-the-past' };
  if (message.includes('blocked')) return { ok: false, problem: 'blocked' };
  if (message.includes('slot_taken')) return { ok: false, problem: 'slot-taken' };
  // An exclusion violation that reached here unmapped is still a clash.
  if (message.includes('bookings_no_overlap')) return { ok: false, problem: 'slot-taken' };
  return { ok: false, problem: 'slot-taken' };
}

export const neonRepository: BookingRepository = {
  async listServices() {
    const rows = await query(
      'select id, name, description, duration_minutes, price_cents, currency, active from services where active = true order by name',
    );
    return rows.map(toService);
  },

  async listProfessionals() {
    const rows = await query(`
      select p.id, p.name, p.active,
             coalesce(array_agg(sp.service_id) filter (where sp.service_id is not null), '{}') as service_ids
        from professionals p
        left join service_professionals sp on sp.professional_id = p.id
       where p.active = true
       group by p.id
       order by p.name
    `);
    return rows.map(
      (row): Professional => ({
        id: str(row.id),
        name: str(row.name),
        active: Boolean(row.active),
        serviceIds: (row.service_ids as string[]) ?? [],
      }),
    );
  },

  async listBusinessHours() {
    const rows = await query(
      'select professional_id, weekday, opens_minute, closes_minute from business_hours',
    );
    return rows.map(
      (row): BusinessHours => ({
        professionalId: str(row.professional_id),
        weekday: num(row.weekday),
        opensMinute: num(row.opens_minute),
        closesMinute: num(row.closes_minute),
      }),
    );
  },

  async listBlocks(from, to) {
    const rows = await query(
      'select id, professional_id, starts_at, ends_at, reason from availability_blocks where starts_at < $2 and ends_at > $1',
      [from.toISOString(), to.toISOString()],
    );
    return rows.map(
      (row): AvailabilityBlock => ({
        id: str(row.id),
        professionalId: str(row.professional_id),
        startsAt: date(row.starts_at),
        endsAt: date(row.ends_at),
        reason: row.reason === null ? null : str(row.reason),
      }),
    );
  },

  async listBusy(from, to) {
    // A security definer function, so this returns the interval and never
    // touches a customer's name even though bookings are unreadable here.
    const rows = await query('select * from busy_intervals($1, $2)', [
      from.toISOString(),
      to.toISOString(),
    ]);
    return rows.map(
      (row): BusyInterval => ({
        professionalId: str(row.professional_id),
        startsAt: date(row.starts_at),
        endsAt: date(row.ends_at),
      }),
    );
  },

  async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
    try {
      const rows = await query('select * from create_booking($1, $2, $3, $4, $5, $6)', [
        input.serviceId,
        input.professionalId,
        input.customerName,
        input.customerContact,
        input.startsAt.toISOString(),
        input.tokenHash,
      ]);
      const row = rows[0];
      if (!row) return { ok: false, problem: 'slot-taken' };
      return {
        ok: true,
        bookingId: str(row.booking_id),
        startsAt: date(row.starts_at),
        endsAt: date(row.ends_at),
      };
    } catch (error) {
      return problemFor(error instanceof Error ? error.message : '');
    }
  },

  async cancelByTokenHash(tokenHash) {
    try {
      const rows = await query('select cancel_booking($1) as affected', [tokenHash]);
      return num(rows[0]?.affected ?? 0) > 0;
    } catch {
      return false;
    }
  },

  async findByTokenHash(tokenHash): Promise<CustomerBookingView | null> {
    try {
      const rows = await query('select * from booking_by_token($1)', [tokenHash]);
      const row = rows[0];
      if (!row) return null;
      return {
        serviceName: str(row.service_name),
        professionalName: str(row.professional_name),
        startsAt: date(row.starts_at),
        endsAt: date(row.ends_at),
        status: str(row.status) as BookingStatus,
        customerName: str(row.customer_name),
      };
    } catch {
      return null;
    }
  },

  async listBookings(from, to) {
    return asAdmin(async (exec) => {
      const rows = await exec(
        `select id, service_id, professional_id, customer_name, customer_contact,
                starts_at, ends_at, status, created_at
           from bookings
          where starts_at < $2 and ends_at > $1
          order by starts_at`,
        [from.toISOString(), to.toISOString()],
      );
      return rows.map(
        (row): Booking => ({
          id: str(row.id),
          serviceId: str(row.service_id),
          professionalId: str(row.professional_id),
          customerName: str(row.customer_name),
          customerContact: str(row.customer_contact),
          startsAt: date(row.starts_at),
          endsAt: date(row.ends_at),
          status: str(row.status) as BookingStatus,
          createdAt: date(row.created_at),
        }),
      );
    });
  },

  async setBookingStatus(id, status) {
    try {
      return await asAdmin(async (exec) => {
        const rows = await exec('update bookings set status = $2 where id = $1 returning id', [
          id,
          status,
        ]);
        return rows.length > 0;
      });
    } catch {
      return false;
    }
  },

  async upsertService(service) {
    return asAdmin(async (exec) => {
      const rows = service.id
        ? await exec(
            `update services set name = $2, description = $3, duration_minutes = $4,
                    price_cents = $5, currency = $6, active = $7
               where id = $1
           returning id, name, description, duration_minutes, price_cents, currency, active`,
            [
              service.id,
              service.name,
              service.description,
              service.durationMinutes,
              service.priceCents,
              service.currency,
              service.active,
            ],
          )
        : await exec(
            `insert into services (name, description, duration_minutes, price_cents, currency, active)
                  values ($1, $2, $3, $4, $5, $6)
             returning id, name, description, duration_minutes, price_cents, currency, active`,
            [
              service.name,
              service.description,
              service.durationMinutes,
              service.priceCents,
              service.currency,
              service.active,
            ],
          );
      const row = rows[0];
      if (!row) throw new Error('The service could not be saved.');
      return toService(row);
    });
  },

  async createBlock(block) {
    return asAdmin(async (exec) => {
      const rows = await exec(
        `insert into availability_blocks (professional_id, starts_at, ends_at, reason)
              values ($1, $2, $3, $4)
         returning id, professional_id, starts_at, ends_at, reason`,
        [block.professionalId, block.startsAt.toISOString(), block.endsAt.toISOString(), block.reason],
      );
      const row = rows[0];
      if (!row) throw new Error('The block could not be created.');
      return {
        id: str(row.id),
        professionalId: str(row.professional_id),
        startsAt: date(row.starts_at),
        endsAt: date(row.ends_at),
        reason: row.reason === null ? null : str(row.reason),
      };
    });
  },

  async deleteBlock(id) {
    try {
      return await asAdmin(async (exec) => {
        const rows = await exec('delete from availability_blocks where id = $1 returning id', [id]);
        return rows.length > 0;
      });
    } catch {
      return false;
    }
  },
};
