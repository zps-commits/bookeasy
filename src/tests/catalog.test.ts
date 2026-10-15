import { describe, expect, it } from 'vitest';
import {
  bookableServices,
  canPerform,
  catalogProblems,
  findService,
  professionalsFor,
} from '@/domain/services/catalog';
import { memoryRepository } from '@/lib/supabase/memory';
import type { Professional, Service } from '@/types/booking';
import { bookingRequestSchema, serviceSchema } from '@/lib/validation/schemas';

const service = (over: Partial<Service> = {}): Service => ({
  id: 's1',
  name: 'A service',
  description: null,
  durationMinutes: 60,
  priceCents: 1000,
  currency: 'BRL',
  active: true,
  ...over,
});

const professional = (over: Partial<Professional> = {}): Professional => ({
  id: 'p1',
  name: 'Someone',
  active: true,
  serviceIds: ['s1'],
  ...over,
});

describe('catalogue', () => {
  it('offers only active services', () => {
    const list = bookableServices([service(), service({ id: 's2', active: false })]);
    expect(list.map((s) => s.id)).toEqual(['s1']);
  });

  it('finds a service and returns null for an unknown one', () => {
    expect(findService([service()], 's1')?.id).toBe('s1');
    expect(findService([service()], 'nope')).toBeNull();
  });

  it('lists only active people who perform the service', () => {
    const people = professionalsFor(
      [professional(), professional({ id: 'p2', active: false }), professional({ id: 'p3', serviceIds: [] })],
      's1',
    );
    expect(people.map((p) => p.id)).toEqual(['p1']);
  });

  it('refuses a professional who does not perform the service', () => {
    expect(canPerform([professional()], 'p1', 's1')).toBe(true);
    expect(canPerform([professional()], 'p1', 's2')).toBe(false);
    expect(canPerform([professional({ active: false })], 'p1', 's1')).toBe(false);
  });
});

describe('catalogue faults', () => {
  it('finds none in the demonstration data', async () => {
    const [services, professionals] = await Promise.all([
      memoryRepository.listServices(),
      memoryRepository.listProfessionals(),
    ]);
    expect(catalogProblems(services, professionals)).toEqual([]);
  });

  it('flags an active service nobody performs', () => {
    const problems = catalogProblems([service()], [professional({ serviceIds: [] })]);
    expect(problems.map((p) => p.code)).toContain('service-without-professional');
  });

  it('flags a duplicate id', () => {
    expect(catalogProblems([service(), service()], [professional()]).map((p) => p.code)).toContain(
      'duplicate-service',
    );
  });

  it('flags a professional pointing at a service that does not exist', () => {
    const problems = catalogProblems([service()], [professional({ serviceIds: ['s1', 'ghost'] })]);
    expect(problems.map((p) => p.code)).toContain('unknown-service-reference');
  });

  it('flags a non-positive duration and a negative price', () => {
    const codes = catalogProblems(
      [service({ durationMinutes: 0 }), service({ id: 's2', priceCents: -1 })],
      [professional({ serviceIds: ['s1', 's2'] })],
    ).map((p) => p.code);
    expect(codes).toContain('non-positive-duration');
    expect(codes).toContain('negative-price');
  });
});

describe('validation', () => {
  const valid = {
    serviceId: '11111111-1111-1111-1111-111111111111',
    professionalId: '22222222-2222-2222-2222-222222222222',
    customerName: 'Ana Prado',
    customerContact: 'ana@example.test',
    startsAt: new Date().toISOString(),
  };

  it('accepts a complete request', () => {
    expect(bookingRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('trims the name and contact', () => {
    const parsed = bookingRequestSchema.parse({ ...valid, customerName: '  Ana Prado  ' });
    expect(parsed.customerName).toBe('Ana Prado');
  });

  it.each([
    ['an empty name', { customerName: '' }],
    ['a one-character name', { customerName: 'A' }],
    ['an empty contact', { customerContact: '' }],
    ['a service id that is not a uuid', { serviceId: 'nope' }],
    ['a start that is not a date', { startsAt: 'whenever' }],
  ])('refuses %s', (_label, bad) => {
    expect(bookingRequestSchema.safeParse({ ...valid, ...bad }).success).toBe(false);
  });

  it('refuses a name longer than the column allows', () => {
    expect(
      bookingRequestSchema.safeParse({ ...valid, customerName: 'x'.repeat(200) }).success,
    ).toBe(false);
  });

  it('refuses a service duration outside the permitted range', () => {
    const base = { name: 'X', durationMinutes: 60, priceCents: 0, currency: 'BRL', active: true };
    expect(serviceSchema.safeParse({ ...base, durationMinutes: 1 }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, durationMinutes: 1000 }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, priceCents: -5 }).success).toBe(false);
  });
});
