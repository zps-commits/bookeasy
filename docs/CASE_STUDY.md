# BookEasy — case study

A booking application built as a portfolio piece. It describes a
demonstration: the business, the services and the people in it are invented,
and there are no users, no clients and no revenue. Every figure quoted here is
a verification result.

## The problem

Someone who sells time has a scheduling problem their customers can see. The
options are a messaging thread, where every booking is reconstructed by hand
and two people occasionally get the same slot, or a subscription platform
priced for a business several times their size.

The part that is genuinely hard is narrow: **never sell the same minute
twice**, including when two people press the button in the same second.

## The solution

One flow. Pick a service, pick who with, pick a day, pick a time, leave a name
and a contact. The confirmation lives at a URL addressed by a private token,
which is also how the booking is cancelled. No account, no password.

Behind it, an operator panel with the agenda, the services, the weekly opening
hours and one-off blocks.

## Architecture

See `ARCHITECTURE.md`. The short version: a pure availability engine, a
repository interface with two implementations, and three layers that each
refuse a double booking for different reasons.

## Technical decisions

**The concurrency guard is an exclusion constraint, not application code.**
Checking and then writing loses the race, because both requests read an empty
slot before either writes. PostgreSQL's `exclude using gist` over
`tstzrange` refuses the second insert. The application layer exists to turn
that refusal into a sentence a customer understands.

**The end time is derived server-side, never accepted from the caller.** A
request that supplied its own end could book ten hours for a ten-minute
service. The booking function reads the duration from the service row.

**Opening hours are minutes from midnight.** Storing an instant would mean a
business that opens at nine opens at eight after a daylight saving change.

**The cancellation token is stored only as a hash.** The raw token is shown
once. A copy of the table does not let anyone cancel anyone else's booking,
and a wrong token is indistinguishable from a booking that does not exist.

**Availability is read from a view with no customer data.** Anonymous visitors
must know a slot is taken; they must not learn who took it. There is no public
select policy on `bookings` at all.

**No default admin password.** Without Supabase and without
`ADMIN_DEMO_PASSWORD`, the panel does not exist rather than existing with
guessable credentials.

**The in-memory repository is the demo, not a mock.** The same code path runs
in tests and in the credential-free demonstration, so the demo cannot drift
from what is tested.

## Difficulties

**Daylight saving produced two defects, both caught by tests before anything
shipped.** On a spring-forward day, 02:00 does not exist and resolves to
03:00, which exists in its own right, so two wall-clock minutes produced the
same instant and the same start was offered twice. Separately, converting the
window edges to instants was not enough on its own; the candidate had to be
re-checked against those instants to catch a slot pushed outside its own
window.

**A responsive defect no unit test could reach.** The booking page overflowed
horizontally by 1178 pixels on a phone. A CSS grid item defaults to
`min-width: auto`, so the horizontally scrolling day strip pushed its column
wider than the screen instead of scrolling inside it. One `min-w-0`. The
browser verification found it on its first run.

**A redirect that looked broken and was not.** After submitting a booking the
test reported the URL unchanged, which looked like a failed redirect, while
the slot had clearly been consumed. The redirect from a server action is a
client navigation, and `networkidle` resolves before it happens. The test was
wrong, not the application. Worth stating plainly: a failing check is not
automatically a failing product.

**The scaffold's `cacheComponents` wants a static shell for every dynamic
route.** Every page here is per-request — availability changes the moment
someone books, and the booking page is addressed by a secret — so there is no
meaningful shell. It is switched off, with the reason in the config rather
than in someone's memory.

## Results

Measured on 2026-10-15. Verification results, not commercial ones.

| Check | Result |
|---|---|
| Unit tests | 72 passing |
| TypeScript, strict + `noUncheckedIndexedAccess` | passes |
| ESLint | passes |
| Build | passes |
| axe-core, WCAG 2.1 A + AA, at 1440 / 768 / 390 / 320 | 0 violations |
| Horizontal overflow | none |
| Booking flow in a browser | book, slot disappears, cancel, slot returns |
| Admin routes with no session | all redirect |
| Wrong admin password | refused |

**Verified against a real PostgreSQL database.** The project was later
migrated from Supabase to Neon and the schema applied to a live database.
The contract suite runs against it: eight cases, including three concurrent
bookings of one slot with exactly one accepted. That is the exclusion
constraint doing the thing the whole design rests on, and it is the one
rule with no meaningful in-memory equivalent.

| Check | Result |
|---|---|
| Unit and contract tests | 99 passing, 1 skipped |
| Contract suite against real PostgreSQL | 8 cases passing |
| Concurrent bookings of one slot | 3 attempted, 1 accepted |
| Exclusion constraint and btree_gist | present in the database |

**The remaining caveat is row level security.** PostgreSQL does not apply
it to a table's owner, and the default connection string is the owner. The
policies are written and applied but inert until the application connects
as the least-privilege role the migration prepares. That is stated in the
README and the architecture notes rather than glossed.

## The migration to Neon

Moving off Supabase turned out to be mostly a question about where a
security boundary lives, not about which SQL to write.

The audit found seventeen files mentioning Supabase and three that were
genuinely provider-specific; the rest were coupled to an import path. That
is the useful lesson about the repository pattern: it had already done its
job, and the remaining coupling was cosmetic.

Two migrations granted to `anon` and `authenticated`, which are Supabase's
roles. Making the schema file portable and moving the whole role model into
its own migration is what let the SQL apply to plain PostgreSQL.

Authentication moved from Supabase Auth to a PBKDF2 hash the deployment
stores, which is strictly better than what it replaced on one axis: the old
demo path kept a password in the environment in clear.

And the thing the migration finally made possible was the test that had
been missing all along. The concurrency guard could not be proven before,
because there was no database to prove it on.

## What I took from it

Putting the race condition in the database was the decision everything else
followed from. Once the constraint exists, the application layer stops trying
to be careful and starts trying to be clear: its job is the sentence the
customer reads, not the correctness of the write.

The second one: an in-memory implementation is worth more as the real
credential-free mode than as a test double. It cannot rot, because the demo
would break first.

## Next

- Email confirmation and reminders, which need a provider.
- Running the migrations against a real project, which is the one unverified
  layer.
- Recurring availability exceptions.
