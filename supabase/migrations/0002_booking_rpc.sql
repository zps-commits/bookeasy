-- Booking and cancellation as database functions.
--
-- Both run as security definer because an anonymous client must be able to
-- create and cancel its own booking without ever being granted select on
-- the bookings table. The functions return only what the caller is entitled
-- to see.

-- Creates a booking, or fails. The exclusion constraint does the refusing:
-- a clash raises, and this turns that into a value the caller can act on
-- rather than an unhandled error.
create or replace function create_booking(
  p_service_id uuid,
  p_professional_id uuid,
  p_customer_name text,
  p_customer_contact text,
  p_starts_at timestamptz,
  p_token_hash text
) returns table (booking_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration integer;
  v_ends_at timestamptz;
  v_id uuid;
begin
  select duration_minutes into v_duration
  from services where id = p_service_id and active = true;

  if v_duration is null then
    raise exception 'service_unavailable' using errcode = 'P0001';
  end if;

  -- The end is derived here, never taken from the client. A caller that
  -- sent its own end time could book a ten-hour slot for a ten-minute cut.
  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  if p_starts_at < now() then
    raise exception 'in_the_past' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from availability_blocks b
    where b.professional_id = p_professional_id
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;

  insert into bookings (
    service_id, professional_id, customer_name, customer_contact,
    starts_at, ends_at, cancellation_token_hash
  ) values (
    p_service_id, p_professional_id, trim(p_customer_name), trim(p_customer_contact),
    p_starts_at, v_ends_at, p_token_hash
  ) returning id into v_id;

  return query select v_id, p_starts_at, v_ends_at;
exception
  when exclusion_violation then
    raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

-- Cancels by token hash. Returns the number of rows affected, so a wrong
-- token is indistinguishable from a booking that does not exist: neither
-- confirms whether an id is real.
create or replace function cancel_booking(p_token_hash text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update bookings
     set status = 'cancelled'
   where cancellation_token_hash = p_token_hash
     and status = 'confirmed'
     and starts_at > now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function create_booking(uuid, uuid, text, text, timestamptz, text) from public;
grant execute on function create_booking(uuid, uuid, text, text, timestamptz, text) to anon, authenticated;

revoke all on function cancel_booking(text) from public;
grant execute on function cancel_booking(text) to anon, authenticated;
