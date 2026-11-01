-- Service types and calendars (decision record 9, stage 1).
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_id::text || '@example.com', jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Test people (all fake):
--   Scheduler   a3000000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Volunteer   a3000000-0000-4000-8000-000000000002  (Camera member, on the position team)
--   Other       a3000000-0000-4000-8000-000000000003  (Camera member, not scheduled)
select pg_temp.new_user('a3000000-0000-4000-8000-000000000001', 'Test Scheduler');
select pg_temp.new_user('a3000000-0000-4000-8000-000000000002', 'Test Volunteer');
select pg_temp.new_user('a3000000-0000-4000-8000-000000000003', 'Test Other');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a3000000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a3000000-0000-4000-8000-000000000002', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a3000000-0000-4000-8000-000000000003', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Camera A'),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Camera B');
insert into ctx values
  ('camA', (select id from public.serving_roles where name = 'Fake Camera A')),
  ('camB', (select id from public.serving_roles where name = 'Fake Camera B'));
insert into public.serving_team_members (role_id, department_id, user_id) values
  ((select id from ctx where key = 'camA'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a3000000-0000-4000-8000-000000000002');

-- Volunteers can't set up services.
select pg_temp.act_as('a3000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.save_service_type(null, 'Nope', '10:00', 60, '', '') $$,
  '42501', 'not_authorized', 'volunteers cannot add service types'
);
reset role;

-- The scheduler sets up a service type with positions and makes dates.
select pg_temp.act_as('a3000000-0000-4000-8000-000000000001');
insert into ctx values ('type', public.save_service_type(null, 'Fake Sunday service', '10:05', 105, 'Main room', ''));
select throws_ok(
  $$ select public.save_service_type(null, ' fake sunday SERVICE ', '09:00', 60, '', '') $$,
  'P0001', 'duplicate_name', 'service type names are unique'
);
select lives_ok(
  $$ select public.set_service_type_positions((select id from ctx where key = 'type'),
       array[(select id from ctx where key = 'camA'), (select id from ctx where key = 'camB'), (select id from ctx where key = 'camB')]) $$,
  'positions are set, and a role can be needed twice'
);
select is(
  public.create_services((select id from ctx where key = 'type'),
    array[current_date + 7, current_date + 14, current_date - 7]),
  2, 'two future services are made; a past date is skipped'
);
select is(
  public.create_services((select id from ctx where key = 'type'), array[current_date + 7, current_date + 21]),
  1, 'dates that already have the service are skipped'
);
reset role;

select is(
  (select count(*)::int from public.events where service_type_id = (select id from ctx where key = 'type')),
  3, 'three services in all'
);
select is(
  (select count(*)::int from public.event_positions p
     join public.events e on e.id = p.event_id
    where e.service_type_id = (select id from ctx where key = 'type')),
  9, 'each service gets every position'
);
select is(
  (select to_char(starts_at at time zone 'America/Winnipeg', 'HH24:MI') from public.events
    where service_type_id = (select id from ctx where key = 'type') order by starts_at limit 1),
  '10:05', 'services start at the usual Winnipeg time'
);
select ok(
  exists (select 1 from public.audit_events where action = 'service_type.created'),
  'service types are audited'
);

-- The team view: the person scheduled sees who's serving with them; others don't.
select pg_temp.act_as('a3000000-0000-4000-8000-000000000001');
insert into ctx values ('event', (select id from public.events
  where service_type_id = (select id from ctx where key = 'type') order by starts_at limit 1));
select public.assign_to_position(
  (select p.id from public.event_positions p where p.event_id = (select id from ctx where key = 'event')
     and p.role_id = (select id from ctx where key = 'camA')),
  'a3000000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.event_team((select id from ctx where key = 'event'))),
  3, 'the scheduler sees every position at the service'
);
reset role;

select pg_temp.act_as('a3000000-0000-4000-8000-000000000002');
select is(
  (select display_name from public.event_team((select id from ctx where key = 'event'))
    where user_id is not null),
  'Test Volunteer', 'someone scheduled sees who is serving'
);
reset role;

select pg_temp.act_as('a3000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select * from public.event_team((select id from ctx where key = 'event')) $$,
  '42501', 'not_authorized', 'someone not scheduled there does not'
);
reset role;

-- Archiving hides the type; its services stay.
select pg_temp.act_as('a3000000-0000-4000-8000-000000000001');
select public.archive_service_type((select id from ctx where key = 'type'));
select throws_ok(
  $$ select public.create_services((select id from ctx where key = 'type'), array[current_date + 28]) $$,
  '42501', 'not_authorized', 'an archived type makes no new services'
);
reset role;
select is(
  (select count(*)::int from public.events where service_type_id = (select id from ctx where key = 'type')),
  3, 'and its services stay'
);

select * from finish();
rollback;
