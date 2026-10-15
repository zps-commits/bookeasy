/** Whole minutes. Slot arithmetic is integer arithmetic, never floating point. */
export type Minutes = number;

/** Money as an integer number of cents. No float ever holds a price. */
export type Cents = number;

export type CurrencyCode = 'BRL' | 'USD';

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: Minutes;
  priceCents: Cents;
  currency: CurrencyCode;
  active: boolean;
};

export type Professional = {
  id: string;
  name: string;
  active: boolean;
  /** Services this person performs. */
  serviceIds: string[];
};

/**
 * Opening hours as minutes from midnight in the business timezone, not as
 * timestamps. "We open at nine" has to stay true across a daylight saving
 * change, and a stored instant does not.
 */
export type BusinessHours = {
  professionalId: string;
  /** 0 is Sunday, matching Date.getDay. */
  weekday: number;
  opensMinute: Minutes;
  closesMinute: Minutes;
};

/** An interval the professional is unavailable, whatever the opening hours say. */
export type AvailabilityBlock = {
  id: string;
  professionalId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
};

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export type Booking = {
  id: string;
  serviceId: string;
  professionalId: string;
  customerName: string;
  customerContact: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  createdAt: Date;
};

/**
 * A busy interval with no customer attached. This is all the availability
 * calculation needs, and all an anonymous visitor is ever given.
 */
export type BusyInterval = {
  professionalId: string;
  startsAt: Date;
  endsAt: Date;
};

export type Slot = {
  startsAt: Date;
  endsAt: Date;
};

/** Why a booking could not be made. Each one is shown to the customer as itself. */
export type BookingProblem =
  | 'service-unavailable'
  | 'professional-unavailable'
  | 'in-the-past'
  | 'outside-business-hours'
  | 'blocked'
  | 'slot-taken'
  | 'invalid-details';
