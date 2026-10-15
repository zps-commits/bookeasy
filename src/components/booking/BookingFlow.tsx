'use client';

import { useActionState, useId, useMemo, useState } from 'react';
import { submitBooking, type BookingFormState } from '@/app/actions';
import { clockTime, longDate, shortDate } from '@/lib/format';

export type DayOffer = { dateKey: string; starts: string[] };

type Props = {
  serviceId: string;
  durationMinutes: number;
  professionals: { id: string; name: string }[];
  /** Availability, already computed on the server, per professional. */
  offers: Record<string, DayOffer[]>;
  timeZone: string;
};

const initial: BookingFormState = { error: null };

export default function BookingFlow({ serviceId, professionals, offers, timeZone }: Props) {
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? '');
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [state, action, pending] = useActionState(submitBooking, initial);
  const nameId = useId();
  const contactId = useId();

  const openDays = useMemo(
    () => (offers[professionalId] ?? []).filter((d) => d.starts.length > 0),
    [offers, professionalId],
  );
  const [dateKey, setDateKey] = useState<string | null>(null);

  const activeDay = openDays.find((d) => d.dateKey === dateKey) ?? openDays[0] ?? null;
  const slots = activeDay?.starts ?? [];

  function chooseProfessional(id: string) {
    setProfessionalId(id);
    // The new person has a different calendar, so a slot chosen for the
    // previous one is not transferable and must not silently survive.
    setSelectedStart(null);
    setDateKey(null);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      {/*
        min-w-0 is load-bearing. A grid item defaults to min-width:auto, so
        the scrolling day strip inside pushed the column wider than the
        screen instead of scrolling, and the whole page overflowed by more
        than a thousand pixels on a phone.
      */}
      <div className="min-w-0 space-y-6">
        {professionals.length > 1 ? (
          <section className="panel p-5 sm:p-6">
            <h2 className="section-title">Who with</h2>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose who with">
              {professionals.map((person) => {
                const active = person.id === professionalId;
                return (
                  <button
                    key={person.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseProfessional(person.id)}
                    className={`pressable rounded-field border px-3.5 py-2 text-sm ${
                      active
                        ? 'border-accent bg-accent text-surface'
                        : 'border-line-strong bg-surface text-ink hover:border-muted'
                    }`}
                  >
                    {person.name}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="panel p-5 sm:p-6">
          <h2 className="section-title">Day</h2>
          {openDays.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No times are free in the next few weeks. Try another person, or check back later.
            </p>
          ) : (
            <div
              className="mt-3 flex gap-2 overflow-x-auto pb-1"
              tabIndex={0}
              role="group"
              aria-label="Choose a day"
            >
              {openDays.map((day) => {
                const active = day.dateKey === activeDay?.dateKey;
                const sample = new Date(day.starts[0]!);
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setDateKey(day.dateKey);
                      setSelectedStart(null);
                    }}
                    className={`pressable shrink-0 rounded-field border px-3.5 py-2.5 text-left ${
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-line-strong bg-surface hover:border-muted'
                    }`}
                  >
                    <span className="block text-sm font-medium">
                      {shortDate(sample, timeZone)}
                    </span>
                    <span className="block text-xs text-muted">
                      {day.starts.length} {day.starts.length === 1 ? 'time' : 'times'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {activeDay ? (
          <section className="panel p-5 sm:p-6">
            <h2 className="section-title">Time</h2>
            <p className="mt-2 text-sm text-muted">
              {longDate(new Date(activeDay.starts[0]!), timeZone)}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((iso) => {
                const active = iso === selectedStart;
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedStart(iso)}
                    className={`pressable rounded-field border py-2.5 text-center font-mono text-sm ${
                      active
                        ? 'border-accent bg-accent text-surface'
                        : 'border-line-strong bg-surface hover:border-muted'
                    }`}
                  >
                    {clockTime(new Date(iso), timeZone)}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <form action={action} className="panel p-5 sm:p-6">
        <h2 className="section-title">Your details</h2>

        <input type="hidden" name="serviceId" value={serviceId} />
        <input type="hidden" name="professionalId" value={professionalId} />
        <input type="hidden" name="startsAt" value={selectedStart ?? ''} />

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor={nameId} className="mb-1.5 block text-sm font-medium">
              Name
            </label>
            <input id={nameId} name="customerName" required maxLength={120} className="field" />
          </div>
          <div>
            <label htmlFor={contactId} className="mb-1.5 block text-sm font-medium">
              Email or phone
            </label>
            <input
              id={contactId}
              name="customerContact"
              required
              maxLength={160}
              className="field"
            />
            <p className="mt-1.5 text-xs leading-snug text-muted">
              Used only so the appointment can be confirmed with you.
            </p>
          </div>
        </div>

        <div
          className="mt-5 rounded-field border border-line bg-paper p-3 text-sm"
          aria-live="polite"
        >
          {selectedStart ? (
            <>
              <span className="text-muted">Booking </span>
              <span className="font-medium">
                {longDate(new Date(selectedStart), timeZone)} at{' '}
                {clockTime(new Date(selectedStart), timeZone)}
              </span>
            </>
          ) : (
            <span className="text-muted">Pick a day and a time above.</span>
          )}
        </div>

        {state.error ? (
          <p role="alert" className="mt-4 text-sm font-medium text-negative">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!selectedStart || pending}
          className="btn-primary pressable mt-5 w-full"
        >
          {pending ? 'Booking…' : 'Confirm booking'}
        </button>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          Nothing is held until you press this. If someone takes the time while you are typing,
          you will be told rather than double-booked.
        </p>
      </form>
    </div>
  );
}
