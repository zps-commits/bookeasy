import { connection } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { repository } from '@/lib/supabase';
import { BOOKING_TIMEZONE } from '@/lib/config';
import { clockTime, longDate, money } from '@/lib/format';
import { civilDateKey } from '@/lib/dates/zone';
import { updateStatus } from './actions';
import type { BookingStatus } from '@/types/booking';

export const metadata = { title: 'Agenda' };

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No show',
};

export default async function AdminAgenda({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await connection();
  await requireAdmin();

  const { range } = await searchParams;
  const days = range === 'week' ? 7 : 1;

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60_000);
  const to = new Date(now.getTime() + days * 86_400_000);

  const repo = repository();
  const [bookings, services, professionals] = await Promise.all([
    repo.listBookings(from, to),
    repo.listServices(),
    repo.listProfessionals(),
  ]);

  const nameOf = (id: string, list: { id: string; name: string }[]) =>
    list.find((x) => x.id === id)?.name ?? 'Unknown';

  const byDay = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const key = civilDateKey(booking.startsAt, BOOKING_TIMEZONE);
    byDay.set(key, [...(byDay.get(key) ?? []), booking]);
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {days === 1 ? 'Today' : 'The next seven days'}
        </h1>
        <nav className="flex gap-1" aria-label="Range">
          {[
            ['/admin', 'Day', days === 1],
            ['/admin?range=week', 'Week', days === 7],
          ].map(([href, label, active]) => (
            <a
              key={String(href)}
              href={String(href)}
              aria-current={active ? 'page' : undefined}
              className={`pressable rounded-field px-3 py-1.5 text-sm ${
                active ? 'bg-accent text-surface' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {bookings.length === 0 ? (
        <p className="panel mt-6 p-6 text-sm text-muted">
          Nothing booked in this range. When someone books, it appears here.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {[...byDay.entries()].map(([key, dayBookings]) => (
            <section key={key}>
              <h2 className="section-title">
                {longDate(dayBookings[0]!.startsAt, BOOKING_TIMEZONE)}
              </h2>
              <ul className="panel mt-3 divide-y divide-line">
                {dayBookings.map((booking) => {
                  const service = services.find((s) => s.id === booking.serviceId);
                  return (
                    <li
                      key={booking.id}
                      className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm">
                          {clockTime(booking.startsAt, BOOKING_TIMEZONE)} –{' '}
                          {clockTime(booking.endsAt, BOOKING_TIMEZONE)}
                        </p>
                        <p className="mt-1 font-medium">{booking.customerName}</p>
                        <p className="mt-0.5 text-sm text-muted">{booking.customerContact}</p>
                        <p className="mt-1.5 text-sm text-muted">
                          {service?.name ?? 'Service'} ·{' '}
                          {nameOf(booking.professionalId, professionals)}
                          {service ? ` · ${money(service.priceCents, service.currency)}` : ''}
                        </p>
                      </div>

                      <form action={updateStatus} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={booking.id} />
                        <label htmlFor={`status-${booking.id}`} className="sr-only">
                          Status for {booking.customerName}
                        </label>
                        <select
                          id={`status-${booking.id}`}
                          name="status"
                          defaultValue={booking.status}
                          className="field w-auto py-2"
                        >
                          {(Object.keys(STATUS_LABEL) as BookingStatus[]).map((status) => (
                            <option key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-quiet pressable py-2">
                          Save
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
