-- Adapting the access model from Supabase to a direct PostgreSQL connection.
--
-- Under Supabase the browser held an anon key and talked to PostgREST, so
-- row level security was the boundary between a visitor and the bookings
-- table. With a direct connection that boundary moves: the browser never
-- sees a connection string and never speaks to the database at all.
--
-- The policies are not removed, because "the server is the only client" is
-- an assumption rather than an enforcement. They are rewritten against a
-- least-privilege application role and a session flag that only the server
-- can set, so a bug that reads bookings on a public path still fails.

-- ── The application role ────────────────────────────────────────────────
-- Create this once, with a password you choose, and point DATABASE_URL at
-- it. It is deliberately not the owner, so it does not bypass RLS.
--
--   create role bookeasy_app with login password '...';
--
-- Then:

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'bookeasy_app') then
    grant usage on schema public to bookeasy_app;
    grant select on services, professionals, service_professionals,
      business_hours, availability_blocks, public_busy_intervals to bookeasy_app;
    grant select, insert, update on bookings to bookeasy_app;
    grant insert, update, delete on services, availability_blocks to bookeasy_app;
    grant execute on all functions in schema public to bookeasy_app;
  end if;
end $$;

-- ── Policies, rewritten for the session flag ────────────────────────────
-- app.is_admin is set with `set local` inside a transaction by the server,
-- and only after its own authorisation check has passed. A statement run
-- outside such a transaction gets the public view of the data.

create or replace function is_admin() returns boolean
language sql stable
as $$ select coalesce(current_setting('app.is_admin', true), 'false') = 'true' $$;

drop policy if exists services_public_read on services;
create policy services_public_read on services
  for select using (active = true or is_admin());

drop policy if exists services_admin_write on services;
create policy services_admin_write on services
  for all using (is_admin()) with check (is_admin());

drop policy if exists professionals_public_read on professionals;
create policy professionals_public_read on professionals
  for select using (active = true or is_admin());

drop policy if exists professionals_admin_write on professionals;
create policy professionals_admin_write on professionals
  for all using (is_admin()) with check (is_admin());

drop policy if exists business_hours_admin_write on business_hours;
create policy business_hours_admin_write on business_hours
  for all using (is_admin()) with check (is_admin());

drop policy if exists availability_blocks_admin_write on availability_blocks;
create policy availability_blocks_admin_write on availability_blocks
  for all using (is_admin()) with check (is_admin());

-- Bookings stay unreadable unless the caller is an administrator. Everything
-- a visitor needs still comes from the busy view or the token function,
-- both of which are security definer and return no one else's data.
drop policy if exists bookings_admin_all on bookings;
create policy bookings_admin_read on bookings
  for select using (is_admin());
create policy bookings_admin_write on bookings
  for all using (is_admin()) with check (is_admin());

-- The busy view runs as its caller, so it would be empty for a
-- non-administrator once the policy above applies. It becomes a security
-- definer function instead: the interval, and nothing else.
drop view if exists public_busy_intervals;

create or replace function busy_intervals(p_from timestamptz, p_to timestamptz)
returns table (professional_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select b.professional_id, b.starts_at, b.ends_at
  from bookings b
  where b.status = 'confirmed'
    and b.starts_at < p_to
    and b.ends_at > p_from;
$$;

revoke all on function busy_intervals(timestamptz, timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'bookeasy_app') then
    grant execute on function busy_intervals(timestamptz, timestamptz) to bookeasy_app;
  end if;
end $$;

-- The exclusion constraint is untouched. It is the only thing that can
-- refuse the second of two concurrent bookings, and nothing about changing
-- provider changes that.
