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
Neon (Lakebase PostgreSQL) · Zod · date-fns · Vitest · Playwright + axe-core.

### Why Neon

The application needs one thing from a database that is not negotiable: an
exclusion constraint over a time range, which is what refuses the second of
two concurrent bookings. That is ordinary PostgreSQL, so the question was
only which PostgreSQL.

Neon gives a connection string and nothing else to learn. There is no
client library in the browser, no bespoke auth layer to adopt and no
policy language specific to one vendor — the schema is portable SQL and the
driver is a driver. It also branches, so a schema change can be tried on a
copy of the data rather than on the data.

The practical consequence is that the browser never holds a database
credential at all, which is a smaller attack surface than a public anon key
with row level security behind it.

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

## Why there is no public demonstration

Deployed to a serverless host with no database, this application does not
work, and it is worth saying exactly why rather than shipping a link that
half functions.

Demonstration mode keeps bookings in the server's memory. A serverless
host runs no single long-lived server: the request that creates a booking
and the request that then shows its confirmation can be handled by
different instances, and the second one has never heard of the first. The
committed browser check catches it — the same build passes locally in
demonstration mode and fails against the deployment with "no confirmation
after booking".

The fix is a real database, not a workaround. Run it locally with
PostgreSQL, or point a deployment at one.

## Configuration

Copy `.env.example` to `.env.local`.

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Running against a real database. Server side only — it has no `NEXT_PUBLIC_` prefix for that reason, and the browser never sees it |
| `ADMIN_PASSWORD_HASH` | The admin panel. A PBKDF2 hash, never a password |
| `NEXT_PUBLIC_BOOKING_TIMEZONE` | The zone every availability calculation resolves in. Defaults to `America/Recife` |

### Getting DATABASE_URL from Neon

```bash
npm i -g neon
neon login
neon init -y --org-id <org> --project-id <project> --branch production --services postgres
neon env pull        # writes DATABASE_URL into .env.local
```

Use the **pooled** `DATABASE_URL` for application traffic.
`DATABASE_URL_UNPOOLED` is also pulled and is for tools that need a direct
session.

### Setting the admin password

```bash
node scripts/hash-password.mjs 'the password you chose'
```

Paste the printed `ADMIN_PASSWORD_HASH` into the environment. The password
itself is written nowhere.

**There is no default admin password.** Without `ADMIN_PASSWORD_HASH` the
panel does not exist: every admin route redirects and the login page says
how to generate one.

## The database

Migrations are in `db/migrations`, demonstration data in `db/seed.sql`.

```bash
npm run db:migrate -- --dry   # show what would run
npm run db:migrate            # apply it
npm run db:seed               # load the demonstration catalogue
```

The runner records each file in `schema_migrations` and wraps it in a
transaction, so a second run is a no-op and a failure half way leaves
nothing behind. It uses the Neon driver rather than `psql`, which is not
installed everywhere.

What the schema does that matters:

- **An exclusion constraint** on `bookings` refuses two overlapping confirmed
  bookings for one professional. This is the concurrency guard.
- **No public select on `bookings`.** Availability reads a security definer
  function that returns the busy interval and nothing else — no name, no
  contact.
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
| `npm test` | 99 passing, 1 skipped |
| `npm run typecheck` | passes, `strict` and `noUncheckedIndexedAccess` |
| `npm run lint` | passes |
| `npm run build` | passes |
| axe-core, WCAG 2.1 A + AA, at 1440 / 768 / 390 / 320 | 0 violations |
| Horizontal overflow at those widths | none |
| Booking flow, end to end, in a browser | book, slot disappears, cancel, slot returns |
| Admin routes without a session | all redirect to the login page |

| Contract suite against real PostgreSQL | 8 cases passing, including three concurrent bookings of one slot |
| Exclusion constraint, btree_gist, the four functions | present in the database |
| Booking flow against Neon, in a browser | book, slot disappears, cancel, slot returns |

**The schema has been applied to a real Neon database and the concurrency
guard verified there.** Three simultaneous bookings of the same slot, one
accepted: that is the exclusion constraint doing its job, and it is the one
rule with no meaningful in-memory equivalent.

**What row level security does and does not do here.** The policies are
written against an `app.is_admin` session flag and a least-privilege
`bookeasy_app` role. If `DATABASE_URL` points at the project's owner role,
PostgreSQL does not apply row level security to it, so the policies are
inert and privacy rests on the server code and the security definer
functions. Create the application role and point the connection string at
it to make them bite. This is stated rather than glossed because "RLS is
enabled" is not the same as "RLS is protecting you".

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
