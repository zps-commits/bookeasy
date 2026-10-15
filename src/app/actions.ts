'use server';

import { redirect } from 'next/navigation';
import { repository } from '@/lib/supabase';
import { bookAppointment, PROBLEM_MESSAGE } from '@/domain/bookings/book';
import { bookingRequestSchema, cancellationSchema } from '@/lib/validation/schemas';
import { hashToken } from '@/domain/bookings/tokens';
import { BOOKING_TIMEZONE, LEAD_TIME_MINUTES } from '@/lib/config';

export type BookingFormState = { error: string | null };

/**
 * Takes a booking request from the browser and re-derives everything.
 *
 * The form already knew which slots were free, and that knowledge is not
 * evidence: the request can be replayed or edited, and the slot can be
 * taken between the page rendering and the button being pressed.
 */
export async function submitBooking(
  _previous: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const parsed = bookingRequestSchema.safeParse({
    serviceId: formData.get('serviceId'),
    professionalId: formData.get('professionalId'),
    customerName: formData.get('customerName'),
    customerContact: formData.get('customerContact'),
    startsAt: formData.get('startsAt'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the details and try again.' };
  }

  const result = await bookAppointment(repository(), {
    serviceId: parsed.data.serviceId,
    professionalId: parsed.data.professionalId,
    customerName: parsed.data.customerName,
    customerContact: parsed.data.customerContact,
    startsAt: new Date(parsed.data.startsAt),
    timeZone: BOOKING_TIMEZONE,
    leadTimeMinutes: LEAD_TIME_MINUTES,
  });

  if (!result.ok) return { error: PROBLEM_MESSAGE[result.problem] };

  // The token is the only way back to this booking, and it goes in the URL
  // rather than in a cookie so the customer can keep the link.
  redirect(`/booking/${result.cancellationToken}`);
}

export type CancelState = { error: string | null; cancelled: boolean };

export async function cancelBooking(
  _previous: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const parsed = cancellationSchema.safeParse({ token: formData.get('token') });
  if (!parsed.success) {
    return { error: 'That cancellation link is not valid.', cancelled: false };
  }

  const cancelled = await repository().cancelByTokenHash(await hashToken(parsed.data.token));
  if (!cancelled) {
    // Deliberately the same message whether the token is wrong, the
    // booking is already cancelled, or it has already happened. None of
    // those should be distinguishable from outside.
    return { error: 'That booking could not be cancelled.', cancelled: false };
  }
  return { error: null, cancelled: true };
}
