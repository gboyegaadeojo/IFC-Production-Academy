-- The details box and the shorter phone line, looked up as a notification is written.
begin;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'ac000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'details-1@example.com', '{"display_name":"Fake Detailed"}', now(), now());

create temporary table ctx on commit drop as
select (select id from public.departments where kind = 'team' order by sort_order limit 1) as department_id;
insert into public.serving_roles (department_id, name) select department_id, 'Fake detail role' from ctx;
insert into public.events (organization_id, title, starts_at, ends_at)
values ((select id from public.organizations limit 1), 'Fake detail service', '2030-11-10T15:00:00Z', '2030-11-10T17:00:00Z');
insert into public.event_positions (event_id, department_id, role_id)
select e.id, (select department_id from ctx), r.id
from public.events e, public.serving_roles r
where e.title = 'Fake detail service' and r.name = 'Fake detail role';
insert into public.event_assignments (position_id, event_id, department_id, role_id, user_id, status, readiness, assigned_by)
select ep.id, ep.event_id, ep.department_id, ep.role_id, 'ac000000-0000-4000-8000-000000000001', 'confirmed',
       private.readiness_for('ac000000-0000-4000-8000-000000000001', ep.role_id), null
from public.event_positions ep join public.events e on e.id = ep.event_id
where e.title = 'Fake detail service';

select private.notify('ac000000-0000-4000-8000-000000000001', 'serving_reminder', 'Serving soon: Fake detail role',
  'Fake body', '/schedule',
  'serving_soon:' || (select id from public.event_assignments where user_id = 'ac000000-0000-4000-8000-000000000001'));

select is(
  (select details -> 1 ->> 'value' from public.notifications where user_id = 'ac000000-0000-4000-8000-000000000001'),
  'Fake detail role', 'a serving notification lists the role');
select is(
  (select details -> 2 ->> 'value' from public.notifications where user_id = 'ac000000-0000-4000-8000-000000000001'),
  'Fake detail service', 'and the service');
select is(
  (select details -> 0 ->> 'label' from public.notifications where user_id = 'ac000000-0000-4000-8000-000000000001'),
  'When', 'and when it is');
select ok(
  (select alert_body like '%Your SOPs are ready.' from public.notifications
   where user_id = 'ac000000-0000-4000-8000-000000000001'),
  'the phone gets a shorter line');

-- A moved service lists its new time, and a cancelled one says so.
select private.notify('ac000000-0000-4000-8000-000000000001', 'service_changed', 'Fake moved', 'Fake', '/schedule',
  'service_changed:' || (select id from public.events where title = 'Fake detail service') || ':test-moved');
select is(
  (select details -> 1 ->> 'label' from public.notifications where dedupe_key like 'service_changed:%:test-moved'),
  'New time', 'a moved service shows its new time');
update public.events set cancelled_at = now() where title = 'Fake detail service';
select private.notify('ac000000-0000-4000-8000-000000000001', 'service_changed', 'Fake cancelled', 'Fake', '/schedule',
  'service_changed:' || (select id from public.events where title = 'Fake detail service') || ':test-cancelled');
select is(
  (select alert_body from public.notifications where dedupe_key like 'service_changed:%:test-cancelled'),
  'It''s cancelled.', 'a cancelled service says so on the phone');

-- Anything it can't look up still gets written, without details.
select private.notify('ac000000-0000-4000-8000-000000000001', 'learning_nudge', 'Fake', 'Fake', '/home', 'no-details-here');
select is(
  (select details from public.notifications where dedupe_key = 'no-details-here'),
  '[]'::jsonb, 'no details when there''s nothing to look up');
select is(
  (select alert_body from public.notifications where dedupe_key = 'no-details-here'),
  null, 'and the phone uses the message');

select * from finish();
rollback;
