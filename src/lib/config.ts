/** The timezone every availability calculation is resolved in. */
export const BOOKING_TIMEZONE =
  process.env.NEXT_PUBLIC_BOOKING_TIMEZONE?.trim() || 'America/Recife';

/** How far ahead a customer may book. */
export const BOOKING_HORIZON_DAYS = 30;

/** How soon before a slot it stops being offered. */
export const LEAD_TIME_MINUTES = 60;

export const site = {
  name: 'BookEasy',
  tagline: 'Pick a time that is actually free.',
} as const;
