import { connection } from 'next/server';
import Link from 'next/link';
import { repository } from '@/lib/db';
import { bookableServices, professionalsFor } from '@/domain/services/catalog';
import { duration, money } from '@/lib/format';

export default async function HomePage() {
  // The catalogue is editable from the admin panel, so this is read per
  // request rather than frozen into the build.
  await connection();
  const repo = repository();
  const [services, professionals] = await Promise.all([
    repo.listServices(),
    repo.listProfessionals(),
  ]);
  const offered = bookableServices(services);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        Book a time that is genuinely free.
      </h1>
      <p className="mt-4 max-w-prose text-muted">
        Every slot below is checked against the opening hours, the blocked periods and the
        appointments already taken. If you can see it, you can have it.
      </p>

      <h2 className="section-title mt-12">Services</h2>

      {offered.length === 0 ? (
        <p className="panel mt-4 p-6 text-sm text-muted">
          No services are being offered at the moment.
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {offered.map((service) => {
            const people = professionalsFor(professionals, service.id);
            return (
              <li key={service.id} className="panel flex flex-col p-5 sm:p-6">
                <h3 className="text-lg font-semibold tracking-tight">{service.name}</h3>
                {service.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted">{service.description}</p>
                ) : null}

                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-muted">Length</dt>
                    <dd className="font-mono">{duration(service.durationMinutes)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted">Price</dt>
                    <dd className="font-mono">{money(service.priceCents, service.currency)}</dd>
                  </div>
                </dl>

                <p className="mt-3 text-sm text-muted">
                  {people.length === 0
                    ? 'Nobody is currently taking this service.'
                    : `With ${people.map((p) => p.name).join(' or ')}.`}
                </p>

                <div className="mt-auto pt-5">
                  {people.length === 0 ? (
                    <span className="text-sm text-muted">Unavailable</span>
                  ) : (
                    <Link
                      href={`/book/${service.id}`}
                      className="btn-primary pressable inline-block"
                    >
                      Choose a time
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-12 max-w-prose text-sm text-muted">
        Already booked? Open the private link you were given when you booked. It is the only way
        back to the appointment, and the only way to cancel it — there is no account and no
        password.
      </p>
    </div>
  );
}
