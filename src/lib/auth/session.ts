import { cookies } from 'next/headers';
import { looksLikeHash, verifyPassword } from './password';

/**
 * Administration access.
 *
 * The deployment stores a PBKDF2 hash in ADMIN_PASSWORD_HASH and never a
 * password. If it is absent or malformed, the panel does not exist: every
 * admin route refuses and the login page explains why. There is no default
 * credential, and there is no path that accepts a plaintext password from
 * the environment.
 *
 * The session cookie is signed with a key derived from that hash, so
 * changing the password invalidates every session already issued without
 * needing a second secret to rotate.
 */

const COOKIE = 'bookeasy_admin';
const MAX_AGE_SECONDS = 60 * 60 * 8;

export function passwordHash(): string | null {
  const value = process.env.ADMIN_PASSWORD_HASH?.trim();
  return value && looksLikeHash(value) ? value : null;
}

export function adminAvailable(): boolean {
  return passwordHash() !== null;
}

export function adminUnavailableReason(): string | null {
  if (adminAvailable()) return null;
  return 'Administration is switched off. Generate a hash with `node scripts/hash-password.mjs` and set ADMIN_PASSWORD_HASH, then restart.';
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

/** Constant-time comparison. A length-only check leaks the prefix. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(password: string): Promise<boolean> {
  const stored = passwordHash();
  if (!stored) return false;
  if (!(await verifyPassword(password, stored))) return false;

  const issuedAt = String(Date.now());
  const token = `${issuedAt}.${await sign(issuedAt, stored)}`;
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
  const stored = passwordHash();
  if (!stored) return false;

  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return false;

  const [issuedAt, mac] = raw.split('.');
  if (!issuedAt || !mac) return false;
  if (!sameString(mac, await sign(issuedAt, stored))) return false;

  const age = Date.now() - Number(issuedAt);
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE_SECONDS * 1000;
}
