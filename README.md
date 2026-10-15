# BookEasy

Online booking for people who work by appointment: consultants, teachers,
barbers, anyone whose day is a calendar. A customer picks a service, picks a
time that is genuinely free, and gets a private link to view or cancel it.
There is no account to create.

## The problem

A booking tool has one job that is harder than it looks: never sell the same
minute twice. Everything else is a form.

The naive version checks for a clash in application code and then writes. That
loses the race between two people pressing the button in the same second,
because both read an empty slot before either writes. It also trusts the
browser's idea of what is free, which is stale the moment it is rendered and
editable by anyone who opens the network tab.

## How it answers that

Three layers, deliberately overlapping:

1. **The browser** shows only slots the server computed.
2. **The server** recomputes availability from storage on submit, ignoring what
   the browser believed.
3. **The database** refuses an overlapping insert with an exclusion constraint,
   which is the only layer that can win the race.

The third is the one that matters. The first two are for giving the customer a
sensible answer rather than an error.

## Features

**For the customer**
- A catalogue of services with duration and price
- A choice of professional when more than one offers the service
- Availability by day, computed against opening hours, blocks and existing bookings
- Booking without an account
- A private link to view the booking, and to cancel it

**For the operator**
- A password-protected panel with a day and week agenda
- Status per booking: confirmed, cancelled, completed, no show
- Services: name, description, duration, price, currency, offered or hidden
- Weekly opening hours per person, and one-off blocked periods

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 ·
Supabase (PostgreSQL + Auth) · Zod · date-fns · Vitest · Playwright + axe-core.

## Running it

```bash
npm install
npm run dev
```

It runs with **no configuration at all**, backed by an in-memory repository
holding demonstration data. The interface says so in a banner, because a demo
that looks connected to a database it is not connected to is a lie.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Build |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint |
| `npm run verify:ui` | Browser verification — see below |

## Configuration

Copy `.env.example` to `.env.local`.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Running against a real database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The same |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side administration. Never expose it to the browser |
| `NEXT_PUBLIC_BOOKING_TIMEZONE` | The zone every availability calculation resolves in. Defaults to `America/Recife` |
| `ADMIN_DEMO_PASSWORD` | The admin panel without Supabase. At least eight characters |

**There is no default admin password.** With neither Supabase nor
`ADMIN_DEMO_PASSWORD` set, the panel does not exist: every admin route
redirects, and the login page explains why.

## The database

Migrations are in `supabase/migrations`, demonstration data in
`supabase/seed.sql`. Apply them with the Supabase CLI:

```bash
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

What the schema does that matters:

- **An exclusion constraint** on `bookings` refuses two overlapping confirmed
  bookings for one professional. This is the concurrency guard.
- **No public select on `bookings`.** Availability reads a view that exposes
  the busy interval and nothing else — no name, no contact.
- **Booking and cancellation are security definer functions**, so an anonymous
  client never needs select on the table. The end time is derived inside the
  function from the service duration, never taken from the caller.
- **The cancellation token is stored as a hash.** The raw token goes to the
  customer once. A leaked table does not let anyone cancel anyone else's
  booking.
- **Opening hours are minutes from midnight**, not timestamps, so an opening
  time survives a daylight saving change.

## Testing

```bash
npm test
```

Browser verification runs against a server that is already up:

```bash
npm run build
ADMIN_DEMO_PASSWORD=some-long-password npm start -- --port 3310
VERIFY_URL=http://localhost:3310 VERIFY_ADMIN_PASSWORD=some-long-password npm run verify:ui
```

## Deploy

A standard Next.js deployment. Set the environment variables above on the
host, apply the migrations to the Supabase project, and point
`NEXT_PUBLIC_BOOKING_TIMEZONE` at the business's zone.

## What is verified, and what is not

Measured on 2026-10-15:

| Check | Result |
|---|---|
| `npm test` | 72 passing |
| `npm run typecheck` | passes, `strict` and `noUncheckedIndexedAccess` |
| `npm run lint` | passes |
| `npm run build` | passes |
| axe-core, WCAG 2.1 A + AA, at 1440 / 768 / 390 / 320 | 0 violations |
| Horizontal overflow at those widths | none |
| Booking flow, end to end, in a browser | book, slot disappears, cancel, slot returns |
| Admin routes without a session | all redirect to the login page |

**Not verified against a live Supabase project.** No credentials were available
in the environment this was built in, so the SQL, the row level security
policies and the exclusion constraint are written and reviewed but have not
been executed against a real database. Everything that was exercised ran
against the in-memory repository, which reproduces the same two rules in
TypeScript. Treat the migrations as unrun until you run them.

Also not verified: real iOS and Android hardware, and screen reader software.

## Limitations

- No email or SMS. The booking is confirmed on screen and by the link; nothing
  is sent anywhere.
- No payment, and nothing that simulates one.
- No recurring appointments, no waiting list, no group bookings.
- One business per deployment.
- The demonstration data is invented. No real person, business or contact
  detail appears anywhere.

## Future work

- Email confirmation and reminders, which need a mail provider.
- Recurring availability exceptions, such as a different Friday every fortnight.
- A customer-facing list of past appointments, which needs accounts.
- Rate limiting on the public booking endpoint, which needs an edge store.
