-- Reminder days (plan "Academy scheduling", PR 5): a service type's reminder carries to the services
-- made from it, each service can change its own, and "Serving soon" goes that many days before.
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_email, jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

update public.organizations set scheduling_source = 'academy';

-- Test people (all fake):
--   Lead   a7700000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Ada    a7700000-0000-4000-8000-000000000002  camera team
select pg_temp.new_user('a7700000-0000-4000-8000-000000000001', 'Test Reminder Lead', 'lead.reminder@example.com');
select pg_temp.new_user('a7700000-0000-4000-8000-000000000002', 'Test Ada Reminder', 'ada.reminder@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7700000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake reminder camera');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake reminder camera'));
insert into public.department_memberships (department_id, user_id, status, decided_at)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7700000-0000-4000-8000-000000000002', 'active', now())
on conflict do nothing;
insert into public.serving_team_members (role_id, department_id, user_id)
values ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7700000-0000-4000-8000-000000000002');

-- A service type that reminds three days before.
select pg_temp.act_as('a7700000-0000-4000-8000-000000000001');
insert into ctx values ('type', public.save_service_type(null, 'Fake Reminder Sunday', '10:30', 90, '', ''));
select lives_ok($$ select public.set_service_type_reminder((select id from ctx where key = 'type'), 3) $$,
  'a scheduler sets the reminder for a service type');
select throws_ok($$ select public.set_service_type_reminder((select id from ctx where key = 'type'), 8) $$,
  '22023', 'invalid_days', 'only 1 to 7 days');
select public.create_services((select id from ctx where key = 'type'), array[current_date + 30]);
reset role;
select is(
  (select reminder_days from public.events where service_type_id = (select id from ctx where key = 'type')),
  3, 'services made from it take its reminder');

select pg_temp.act_as('a7700000-0000-4000-8000-000000000002');
select throws_ok($$ select public.set_service_type_reminder((select id from ctx where key = 'type'), 1) $$,
  '42501', 'not_authorized', 'volunteers cannot change it');
reset role;

-- A one-off service three days away, which Ada has accepted.
select pg_temp.act_as('a7700000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at) values ('Fake reminder service',
  ((((now() at time zone 'America/Winnipeg')::date + 3) + time '10:30') at time zone 'America/Winnipeg'),
  ((((now() at time zone 'America/Winnipeg')::date + 3) + time '12:00') at time zone 'America/Winnipeg'));
insert into ctx values ('event', (select id from public.events where title = 'Fake reminder service'));
insert into ctx values
  ('place', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam')));
select public.assign_to_position((select id from ctx where key = 'place'), 'a7700000-0000-4000-8000-000000000002');
select public.send_assignment_requests((select id from ctx where key = 'event'),
  array(select id from public.event_assignments where position_id = (select id from ctx where key = 'place')), null);
reset role;
select pg_temp.act_as('a7700000-0000-4000-8000-000000000002');
select public.respond_to_assignment((select id from public.event_assignments
  where position_id = (select id from ctx where key = 'place')), 'confirmed');
reset role;
update public.event_assignments set assigned_at = now() - interval '5 days'
 where position_id = (select id from ctx where key = 'place');

create function pg_temp.serving_soon() returns integer language sql as $$
  select count(*)::int from public.notifications
  where user_id = 'a7700000-0000-4000-8000-000000000002' and title like 'Serving soon:%';
$$;

-- Two days before (the default) is still to come.
select is((select reminder_days from public.events where id = (select id from ctx where key = 'event')), 2,
  'a one-off service reminds two days before unless changed');
select public.queue_reminders();
select is(pg_temp.serving_soon(), 0, 'so nothing is sent three days before');

-- The scheduler changes this service to four days before: that moment has passed, so it goes.
select pg_temp.act_as('a7700000-0000-4000-8000-000000000001');
update public.events set reminder_days = 4 where id = (select id from ctx where key = 'event');
reset role;
select public.queue_reminders();
select is(pg_temp.serving_soon(), 1, 'a service set to four days before reminds now');
select public.queue_reminders();
select is(pg_temp.serving_soon(), 1, 'and only once');

select throws_ok(
  $$ update public.events set reminder_days = 0 where id = (select id from ctx where key = 'event') $$,
  '23514', null, 'a service reminds 1 to 7 days before');

select * from finish();
rollback;
