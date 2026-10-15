import { connection } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { repository } from '@/lib/db';
import { duration, money } from '@/lib/format';
import ServiceForm from '@/components/admin/ServiceForm';

export const metadata = { title: 'Services' };

export default async function AdminServices() {
  await connection();
  await requireAdmin();

  const services = await repository().listServices();

  return (
    <>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Services</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Duration drives the whole calendar: change it and the slots offered change with it.
      </p>

      <ul className="panel mt-6 divide-y divide-line">
        {services.map((service) => (
          <li key={service.id} className="flex flex-wrap items-baseline justify-between gap-3 p-4 sm:p-5">
            <div className="min-w-0">
              <p className="font-medium">{service.name}</p>
              <p className="mt-0.5 text-sm text-muted">
                {duration(service.durationMinutes)} · {money(service.priceCents, service.currency)}
              </p>
            </div>
            <span className={`text-sm ${service.active ? 'text-positive' : 'text-muted'}`}>
              {service.active ? 'Offered' : 'Hidden'}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="section-title mt-10">Add a service</h2>
      <ServiceForm />
    </>
  );
}
