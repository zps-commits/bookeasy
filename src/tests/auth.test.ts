import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  jar.clear();
  vi.resetModules();
  process.env.ADMIN_DEMO_PASSWORD = PASSWORD;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterEach(() => {
  delete process.env.ADMIN_DEMO_PASSWORD;
  vi.useRealTimers();
});

const load = () => import('@/lib/auth/session');

describe('administration availability', () => {
  it('is off when no password is set and no Supabase is configured', async () => {
    delete process.env.ADMIN_DEMO_PASSWORD;
    const { adminAvailable, adminUnavailableReason } = await load();
    expect(adminAvailable()).toBe(false);
    expect(adminUnavailableReason()).toMatch(/switched off/);
  });

  it('is off for a password too short to be worth having', async () => {
    process.env.ADMIN_DEMO_PASSWORD = 'short';
    const { adminAvailable } = await load();
    expect(adminAvailable()).toBe(false);
  });

  it('is on once a long enough password is set', async () => {
    const { adminAvailable, adminUnavailableReason } = await load();
    expect(adminAvailable()).toBe(true);
    expect(adminUnavailableReason()).toBeNull();
  });
});

describe('sessions', () => {
  it('refuses the wrong password', async () => {
    const { createDemoSession, isSignedIn } = await load();
    expect(await createDemoSession('not-the-password')).toBe(false);
    expect(await isSignedIn()).toBe(false);
  });

  it('refuses an empty password even when one is configured', async () => {
    const { createDemoSession } = await load();
    expect(await createDemoSession('')).toBe(false);
  });

  it('signs in with the right password', async () => {
    const { createDemoSession, isSignedIn } = await load();
    expect(await createDemoSession(PASSWORD)).toBe(true);
    expect(await isSignedIn()).toBe(true);
  });

  it('is not signed in with no cookie at all', async () => {
    const { isSignedIn } = await load();
    expect(await isSignedIn()).toBe(false);
  });

  it('rejects a cookie whose signature does not match', async () => {
    const { createDemoSession, isSignedIn } = await load();
    await createDemoSession(PASSWORD);
    const [issuedAt] = jar.get('bookeasy_admin')!.split('.');
    jar.set('bookeasy_admin', `${issuedAt}.${'0'.repeat(64)}`);
    expect(await isSignedIn()).toBe(false);
  });

  it('rejects a cookie whose timestamp was edited', async () => {
    const { createDemoSession, isSignedIn } = await load();
    await createDemoSession(PASSWORD);
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
    const { createDemoSession, isSignedIn } = await load();
    await createDemoSession(PASSWORD);
    expect(await isSignedIn()).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 9 * 3_600_000));
    expect(await isSignedIn()).toBe(false);
  });

  it('stops being valid once the password changes', async () => {
    const { createDemoSession } = await load();
    await createDemoSession(PASSWORD);

    vi.resetModules();
    process.env.ADMIN_DEMO_PASSWORD = 'a-different-long-password';
    const { isSignedIn } = await load();
    expect(await isSignedIn()).toBe(false);
  });

  it('signs out', async () => {
    const { createDemoSession, destroySession, isSignedIn } = await load();
    await createDemoSession(PASSWORD);
    await destroySession();
    expect(await isSignedIn()).toBe(false);
  });
});
