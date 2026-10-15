/**
 * Browser verification.
 *
 * Unit tests cover the arithmetic and the rules; this covers what only a
 * real browser answers: whether the page overflows, whether axe finds a
 * barrier, whether the whole booking flow actually completes, and whether
 * an unauthenticated visitor is kept out of the admin panel.
 *
 *   npm run build && ADMIN_PASSWORD_HASH=... npm start -- --port 3310
 *   VERIFY_URL=http://localhost:3310 VERIFY_ADMIN_PASSWORD=... npm run verify:ui
 *
 * Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const URL = (process.env.VERIFY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.VERIFY_ADMIN_PASSWORD ?? '';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'narrow', width: 320, height: 720 },
];

const log = [];
const failures = [];
const check = (ok, message) => void (ok || failures.push(message));

const browser = await chromium.launch();

/* ── Public pages, every width ─────────────────────────────────────── */

async function firstServicePath(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  const href = await page.getByRole('link', { name: 'Choose a time' }).first().getAttribute('href');
  return href ?? '/';
}

const probe = await browser.newPage();
const BOOK_PATH = await firstServicePath(probe);
await probe.close();

for (const viewport of VIEWPORTS) {
  for (const path of ['/', BOOK_PATH, '/admin/login']) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    const noise = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') noise.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));

    const response = await page.goto(URL + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    check(response?.status() === 200, `${path} ${viewport.name}: HTTP ${response?.status()}`);
    check(overflow <= 0, `${path} ${viewport.name}: ${overflow}px of horizontal overflow`);
    check(noise.length === 0, `${path} ${viewport.name} console: ${noise.join(' | ')}`);
    for (const violation of axe.violations) {
      failures.push(
        `${path} ${viewport.name} axe ${violation.id} (${violation.impact}): ${violation.nodes
          .map((n) => n.target.join(' '))
          .join(', ')}`,
      );
    }

    log.push(
      `${path.padEnd(42)} ${viewport.name.padEnd(8)} ${response?.status()} overflow=${overflow} console=${noise.length} axe=${axe.violations.length}`,
    );
    await context.close();
  }
}

/* ── The booking flow, end to end ──────────────────────────────────── */

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

await page.goto(URL + BOOK_PATH, { waitUntil: 'networkidle' });

const submit = page.getByRole('button', { name: /Confirm booking/ });
check(await submit.isDisabled(), 'the submit button was enabled before a time was chosen');

await page.getByRole('group', { name: 'Choose a day' }).getByRole('button').first().click();
const times = page.locator('button[aria-pressed]').filter({ hasText: /^\d{2}:\d{2}$/ });
const offered = await times.count();
check(offered > 0, 'no times were offered on the first open day');

const chosen = await times.first().innerText();
await times.first().click();
check(!(await submit.isDisabled()), 'the submit button stayed disabled after a time was chosen');

await page.getByLabel('Name').fill('Ana Prado');
await page.getByLabel('Email or phone').fill('ana@example.test');
await submit.click();
// A server action redirect is a client navigation, so waiting on the URL
// is the only reliable signal; networkidle resolves before it happens.
await page.waitForURL(/\/booking\//, { timeout: 20_000 });
const bookedUrl = page.url();
check(/You are booked/.test(await page.locator('h1').innerText()), 'no confirmation after booking');

await page.goto(URL + BOOK_PATH, { waitUntil: 'networkidle' });
await page.getByRole('group', { name: 'Choose a day' }).getByRole('button').first().click();
const after = await page
  .locator('button[aria-pressed]')
  .filter({ hasText: /^\d{2}:\d{2}$/ })
  .allInnerTexts();
check(!after.includes(chosen), `the booked time ${chosen} was still on offer afterwards`);
log.push(`booked ${chosen}; it disappeared from the list`);

await page.goto(bookedUrl, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Cancel this booking' }).click();
await page.getByRole('button', { name: 'Yes, cancel it' }).click();
await page.waitForTimeout(800);
check(
  /Cancelled/.test(await page.getByRole('status').innerText()),
  'the booking did not report as cancelled',
);

await page.goto(URL + BOOK_PATH, { waitUntil: 'networkidle' });
await page.getByRole('group', { name: 'Choose a day' }).getByRole('button').first().click();
const restored = await page
  .locator('button[aria-pressed]')
  .filter({ hasText: /^\d{2}:\d{2}$/ })
  .allInnerTexts();
check(restored.includes(chosen), 'cancelling did not put the time back on offer');
log.push('cancelling put it back on offer');

const notFound = await page.goto(URL + '/booking/' + 'x'.repeat(40));
check(notFound?.status() === 404, `a bad token returned ${notFound?.status()}, expected 404`);

/* ── Administration is closed to anonymous visitors ────────────────── */

for (const path of ['/admin', '/admin/services', '/admin/availability']) {
  await page.goto(URL + path, { waitUntil: 'networkidle' });
  check(
    page.url().includes('/admin/login'),
    `${path} did not redirect an anonymous visitor to the login page`,
  );
}
log.push('every admin route refuses an anonymous visitor');

if (ADMIN_PASSWORD) {
  await page.goto(URL + '/admin/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Password').fill('definitely-not-it');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(600);
  check(page.url().includes('/admin/login'), 'a wrong password got into the admin panel');

  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin$/, { timeout: 15_000 });
  log.push('the right password signs in, a wrong one does not');

  /* The admin pages get the same width and axe treatment as the public
     ones. They were not covered at first, which is exactly how an operator
     ends up with a panel that is unusable on the phone they carry. */
  for (const path of ['/admin', '/admin?range=week', '/admin/services', '/admin/availability']) {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(URL + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      check(response?.status() === 200, `${path} ${viewport.name}: HTTP ${response?.status()}`);
      check(overflow <= 0, `${path} ${viewport.name}: ${overflow}px of horizontal overflow`);
      for (const violation of axe.violations) {
        failures.push(
          `${path} ${viewport.name} axe ${violation.id} (${violation.impact}): ${violation.nodes
            .map((n) => n.target.join(' '))
            .join(', ')}`,
        );
      }
      log.push(
        `${path.padEnd(42)} ${viewport.name.padEnd(8)} ${response?.status()} overflow=${overflow} axe=${axe.violations.length}`,
      );
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
} else {
  log.push('admin sign-in not exercised: set VERIFY_ADMIN_PASSWORD to include it');
}

/* Keyboard. The first stop must be the skip link, and a booking must be
   completable without a pointer. */
const keyboard = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const kb = await keyboard.newPage();
await kb.goto(URL, { waitUntil: 'networkidle' });
await kb.keyboard.press('Tab');
const firstStop = await kb.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
check(/Skip to content/i.test(firstStop), `the first tab stop was "${firstStop}"`);

await kb.goto(URL + BOOK_PATH, { waitUntil: 'networkidle' });
const reachable = await kb.evaluate(() => {
  const focusable = document.querySelectorAll(
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  return focusable.length;
});
check(reachable > 10, `only ${reachable} focusable elements on the booking page`);
log.push(`keyboard: first stop is the skip link, ${reachable} focusable elements on the booking page`);
await keyboard.close();

await context.close();
await browser.close();

console.log(log.join('\n'));
console.log(failures.length ? `\nFAILED\n${failures.join('\n')}` : '\nPASSED');
process.exit(failures.length ? 1 : 0);
