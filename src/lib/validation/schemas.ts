import { z } from 'zod';

/** Trimmed, bounded, and required. Every string that reaches the database. */
const name = z
  .string()
  .trim()
  .min(2, 'Please enter your name.')
  .max(120, 'That name is too long.');

const contact = z
  .string()
  .trim()
  .min(3, 'Please enter an email address or phone number.')
  .max(160, 'That contact detail is too long.');

export const bookingRequestSchema = z.object({
  serviceId: z.string().uuid('Choose a service.'),
  professionalId: z.string().uuid('Choose who you are booking with.'),
  customerName: name,
  customerContact: contact,
  /** An ISO instant. Parsed, not trusted. */
  startsAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a time.'),
  notes: z.string().trim().max(500).optional(),
});

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export const cancellationSchema = z.object({
  token: z.string().trim().regex(/^[A-Za-z0-9_-]{32,64}$/, 'That cancellation link is not valid.'),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  priceCents: z.coerce.number().int().min(0),
  currency: z.enum(['BRL', 'USD']),
  active: z.boolean(),
});

export const blockSchema = z
  .object({
    professionalId: z.string().uuid(),
    startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
    endsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: 'The end must come after the start.',
    path: ['endsAt'],
  });
