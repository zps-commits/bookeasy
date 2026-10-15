import { expect } from 'vitest';
import type { BookingRepository } from '@/lib/db/repository';
import { availableSlots } from '@/domain/availability/slots';
import { bookAppointment } from '@/domain/bookings/book';
import { hashToken } from '@/domain/bookings/tokens';
import { civilDateKey } from '@/lib/dates/zone';

/**
 * The contract every repository must satisfy.
 *
 * This is written once and run against each implementation, so "the
 * in-memory one behaves like the database" stops being a claim and becomes
 * something the suite checks. Nothing in here knows which provider it is
 * talking to.
 */

export const ZONE = 'America/Recife';

export type ContractContext = {
  repo: BookingRepository;
  /** Returns the storage to a known state before each case. */
  reset: () => Promise<void>;
};

async function firstBookableSlot(repo: BookingRepository, serviceId: string, professionalId: string) {
  const [services, hours] = await Promise.all([repo.listServices(), repo.listBusinessHours()]);
  const service = services.find((s) => s.id === serviceId);
  if (!service) throw new Error(`the repository has no service ${serviceId}`);

  for (let day = 0; day < 21; day += 1) {
    const probe = new Date(Date.now() + day * 86_400_000);
    const to = new Date(probe.getTime() + 86_400_000);
    const slots = availableSlots({
      dateKey: civilDateKey(probe, ZONE),
      service,
      professionalId,
      businessHours: hours,
      blocks: await repo.listBlocks(probe, to),
      busy: await repo.listBusy(probe, to),
      timeZone: ZONE,
      now: new Date(),
      leadTimeMinutes: 60,
    });
    if (slots.length > 0) return slots[0]!;
  }
  throw new Error('no bookable slot within three weeks');
}

/** Every assertion the interface promises, independent of provider. */
export function repositoryContract(context: () => ContractContext) {
  const details = {
    customerName: 'Ana Prado',
    customerContact: 'ana@example.test',
  };

  return {
    async readsACatalogue() {
      const { repo } = context();
      const services = await repo.listServices();
      const professionals = await repo.listProfessionals();
      expect(services.length).toBeGreaterThan(0);
      expect(professionals.length).toBeGreaterThan(0);
      // Every offered service must be performable by somebody.
      for (const service of services) {
        expect(professionals.some((p) => p.serviceIds.includes(service.id))).toBe(true);
      }
    },

    async moneyIsIntegerCents() {
      const { repo } = context();
      for (const service of await repo.listServices()) {
        expect(Number.isInteger(service.priceCents)).toBe(true);
        expect(Number.isInteger(service.durationMinutes)).toBe(true);
      }
    },

    async booksAndBlocksTheSlot() {
      const { repo } = context();
      const [service] = await repo.listServices();
      const professionals = await repo.listProfessionals();
      const professional = professionals.find((p) => p.serviceIds.includes(service!.id))!;
      const slot = await firstBookableSlot(repo, service!.id, professional.id);

      const first = await bookAppointment(repo, {
        serviceId: service!.id,
        professionalId: professional.id,
        startsAt: slot.startsAt,
        timeZone: ZONE,
        leadTimeMinutes: 60,
        ...details,
      });
      expect(first.ok).toBe(true);

      const second = await bookAppointment(repo, {
        serviceId: service!.id,
        professionalId: professional.id,
        startsAt: slot.startsAt,
        timeZone: ZONE,
        leadTimeMinutes: 60,
        ...details,
        customerName: 'Bruno Lima',
      });
      expect(second.ok).toBe(false);
    },

    async refusesConcurrentBookingsOfTheSameSlot() {
      const { repo } = context();
      const [service] = await repo.listServices();
      const professionals = await repo.listProfessionals();
      const professional = professionals.find((p) => p.serviceIds.includes(service!.id))!;
      const slot = await firstBookableSlot(repo, service!.id, professional.id);

      const attempt = (customerName: string) =>
        bookAppointment(repo, {
          serviceId: service!.id,
          professionalId: professional.id,
          startsAt: slot.startsAt,
          timeZone: ZONE,
          leadTimeMinutes: 60,
          ...details,
          customerName,
        });

      const results = await Promise.all([attempt('A'), attempt('B'), attempt('C')]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    },

    async neverLeaksCustomerDetailsThroughBusy() {
      const { repo } = context();
      const [service] = await repo.listServices();
      const professionals = await repo.listProfessionals();
      const professional = professionals.find((p) => p.serviceIds.includes(service!.id))!;
      const slot = await firstBookableSlot(repo, service!.id, professional.id);

      await bookAppointment(repo, {
        serviceId: service!.id,
        professionalId: professional.id,
        startsAt: slot.startsAt,
        timeZone: ZONE,
        leadTimeMinutes: 60,
        ...details,
      });

      const busy = await repo.listBusy(
        new Date(Date.now() - 86_400_000),
        new Date(Date.now() + 40 * 86_400_000),
      );
      expect(busy.length).toBeGreaterThan(0);
      const serialised = JSON.stringify(busy);
      expect(serialised).not.toContain(details.customerName);
      expect(serialised).not.toContain(details.customerContact);
      for (const interval of busy) {
        expect(Object.keys(interval).sort()).toEqual(['endsAt', 'professionalId', 'startsAt']);
      }
    },

    async cancelsOnlyWithTheRightToken() {
      const { repo } = context();
      const [service] = await repo.listServices();
      const professionals = await repo.listProfessionals();
      const professional = professionals.find((p) => p.serviceIds.includes(service!.id))!;
      const slot = await firstBookableSlot(repo, service!.id, professional.id);

      const booked = await bookAppointment(repo, {
        serviceId: service!.id,
        professionalId: professional.id,
        startsAt: slot.startsAt,
        timeZone: ZONE,
        leadTimeMinutes: 60,
        ...details,
      });
      if (!booked.ok) throw new Error('expected the booking to succeed');

      expect(await repo.cancelByTokenHash(await hashToken('a-token-that-is-not-it'))).toBe(false);
      const right = await hashToken(booked.cancellationToken);
      expect(await repo.cancelByTokenHash(right)).toBe(true);
      // A second attempt with the same token must not work either.
      expect(await repo.cancelByTokenHash(right)).toBe(false);
    },

    async findsABookingOnlyByItsOwnToken() {
      const { repo } = context();
      const [service] = await repo.listServices();
      const professionals = await repo.listProfessionals();
      const professional = professionals.find((p) => p.serviceIds.includes(service!.id))!;
      const slot = await firstBookableSlot(repo, service!.id, professional.id);

      const booked = await bookAppointment(repo, {
        serviceId: service!.id,
        professionalId: professional.id,
        startsAt: slot.startsAt,
        timeZone: ZONE,
        leadTimeMinutes: 60,
        ...details,
      });
      if (!booked.ok) throw new Error('expected the booking to succeed');

      expect(await repo.findByTokenHash(await hashToken('wrong'))).toBeNull();
      const found = await repo.findByTokenHash(await hashToken(booked.cancellationToken));
      expect(found?.customerName).toBe(details.customerName);
    },

    async blocksRemoveAvailability() {
      const { repo } = context();
      const [service] = await repo.listServices();
      const professionals = await repo.listProfessionals();
      const professional = professionals.find((p) => p.serviceIds.includes(service!.id))!;
      const slot = await firstBookableSlot(repo, service!.id, professional.id);

      const block = await repo.createBlock({
        professionalId: professional.id,
        startsAt: new Date(slot.startsAt.getTime() - 60_000),
        endsAt: new Date(slot.endsAt.getTime() + 60_000),
        reason: 'Away',
      });
      expect(block.id).toBeTruthy();

      const result = await bookAppointment(repo, {
        serviceId: service!.id,
        professionalId: professional.id,
        startsAt: slot.startsAt,
        timeZone: ZONE,
        leadTimeMinutes: 60,
        ...details,
      });
      expect(result.ok).toBe(false);

      expect(await repo.deleteBlock(block.id)).toBe(true);
      expect(await repo.deleteBlock(block.id)).toBe(false);
    },
  };
}
