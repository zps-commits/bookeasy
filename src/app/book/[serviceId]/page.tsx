import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { repository } from '@/lib/db';
import { findService, professionalsFor } from '@/domain/services/catalog';
import { availableSlots } from '@/domain/availability/slots';
import { civilDateKey } from '@/lib/dates/zone';
import { BOOKING_HORIZON_DAYS, BOOKING_TIMEZONE, LEAD_TIME_MINUTES } from '@/lib/config';
import BookingFlow, { type DayOffer } from '@/components/booking/BookingFlow';
import { duration, money } from '@/lib/format';

export default async function BookPage({ params }: { params: Promise<{ serviceId: string }> }) {
  await connection();
  const { serviceId } = await params;
  const repo = repository();

  const [services, professionals, businessHours] = await Promise.all([
    repo.listServices(),
    repo.listProfessionals(),
    repo.listBusinessHours(),
  ]);

  const service = findService(services, serviceId);
  if (!service || !service.active) notFound();

  const people = professionalsFor(professionals, service.id);
  if (people.length === 0) notFound();

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + BOOKING_HORIZON_DAYS * 86_400_000);
  const [blocks, busy] = await Promise.all([
    repo.listBlocks(now, horizonEnd),
    repo.listBusy(now, horizonEnd),
  ]);

  /*
   * Availability is computed on the server for every professional and
   * every day in the horizon, then sent down as plain data. The browser
   * filters and renders; it never decides what is free.
   */
  const offers: Record<string, DayOffer[]> = {};
  for (const person of people) {
    const days: DayOffer[] = [];
    for (let i = 0; i < BOOKING_HORIZON_DAYS; i += 1) {
      const probe = new Date(now.getTime() + i * 86_400_000);
      const dateKey = civilDateKey(probe, BOOKING_TIMEZONE);
      const slots = availableSlots({
        dateKey,
        service,
        professionalId: person.id,
        businessHours,
        blocks,
        busy,
        timeZone: BOOKING_TIMEZONE,
        now,
        leadTimeMinutes: LEAD_TIME_MINUTES,
      });
      days.push({ dateKey, starts: slots.map((s) => s.startsAt.toISOString()) });
    }
    offers[person.id] = days;
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{service.name}</h1>
      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span className="font-mono text-ink">{duration(service.durationMinutes)}</span>
        <span className="font-mono text-ink">{money(service.priceCents, service.currency)}</span>
        <span>Times shown in {BOOKING_TIMEZONE.replace('_', ' ')}</span>
      </p>
      {service.description ? (
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">{service.description}</p>
      ) : null}

      <BookingFlow
        serviceId={service.id}
        durationMinutes={service.durationMinutes}
        professionals={people.map((p) => ({ id: p.id, name: p.name }))}
        offers={offers}
        timeZone={BOOKING_TIMEZONE}
      />
    </div>
  );
}
