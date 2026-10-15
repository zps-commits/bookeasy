import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The cookie jar is the only part of the session layer that needs Next, so
 * it is the only part replaced here. The signing, the comparison and the
 * expiry are the real implementation.
 */
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const PASSWORD = 'a-long-enough-password';
/** Generated once here, so the tests exercise the real derivation. */
let HASH = '';

beforeAll(async () => {
  const { hashPassword } = await import('@/lib/auth/password');
  HASH = await hashPassword(PASSWORD);
});

beforeEach(() => {
  jar.clear();
  vi.resetModules();
  process.env.ADMIN_PASSWORD_HASH = HASH;
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  delete process.env.ADMIN_PASSWORD_HASH;
  vi.useRealTimers();
});

const load = () => import('@/lib/auth/session');

describe('administration availability', () => {
  it('is off when no password hash is set', async () => {
    delete process.env.ADMIN_PASSWORD_HASH;
    const { adminAvailable, adminUnavailableReason } = await load();
    expect(adminAvailable()).toBe(false);
    expect(adminUnavailableReason()).toMatch(/switched off/);
  });

  it('is off for a value that is not a hash at all', async () => {
    process.env.ADMIN_PASSWORD_HASH = 'just-a-plain-password';
    const { adminAvailable } = await load();
    expect(adminAvailable()).toBe(false);
  });

  it('is off for a hash with too few iterations to be worth having', async () => {
    process.env.ADMIN_PASSWORD_HASH = 'pbkdf2$10$c2FsdA==$aGFzaA==';
    const { adminAvailable } = await load();
    expect(adminAvailable()).toBe(false);
  });

  it('is on once a well-formed hash is set', async () => {
    const { adminAvailable, adminUnavailableReason } = await load();
    expect(adminAvailable()).toBe(true);
    expect(adminUnavailableReason()).toBeNull();
  });
});

describe('sessions', () => {
  it('refuses the wrong password', async () => {
    const { createSession, isSignedIn } = await load();
    expect(await createSession('not-the-password')).toBe(false);
    expect(await isSignedIn()).toBe(false);
  });

  it('refuses an empty password even when one is configured', async () => {
    const { createSession } = await load();
    expect(await createSession('')).toBe(false);
  });

  it('signs in with the right password', async () => {
    const { createSession, isSignedIn } = await load();
    expect(await createSession(PASSWORD)).toBe(true);
    expect(await isSignedIn()).toBe(true);
  });

  it('is not signed in with no cookie at all', async () => {
    const { isSignedIn } = await load();
    expect(await isSignedIn()).toBe(false);
  });

  it('rejects a cookie whose signature does not match', async () => {
    const { createSession, isSignedIn } = await load();
    await createSession(PASSWORD);
    const [issuedAt] = jar.get('bookeasy_admin')!.split('.');
    jar.set('bookeasy_admin', `${issuedAt}.${'0'.repeat(64)}`);
    expect(await isSignedIn()).toBe(false);
  });

  it('rejects a cookie whose timestamp was edited', async () => {
    const { createSession, isSignedIn } = await load();
    await createSession(PASSWORD);
    const [, mac] = jar.get('bookeasy_admin')!.split('.');
    jar.set('bookeasy_admin', `${Date.now() + 1000}.${mac}`);
    expect(await isSignedIn()).toBe(false);
  });

  it('rejects a malformed cookie', async () => {
    const { isSignedIn } = await load();
    jar.set('bookeasy_admin', 'nonsense');
    expect(await isSignedIn()).toBe(false);
  });

  it('expires after eight hours', async () => {
    const { createSession, isSignedIn } = await load();
    await createSession(PASSWORD);
    expect(await isSignedIn()).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 9 * 3_600_000));
    expect(await isSignedIn()).toBe(false);
  });

  it('stops being valid once the password changes', async () => {
    const { createSession } = await load();
    await createSession(PASSWORD);

    const { hashPassword } = await import('@/lib/auth/password');
    const other = await hashPassword('a-completely-different-password');
    vi.resetModules();
    process.env.ADMIN_PASSWORD_HASH = other;
    const { isSignedIn } = await load();
    expect(await isSignedIn()).toBe(false);
  });

  it('signs out', async () => {
    const { createSession, destroySession, isSignedIn } = await load();
    await createSession(PASSWORD);
    await destroySession();
    expect(await isSignedIn()).toBe(false);
  });
});

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const { hashPassword, verifyPassword } = await import('@/lib/auth/password');
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('refuses a different password', async () => {
    const { hashPassword, verifyPassword } = await import('@/lib/auth/password');
    const hash = await hashPassword('one password');
    expect(await verifyPassword('another password', hash)).toBe(false);
  });

  it('produces a different hash each time, so the salt is doing its job', async () => {
    const { hashPassword } = await import('@/lib/auth/password');
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });

  it('stores no part of the password in the hash', async () => {
    const { hashPassword } = await import('@/lib/auth/password');
    const hash = await hashPassword('a-very-distinctive-password');
    expect(hash).not.toContain('distinctive');
  });

  it.each([
    ['an empty string', ''],
    ['a plain password', 'hunter2'],
    ['a hash with the wrong prefix', 'bcrypt$1$c2FsdA==$aGFzaA=='],
    ['a truncated hash', 'pbkdf2$210000$c2FsdA=='],
    ['a hash with too few iterations', 'pbkdf2$1$c2FsdA==$aGFzaA=='],
  ])('refuses %s as a stored hash', async (_label, stored) => {
    const { verifyPassword } = await import('@/lib/auth/password');
    expect(await verifyPassword('anything', stored)).toBe(false);
  });

  it('refuses a hash whose base64 is corrupt rather than throwing', async () => {
    const { verifyPassword } = await import('@/lib/auth/password');
    expect(await verifyPassword('anything', 'pbkdf2$210000$!!!!$!!!!')).toBe(false);
  });
});
