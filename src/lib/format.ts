import type { Cents, CurrencyCode } from '@/types/booking';

const LOCALES: Record<CurrencyCode, string> = { BRL: 'pt-BR', USD: 'en-US' };

export function money(cents: Cents, currency: CurrencyCode): string {
  return new Intl.NumberFormat(LOCALES[currency], { style: 'currency', currency }).format(
    cents / 100,
  );
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function clockTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

export function longDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(instant);
}

export function shortDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(instant);
}
