import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { repository } from '@/lib/db';
import { hashToken, looksLikeToken } from '@/domain/bookings/tokens';
import { BOOKING_TIMEZONE } from '@/lib/config';
import { clockTime, longDate } from '@/lib/format';
import CancelBooking from '@/components/booking/CancelBooking';

/** This page is addressed by a secret. It must never be indexed. */
export const metadata = { robots: { index: false, follow: false } };

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!looksLikeToken(token)) notFound();

  const booking = await repository().findByTokenHash(await hashToken(token));
  // A wrong token and a booking that does not exist produce the same 404,
  // so the page cannot be used to probe for valid ids.
  if (!booking) notFound();

  const cancelled = booking.status === 'cancelled';
  // Read once, before rendering. Calling Date.now() inside the component
  // body is an impure read that the React lint rules reject.
  const renderedAt = new Date();
  const past = booking.startsAt.getTime() < renderedAt.getTime();

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="section-title">{cancelled ? 'Cancelled' : 'Confirmed'}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {cancelled ? 'This booking was cancelled.' : `You are booked, ${booking.customerName}.`}
      </h1>

      <dl className="panel mt-7 divide-y divide-line">
        {[
          ['Service', booking.serviceName],
          ['With', booking.professionalName],
          ['Date', longDate(booking.startsAt, BOOKING_TIMEZONE)],
          [
            'Time',
            `${clockTime(booking.startsAt, BOOKING_TIMEZONE)} – ${clockTime(booking.endsAt, BOOKING_TIMEZONE)}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-wrap justify-between gap-4 px-5 py-3.5 sm:px-6">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {cancelled ? null : past ? (
        <p className="mt-6 text-sm text-muted">This appointment has already happened.</p>
      ) : (
        <CancelBooking token={token} />
      )}

      <div className="mt-10 rounded-panel border border-line bg-surface p-5">
        <h2 className="section-title">Keep this link</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This page is the only way back to your booking. It is addressed by a private token, so
          anyone with the link can see and cancel it, and nobody without it can. There is no
          account and no password to forget.
        </p>
      </div>
    </div>
  );
}
