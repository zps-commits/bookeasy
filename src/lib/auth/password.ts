/**
 * Password hashing, with Web Crypto so it runs in Node and at the edge.
 *
 * The deployment stores a hash, never a password. Format:
 *
 *   pbkdf2$<iterations>$<salt base64>$<derived key base64>
 *
 * PBKDF2-SHA256 rather than argon2 or scrypt because those need a native
 * module, and a password check that cannot run in the runtime the route
 * runs in is not a password check.
 */

const ITERATIONS = 210_000; // OWASP's 2023 floor for PBKDF2-SHA256.
const KEY_BITS = 256;
const SALT_BYTES = 16;

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const derived = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

/** Constant-time comparison. A short-circuit leaks the matching prefix. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1_000) return false;

  try {
    const salt = fromBase64(parts[2]!);
    const expected = fromBase64(parts[3]!);
    const actual = await derive(password, salt, iterations);
    return sameBytes(actual, expected);
  } catch {
    // A malformed hash is a configuration error, not a successful login.
    return false;
  }
}

/** Shape check, so a misconfigured deployment fails at the door. */
export function looksLikeHash(value: string): boolean {
  const parts = value.split('$');
  return parts.length === 4 && parts[0] === 'pbkdf2' && Number(parts[1]) >= 1_000;
}
