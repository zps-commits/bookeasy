# Architecture

## The shape

```
src/
  app/
    page.tsx                 Catalogue
    book/[serviceId]/        Availability and the booking form
    booking/[token]/         Confirmation and cancellation, addressed by a secret
    admin/                   Agenda, services, availability. Guarded.
    actions.ts               Public server actions
  components/
    booking/                 BookingFlow, CancelBooking
    admin/                   LoginForm, ServiceForm, BlockForm
  domain/
    availability/            The slot engine. Pure.
    bookings/                Orchestration and cancellation tokens
    services/                Catalogue queries and fault detection
  lib/
    db/                      Repository interface, selector, providers/
    auth/                    Session and the single authorisation guard
    dates/                   Timezone conversion, in one place
    validation/              Zod schemas
  types/                     The shapes
supabase/
  migrations/                Schema, constraints, policies, functions
  seed.sql                   Demonstration data
```

## The rule the structure enforces

**No business rule lives in a component.** The slot engine takes plain data
and returns slots; it imports nothing from React, reads no clock of its own,
and talks to no database. That is what makes it testable in microseconds and
what let a daylight saving defect surface in a unit test rather than in front
of a customer.

## Three layers that each refuse a double booking

| Layer | What it does | What it cannot do |
|---|---|---|
| Browser | Renders the slots the server computed | Be trusted. It is stale on arrival and editable |
| Server | Recomputes availability from storage on submit | Win a race. Two requests can both pass it |
| Database | Exclusion constraint on overlapping confirmed bookings | Explain itself in words a customer understands |

The database is the only one that can refuse the second concurrent write. The
server layer exists so the customer gets "someone just took that time" instead
of a constraint violation.

## Storage behind one interface

`BookingRepository` is the whole surface. Two implementations satisfy it:

- **`neonRepository`** — PostgreSQL over the Neon driver. Writes bookings
  through security definer functions, reads availability from one that
  carries no customer data, and runs administrative statements inside a
  transaction that sets `app.is_admin` with `set local`, after the
  application's own authorisation check has passed.
- **`memoryRepository`** — what the application runs on with no credentials.
  Not a test mock: the demo and the test suite exercise the same code path,
  and it reproduces the same two invariants the database enforces, because a
  demonstration that accepts a double booking is not demonstrating the product.

Which one is used is decided once, by whether `DATABASE_URL` is set.

## Time

Opening hours are a weekday and a minute from midnight — a wall-clock fact. A
business that opens at nine opens at nine on both sides of a daylight saving
change, and a stored instant does not survive that.

Converting a wall-clock time to an instant is the only operation that needs
the timezone, and it lives in `lib/dates/zone.ts`. Two consequences the tests
pin down:

- On a spring-forward day two different wall-clock minutes can resolve to the
  same instant, so starts are deduplicated by instant.
- A candidate slot is re-checked against the window's own instants rather than
  against minute arithmetic, which catches a slot pushed outside its window by
  an offset change.

## Authorisation

One function, `requireAdmin`, called first by every admin route. Not a
per-route permission list: those eventually grow a route that forgets to
check, and that route is the whole problem.

Two modes, no default credential in either. Supabase Auth when configured;
otherwise an HMAC-signed httpOnly cookie gated on `ADMIN_DEMO_PASSWORD`, and
if that is unset the panel does not exist.

## Privacy

- Bookings have no public select policy.
- Availability reads a view of busy intervals: professional, start, end.
- The confirmation page is addressed by a token; a wrong token and a
  nonexistent booking both 404, so it cannot be used to probe for valid ids.
- The route is `noindex`.
- Only the hash of the cancellation token is stored.


## Why Neon, and what changed with it

The database has to support an exclusion constraint over a time range. That
is ordinary PostgreSQL, so the only question was which PostgreSQL. Neon
gives a connection string and nothing else to learn: portable SQL, an
ordinary driver, no vendor policy language, and branches so a schema change
can be tried on a copy of the data.

**The security boundary moved, and that is the substantive change.** Under
Supabase the browser held an anon key and spoke to PostgREST, so row level
security was the wall between a visitor and the bookings table. With a
direct connection the browser holds no credential and never reaches the
database, so that wall is now the server process.

The policies were not deleted on that basis. "The server is the only
client" is an assumption, and an assumption is not an enforcement. They
were rewritten against a least-privilege `bookeasy_app` role and an
`app.is_admin` session flag that only the server sets.

**One honest limit.** PostgreSQL does not apply row level security to a
table's owner. If `DATABASE_URL` points at the project's owner role — which
is what `neon env pull` gives you by default — the policies are inert, and
privacy rests on the server code plus the security definer functions.
Create `bookeasy_app`, grant it what `0003` grants, and point the
connection string at it to make the policies bite. "RLS is enabled" is not
the same sentence as "RLS is protecting you".
