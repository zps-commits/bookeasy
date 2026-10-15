import { cookies } from 'next/headers';
import { supabaseConfigured } from '@/lib/supabase/client';

/**
 * Administration access.
 *
 * Two modes, and neither has a default credential.
 *
 * With Supabase configured, the administrator signs in through Supabase
 * Auth and the session cookie is theirs.
 *
 * Without it, the panel is open only if ADMIN_DEMO_PASSWORD is set in the
 * environment. If it is not set, the panel does not exist: every admin
 * route refuses, and the login page says why. A demonstration that ships
 * with admin/admin is worse than one with no admin at all.
 */

const COOKIE = 'bookeasy_admin';
const MAX_AGE_SECONDS = 60 * 60 * 8;

export function demoPassword(): string | null {
  const value = process.env.ADMIN_DEMO_PASSWORD?.trim();
  return value && value.length >= 8 ? value : null;
}

export function adminAvailable(): boolean {
  return supabaseConfigured || demoPassword() !== null;
}

/** Why the panel is unavailable, in words an operator can act on. */
export function adminUnavailableReason(): string | null {
  if (adminAvailable()) return null;
  return 'Administration is switched off. Set ADMIN_DEMO_PASSWORD to at least eight characters, or configure Supabase, and restart.';
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison. A length check alone leaks the prefix. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createDemoSession(password: string): Promise<boolean> {
  const expected = demoPassword();
  if (!expected || !sameString(password, expected)) return false;

  const issuedAt = String(Date.now());
  const token = `${issuedAt}.${await sign(issuedAt, expected)}`;
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return true;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isSignedIn(): Promise<boolean> {
  const secret = demoPassword();
  if (!secret) return false;

  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return false;

  const [issuedAt, mac] = raw.split('.');
  if (!issuedAt || !mac) return false;
  if (!sameString(mac, await sign(issuedAt, secret))) return false;

  const age = Date.now() - Number(issuedAt);
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE_SECONDS * 1000;
}
