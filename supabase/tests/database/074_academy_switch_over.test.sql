-- Switching who schedules copies what's coming up from Planning Center, and switching back hands
-- it back without a second copy (plan "Academy scheduling", PR 2).
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
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

update public.organizations set scheduling_source = 'planning_center';

-- Test people (all fake):
--   Admin   a7400000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Avery   a7400000-0000-4000-8000-000000000002  avery.switch@example.com
--   Blake   a7400000-0000-4000-8000-000000000003  blake.switch@example.com
select pg_temp.new_user('a7400000-0000-4000-8000-000000000001', 'Test Switch-over Admin', 'admin.switch@example.com');
select pg_temp.new_user('a7400000-0000-4000-8000-000000000002', 'Test Avery Switch', 'avery.switch@example.com');
select pg_temp.new_user('a7400000-0000-4000-8000-000000000003', 'Test Blake Switch', 'blake.switch@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7400000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

insert into public.serving_roles (department_id, name)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Switch Camera');

create temporary table payload (p jsonb);
grant all on payload to service_role;
insert into payload values (jsonb_build_object(
  'from', now() - interval '1 day', 'to', now() + interval '60 days',
  'service_types', jsonb_build_array(jsonb_build_object('id', 'st-sw', 'name', 'Fake Switch Sunday')),
  'teams', jsonb_build_array(jsonb_build_object('id', 't-sw', 'service_type_id', 'st-sw', 'name', 'Fake Switch Team',
    'positions', jsonb_build_array(jsonb_build_object('id', 'pos-sw', 'name', 'Camera 1')))),
  'people', jsonb_build_array(
    jsonb_build_object('id', 'p-avery', 'name', 'Avery in PCO', 'emails', jsonb_build_array('avery.switch@example.com')),
    jsonb_build_object('id', 'p-blake', 'name', 'Blake in PCO', 'emails', jsonb_build_array('blake.switch@example.com'))),
  'roster', jsonb_build_array(
    jsonb_build_object('person_id', 'p-avery', 'team_id', 't-sw', 'position_id', 'pos-sw'),
    jsonb_build_object('person_id', 'p-blake', 'team_id', 't-sw', 'position_id', 'pos-sw')),
  'plans', jsonb_build_array(jsonb_build_object('id', 'plan-sw', 'title', 'Fake Switch Sunday',
    'service_type_id', 'st-sw',
    'starts_at', now() + interval '5 days', 'ends_at', now() + interval '5 days 90 minutes',
    'members', jsonb_build_array(
      jsonb_build_object('id', 'm-sw1', 'person_id', 'p-avery', 'team_id', 't-sw', 'position_id', 'pos-sw', 'status', 'C'),
      jsonb_build_object('id', 'm-sw2', 'person_id', 'p-blake', 'team_id', 't-sw', 'position_id', 'pos-sw', 'status', 'U')))),
  'blockouts', jsonb_build_array(jsonb_build_object('id', 'b-sw', 'person_id', 'p-blake',
    'starts_on', (current_date + 20)::text, 'ends_on', (current_date + 21)::text, 'reason', 'Away')))
);

-- Planning Center schedules: the sync brings in a service with two people, both on the team.
select pg_temp.as_service();
select public.sync_planning_center((select p from payload));
reset role;
select pg_temp.act_as('a7400000-0000-4000-8000-000000000001');
select public.set_pco_link('t-sw', 'pos-sw', (select id from public.serving_roles where name = 'Fake Switch Camera'));
reset role;
select pg_temp.as_service();
select public.sync_planning_center((select p from payload));
reset role;
-- The plan's service type, as the sync records it.
update public.events set pco_service_type_id = 'st-sw' where external_id = 'plan-sw';

select is((select count(*)::int from public.event_assignments where external_id in ('m-sw1', 'm-sw2')), 2,
  'two people are scheduled from Planning Center');

-- Only schedulers see the preview.
select pg_temp.act_as('a7400000-0000-4000-8000-000000000002');
select throws_ok($$ select public.scheduling_switch_preview() $$, '42501', 'not_authorized',
  'volunteers cannot see the switch preview');
reset role;

select pg_temp.act_as('a7400000-0000-4000-8000-000000000001');
select is((public.scheduling_switch_preview() ->> 'services')::int >= 1, true,
  'the preview counts the upcoming service');
select is((public.scheduling_switch_preview() ->> 'blockouts')::int >= 1, true,
  'and the blockout');

-- Switch to the Academy.
select lives_ok($$ select public.set_scheduling_source('academy') $$, 'the scheduler switches to the Academy');
reset role;

select is((select source from public.events where external_id = 'plan-sw'), 'academy',
  'the upcoming service becomes the Academy''s');
select is(
  (select array_agg(a.status::text order by a.external_id) from public.event_assignments a
    where a.external_id in ('m-sw1', 'm-sw2')),
  array['confirmed', 'pending'], 'who''s scheduled and their replies are kept');
select ok(
  (select t.pco_service_type_id = 'st-sw' and t.name = 'Fake Switch Sunday'
     from public.service_types t join public.events e on e.service_type_id = t.id
    where e.external_id = 'plan-sw'),
  'a service type is made from Planning Center''s and the service is linked to it');
select is(
  (select count(*)::int from public.service_type_positions p
     join public.service_types t on t.id = p.service_type_id where t.pco_service_type_id = 'st-sw'),
  2, 'the service type needs as many places as its busiest service');
select is(
  (select count(*)::int from public.serving_team_members
    where user_id in ('a7400000-0000-4000-8000-000000000002', 'a7400000-0000-4000-8000-000000000003')
      and removed_at is null and source = 'academy' and copied_from_planning_center),
  2, 'team members are copied');
select is((select source from public.unavailability where external_id = 'b-sw'), 'academy',
  'the blockout is copied');
select is(
  (select count(*)::int from public.audit_events where action = 'scheduling.switched_to_academy'),
  1, 'the switch is in the audit log');
select is(
  (select count(*)::int from public.notifications
    where user_id in ('a7400000-0000-4000-8000-000000000002', 'a7400000-0000-4000-8000-000000000003')
      and created_at >= now() - interval '1 minute' and kind not in ('membership_approved')),
  0, 'nobody is emailed about the switch');

-- The Academy can change the copied service, and the sync can't.
select pg_temp.act_as('a7400000-0000-4000-8000-000000000001');
select lives_ok($$ update public.events set notes = 'Changed in the Academy' where external_id = 'plan-sw' $$,
  'the copied service can be changed in the Academy');
select lives_ok($$ select public.set_scheduling_source('academy') $$, 'switching to the same place does nothing');
reset role;
select is(
  (select count(*)::int from public.audit_events where action = 'scheduling.switched_to_academy'),
  1, 'and records nothing');

-- Switch back: the service is handed back, and the next sync updates it instead of copying it again.
select pg_temp.act_as('a7400000-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_scheduling_source('planning_center') $$, 'the scheduler switches back');
reset role;
select is((select source from public.events where external_id = 'plan-sw'), 'planning_center',
  'the service goes back to Planning Center');
select is((select source from public.unavailability where external_id = 'b-sw'), 'planning_center',
  'and the blockout');
select is(
  (select count(*)::int from public.serving_team_members
    where user_id in ('a7400000-0000-4000-8000-000000000002', 'a7400000-0000-4000-8000-000000000003')
      and removed_at is null and source = 'planning_center'),
  2, 'and the team members');

select pg_temp.as_service();
select lives_ok($$ select public.sync_planning_center((select p from payload)) $$, 'the sync runs again');
reset role;
select is((select count(*)::int from public.events where external_id = 'plan-sw'), 1,
  'without a second copy of the service');
select is((select count(*)::int from public.unavailability where external_id = 'b-sw'), 1,
  'or of the blockout');
select is(
  (select count(*)::int from public.serving_team_members
    where user_id = 'a7400000-0000-4000-8000-000000000002' and removed_at is null),
  1, 'or of the team member');

select * from finish();
rollback;
