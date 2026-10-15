/**
 * Cancellation tokens.
 *
 * The raw token is shown to the customer once and never stored. Only its
 * hash goes to the database, so a copy of the bookings table does not let
 * anyone cancel anyone else's appointment.
 */

const TOKEN_BYTES = 24;

export function createCancellationToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Shape check only. A token that fails this never reaches the database. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(value);
}
