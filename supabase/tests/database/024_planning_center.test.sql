-- Planning Center as the scheduler (decision record 9, revised): the sync, matching by email,
-- links, the read-only guard, and reminders.
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
--   Admin      a6000000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Avery      a6000000-0000-4000-8000-000000000002  avery.pco@example.com
--   Blake      a6000000-0000-4000-8000-000000000003  blake.pco@example.com
select pg_temp.new_user('a6000000-0000-4000-8000-000000000001', 'Test PCO Admin', 'admin.pco@example.com');
select pg_temp.new_user('a6000000-0000-4000-8000-000000000002', 'Test Avery', 'avery.pco@example.com');
select pg_temp.new_user('a6000000-0000-4000-8000-000000000003', 'Test Blake', 'blake.pco@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a6000000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated, service_role;
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake PCO Camera');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake PCO Camera'));

create temporary table payload (p jsonb);
create temporary table counts (c jsonb);
grant all on payload, counts to service_role;
insert into payload values (jsonb_build_object(
  'from', now() - interval '1 day', 'to', now() + interval '60 days',
  'service_types', jsonb_build_array(jsonb_build_object('id', 'st1', 'name', 'Fake Sunday')),
  'teams', jsonb_build_array(jsonb_build_object('id', 't1', 'service_type_id', 'st1', 'name', 'Fake Media Team',
    'positions', jsonb_build_array(jsonb_build_object('id', 'pos-cam', 'name', 'Camera 1'),
                                   jsonb_build_object('id', 'pos-misc', 'name', 'Miscellaneous')))),
  'people', jsonb_build_array(
    jsonb_build_object('id', 'u-avery', 'name', 'Avery in PCO', 'emails', jsonb_build_array('Avery.PCO@example.com')),
    jsonb_build_object('id', 'u-blake', 'name', 'Blake in PCO', 'emails', jsonb_build_array('blake.pco@example.com')),
    jsonb_build_object('id', 'u-new', 'name', 'Fake Newcomer', 'emails', jsonb_build_array('nobody@example.com'))),
  'roster', jsonb_build_array(
    jsonb_build_object('person_id', 'u-avery', 'team_id', 't1', 'position_id', 'pos-cam'),
    jsonb_build_object('person_id', 'u-blake', 'team_id', 't1', 'position_id', 'pos-cam')),
  'plans', jsonb_build_array(jsonb_build_object('id', 'plan1', 'title', 'Fake Sunday',
    'starts_at', now() + interval '3 days', 'ends_at', now() + interval '3 days 2 hours',
    'members', jsonb_build_array(
      jsonb_build_object('id', 'm1', 'person_id', 'u-avery', 'team_id', 't1', 'position_id', 'pos-cam', 'status', 'C'),
      jsonb_build_object('id', 'm2', 'person_id', 'u-blake', 'team_id', 't1', 'position_id', 'pos-cam', 'status', 'U'),
      jsonb_build_object('id', 'm3', 'person_id', 'u-new', 'team_id', 't1', 'position_id', 'pos-cam', 'status', 'C'),
      jsonb_build_object('id', 'm4', 'person_id', 'u-avery', 'team_id', 't1', 'position_id', 'pos-misc', 'status', 'C')))),
  'blockouts', jsonb_build_array(jsonb_build_object('id', 'b1', 'person_id', 'u-blake',
    'starts_on', (current_date + 10)::text, 'ends_on', (current_date + 12)::text, 'reason', 'Away')))
);

-- Nobody but the service role runs the sync.
select pg_temp.act_as('a6000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.sync_planning_center('{}'::jsonb) $$,
  '42501', null, 'signed-in people cannot run the sync'
);
-- The first read brings in the catalog; nothing is linked yet.
reset role;
select pg_temp.as_service();
select is((public.sync_planning_center((select p from payload)) ->> 'unlinked_positions')::int, 4,
  'with no links, nobody is scheduled in the Academy');
reset role;

-- The admin links Camera 1; Miscellaneous stays unlinked.
select pg_temp.act_as('a6000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.set_pco_link('t1', 'pos-cam', (select id from ctx where key = 'cam')) $$,
  '42501', 'not_authorized', 'volunteers cannot link positions'
);
reset role;
select pg_temp.act_as('a6000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.set_pco_link('t1', 'pos-cam', (select id from ctx where key = 'cam')) $$,
  'the scheduling admin links a Planning Center position'
);
select is((select count(*)::int from public.pco_positions), 2, 'and sees Planning Center''s positions');
reset role;

select pg_temp.as_service();
insert into counts select public.sync_planning_center((select p from payload));
reset role;
select is((select (c ->> 'people_matched')::int from counts), 2, 'people are matched by email, ignoring capitals');
select is((select (c ->> 'scheduled')::int from counts), 2, 'linked positions with Academy accounts are scheduled');
select is((select (c ->> 'without_academy_account')::int from counts), 1, 'someone without an account is counted');
select is((select (c ->> 'unlinked_positions')::int from counts), 1, 'an unlinked position is counted');

select is(
  (select array_agg(a.status::text order by a.external_id) from public.event_assignments a where a.external_id in ('m1', 'm2')),
  array['confirmed', 'pending'], 'replies come across from Planning Center'
);
select is(
  (select count(*)::int from public.notifications n
    where n.user_id in ('a6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000003')
      and n.kind = 'assignment_scheduled'),
  0, 'Planning Center has already told them, so the Academy doesn''t'
);
select is(
  (select count(*)::int from public.serving_team_members
    where role_id = (select id from ctx where key = 'cam') and removed_at is null and source = 'planning_center'),
  2, 'the roster becomes the position''s team'
);
select ok(
  exists (select 1 from public.department_memberships
    where user_id = 'a6000000-0000-4000-8000-000000000002' and department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'
      and status = 'active'),
  'and they join the department'
);
select is(
  (select count(*)::int from public.unavailability where user_id = 'a6000000-0000-4000-8000-000000000003' and source = 'planning_center'),
  1, 'blockouts come across'
);
select is(
  (select count(*)::int from public.pco_people where display_name = 'Fake Newcomer' and user_id is null),
  1, 'people without an account are listed for inviting'
);

-- Reminders: Planning Center sends its own.
reset role;
update public.event_assignments set assigned_at = now() - interval '3 days' where external_id = 'm2';
select pg_temp.as_service();
select public.queue_reminders();
reset role;
select is(
  (select count(*)::int from public.notifications where dedupe_key = 'confirm:' || (select id from public.event_assignments where external_id = 'm2')),
  0, 'no "please confirm" for Planning Center services'
);

-- While Planning Center schedules, people can't change the schedule in the Academy.
select pg_temp.act_as('a6000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.events (title, starts_at, ends_at) values ('Nope', now() + interval '2 days', now() + interval '2 days 1 hour') $$,
  'P0001', 'managed_in_planning_center', 'services are added in Planning Center'
);
select throws_ok(
  $$ select public.add_to_serving_team((select id from ctx where key = 'cam'), 'a6000000-0000-4000-8000-000000000001') $$,
  'P0001', 'managed_in_planning_center', 'and people are put on teams there'
);
reset role;
select pg_temp.act_as('a6000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.respond_to_assignment((select id from public.event_assignments where external_id = 'm2'), 'confirmed') $$,
  'P0001', 'managed_in_planning_center', 'and replies are given there'
);
reset role;

-- Taken off the plan in Planning Center: cancelled, never deleted. A removed plan is cancelled.
update payload set p = jsonb_set(p, '{plans,0,members}', (p #> '{plans,0,members}') - 1);
select pg_temp.as_service();
select public.sync_planning_center((select p from payload));
reset role;
select is((select status::text from public.event_assignments where external_id = 'm2'), 'cancelled',
  'someone taken off the plan is cancelled');
update payload set p = jsonb_set(p, '{plans}', '[]'::jsonb);
select pg_temp.as_service();
select public.sync_planning_center((select p from payload));
reset role;
select ok(
  (select cancelled_at is not null from public.events where external_id = 'plan1'),
  'a plan gone from Planning Center is cancelled'
);

-- The Academy's own scheduler can be switched back on.
select pg_temp.act_as('a6000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.set_scheduling_source('academy') $$, '42501', 'not_authorized',
  'volunteers cannot change who schedules');
reset role;
select pg_temp.act_as('a6000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_scheduling_source('academy') $$, 'an organisation-wide scheduler can');
select is(public.scheduling_source(), 'academy', 'and the Academy schedules again');
reset role;

select * from finish();
rollback;
