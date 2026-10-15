-- BookEasy schema.
--
-- Two things in here carry the weight of the product:
--
--   1. The exclusion constraint on bookings. Checking for a clash in
--      application code loses the race between two people pressing "book"
--      at the same moment, because both read an empty slot before either
--      writes. The database is the only place that can refuse the second
--      write, so that is where the rule lives.
--
--   2. A public view over bookings that exposes only the busy interval.
--      Computing availability needs to know when a professional is taken;
--      it does not need the customer's name or contact, and no anonymous
--      client should ever be able to read those.

create extension if not exists btree_gist;

-- ── Services ────────────────────────────────────────────────────────────

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  description text check (length(description) <= 600),
  -- Duration in whole minutes. Slot arithmetic is integer arithmetic.
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  -- Money as integer cents, never a float.
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'BRL' check (currency in ('BRL', 'USD')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists service_professionals (
  service_id uuid not null references services (id) on delete cascade,
  professional_id uuid not null references professionals (id) on delete cascade,
  primary key (service_id, professional_id)
);

-- ── When work happens ───────────────────────────────────────────────────

-- Opening hours as minutes from midnight, in the business timezone. Storing
-- a clock time rather than a timestamp is what keeps "we open at nine"
-- true across a daylight saving change.
create table if not exists business_hours (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_minute integer not null check (opens_minute between 0 and 1440),
  closes_minute integer not null check (closes_minute between 0 and 1440),
  constraint business_hours_ordered check (closes_minute > opens_minute),
  unique (professional_id, weekday, opens_minute)
);

create table if not exists availability_blocks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (length(reason) <= 200),
  constraint availability_blocks_ordered check (ends_at > starts_at)
);

create index if not exists availability_blocks_lookup
  on availability_blocks (professional_id, starts_at, ends_at);

-- ── Bookings ────────────────────────────────────────────────────────────

do $$ begin
  create type booking_status as enum ('confirmed', 'cancelled', 'completed', 'no_show');
exception when duplicate_object then null;
end $$;

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete restrict,
  professional_id uuid not null references professionals (id) on delete restrict,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_contact text not null check (length(trim(customer_contact)) between 3 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status booking_status not null default 'confirmed',
  -- A hash. The raw token goes to the customer once and is never stored,
  -- so a leaked table does not let anyone cancel anyone else's booking.
  cancellation_token_hash text not null unique,
  created_at timestamptz not null default now(),
  constraint bookings_ordered check (ends_at > starts_at)
);

create index if not exists bookings_lookup
  on bookings (professional_id, starts_at, ends_at)
  where status = 'confirmed';

-- The race condition guard. Two confirmed bookings for one professional
-- cannot overlap, and the second concurrent insert fails at the database
-- rather than being accepted because it read a stale view of the calendar.
alter table bookings drop constraint if exists bookings_no_overlap;
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed');

-- ── What the public may read ────────────────────────────────────────────

-- Busy intervals with no customer attached. This is the only thing an
-- anonymous visitor needs in order to see which slots are taken.
create or replace view public_busy_intervals
with (security_invoker = true) as
  select professional_id, starts_at, ends_at
  from bookings
  where status = 'confirmed';

-- ── Row level security ──────────────────────────────────────────────────

alter table services enable row level security;
alter table professionals enable row level security;
alter table service_professionals enable row level security;
alter table business_hours enable row level security;
alter table availability_blocks enable row level security;
alter table bookings enable row level security;

-- Anonymous visitors read the catalogue and the calendar shape.
drop policy if exists services_public_read on services;
create policy services_public_read on services
  for select using (active = true);

drop policy if exists professionals_public_read on professionals;
create policy professionals_public_read on professionals
  for select using (active = true);

drop policy if exists service_professionals_public_read on service_professionals;
create policy service_professionals_public_read on service_professionals
  for select using (true);

drop policy if exists business_hours_public_read on business_hours;
create policy business_hours_public_read on business_hours
  for select using (true);

drop policy if exists availability_blocks_public_read on availability_blocks;
create policy availability_blocks_public_read on availability_blocks
  for select using (true);

-- Bookings are never readable by an anonymous client. There is deliberately
-- no public select policy: the busy view above is the only exposure, and
-- booking and cancelling both go through security definer functions.
drop policy if exists bookings_admin_all on bookings;
create policy bookings_admin_all on bookings
  for all to authenticated using (true) with check (true);

-- Administration writes to everything, and only when signed in.
drop policy if exists services_admin_write on services;
create policy services_admin_write on services
  for all to authenticated using (true) with check (true);

drop policy if exists professionals_admin_write on professionals;
create policy professionals_admin_write on professionals
  for all to authenticated using (true) with check (true);

drop policy if exists business_hours_admin_write on business_hours;
create policy business_hours_admin_write on business_hours
  for all to authenticated using (true) with check (true);

drop policy if exists availability_blocks_admin_write on availability_blocks;
create policy availability_blocks_admin_write on availability_blocks
  for all to authenticated using (true) with check (true);
