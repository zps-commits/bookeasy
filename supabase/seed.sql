-- Demonstration data. Every name here is invented; none of it describes a
-- real business, and no real contact detail appears anywhere.

insert into professionals (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Alex Moreira'),
  ('22222222-2222-2222-2222-222222222222', 'Rita Canuto')
on conflict (id) do nothing;

insert into services (id, name, description, duration_minutes, price_cents, currency) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Strategy consultation', 'A focused hour on one problem, with written notes afterwards.', 60, 35000, 'BRL'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Follow-up session', 'A shorter check-in for work already under way.', 30, 18000, 'BRL'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Full review', 'A long session covering a whole project end to end.', 120, 62000, 'BRL')
on conflict (id) do nothing;

insert into service_professionals (service_id, professional_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

-- Monday to Friday, 09:00 to 18:00, with a break from 12:00 to 13:00
-- expressed as two windows rather than one window and a hole.
insert into business_hours (professional_id, weekday, opens_minute, closes_minute)
select p.id, d.weekday, w.opens, w.closes
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid),
  ('22222222-2222-2222-2222-222222222222'::uuid)
) as p(id)
cross join (values (1), (2), (3), (4), (5)) as d(weekday)
cross join (values (540, 720), (780, 1080)) as w(opens, closes)
on conflict do nothing;
