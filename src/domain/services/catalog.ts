import type { Professional, Service } from '@/types/booking';

/** Only active services are ever offered to a visitor. */
export function bookableServices(services: Service[]): Service[] {
  return services.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name));
}

export function findService(services: Service[], id: string): Service | null {
  return services.find((s) => s.id === id) ?? null;
}

/** Who can perform a service. An inactive professional is never offered. */
export function professionalsFor(professionals: Professional[], serviceId: string): Professional[] {
  return professionals
    .filter((p) => p.active && p.serviceIds.includes(serviceId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function canPerform(
  professionals: Professional[],
  professionalId: string,
  serviceId: string,
): boolean {
  const professional = professionals.find((p) => p.id === professionalId);
  return Boolean(professional?.active && professional.serviceIds.includes(serviceId));
}

export type CatalogProblem = { code: string; detail: string };

/**
 * Structural faults a catalogue can have, asserted empty by a test. A
 * service nobody can perform is bookable in the interface and impossible
 * in practice, which is the kind of gap that only shows up in front of a
 * customer.
 */
export function catalogProblems(services: Service[], professionals: Professional[]): CatalogProblem[] {
  const problems: CatalogProblem[] = [];
  const ids = new Set<string>();

  for (const service of services) {
    if (ids.has(service.id)) problems.push({ code: 'duplicate-service', detail: service.id });
    ids.add(service.id);
    if (service.durationMinutes <= 0) {
      problems.push({ code: 'non-positive-duration', detail: service.id });
    }
    if (service.priceCents < 0) problems.push({ code: 'negative-price', detail: service.id });
    if (service.active && professionalsFor(professionals, service.id).length === 0) {
      problems.push({ code: 'service-without-professional', detail: service.id });
    }
  }

  for (const professional of professionals) {
    for (const serviceId of professional.serviceIds) {
      if (!services.some((s) => s.id === serviceId)) {
        problems.push({ code: 'unknown-service-reference', detail: `${professional.id}:${serviceId}` });
      }
    }
  }

  return problems;
}
