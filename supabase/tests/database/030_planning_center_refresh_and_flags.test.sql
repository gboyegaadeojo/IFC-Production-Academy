-- Planning Center catch-ups (checklist app US-15, C29, C39): who is scheduled in a position that
-- isn't linked, and refreshing on demand.
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
--   Admin      ab000000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Director   ab000000-0000-4000-8000-000000000002  (Production Director: church-wide checklist.manage)
--   Avery      ab000000-0000-4000-8000-000000000003  avery.flags@example.com (a volunteer)
select pg_temp.new_user('ab000000-0000-4000-8000-000000000001', 'Test Flags Admin', 'admin.flags@example.com');
select pg_temp.new_user('ab000000-0000-4000-8000-000000000002', 'Test Flags Director', 'director.flags@example.com');
select pg_temp.new_user('ab000000-0000-4000-8000-000000000003', 'Test Flags Avery', 'avery.flags@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('ab000000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null),
  ('ab000000-0000-4000-8000-000000000002', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null);
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Flags Camera');

create temporary table payload (p jsonb);
grant all on payload to service_role, authenticated;
insert into payload values (jsonb_build_object(
  'from', now() - interval '1 day', 'to', now() + interval '60 days',
  'service_types', jsonb_build_array(jsonb_build_object('id', 'st-flags', 'name', 'Fake Flags Sunday')),
  'teams', jsonb_build_array(jsonb_build_object('id', 't-flags', 'service_type_id', 'st-flags', 'name', 'Fake Flags Team',
    'positions', jsonb_build_array(jsonb_build_object('id', 'pos-flags-cam', 'name', 'Camera 1'),
                                   jsonb_build_object('id', 'pos-flags-misc', 'name', 'Miscellaneous')))),
  'people', jsonb_build_array(
    jsonb_build_object('id', 'u-flags-avery', 'name', 'Avery Flags in PCO', 'emails', jsonb_build_array('avery.flags@example.com')),
    jsonb_build_object('id', 'u-flags-blake', 'name', 'Blake Flags in PCO', 'emails', jsonb_build_array('nobody.flags@example.com'))),
  'roster', '[]'::jsonb,
  'plans', jsonb_build_array(jsonb_build_object('id', 'plan-flags', 'service_type_id', 'st-flags', 'title', 'Fake Flags Sunday',
    'starts_at', now() + interval '2 days', 'ends_at', now() + interval '2 days 2 hours',
    'members', jsonb_build_array(
      jsonb_build_object('id', 'mf1', 'person_id', 'u-flags-avery', 'team_id', 't-flags', 'position_id', 'pos-flags-cam',
                         'position_name', 'Camera 1', 'status', 'C'),
      jsonb_build_object('id', 'mf2', 'person_id', 'u-flags-avery', 'team_id', 't-flags', 'position_id', 'pos-flags-misc',
                         'position_name', 'Miscellaneous', 'status', 'C'),
      jsonb_build_object('id', 'mf3', 'person_id', 'u-flags-blake', 'team_id', 't-flags', 'position_id', null,
                         'position_name', 'Camera 9', 'status', 'U')))),
  'blockouts', '[]'::jsonb
));

-- The catalog first, then Camera 1 is linked; Miscellaneous and "Camera 9" aren't.
select pg_temp.as_service();
select lives_ok($$ select public.sync_planning_center((select p from payload)) $$, 'the sync runs');
reset role;
select pg_temp.act_as('ab000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_pco_link('t-flags', 'pos-flags-cam', (select id from public.serving_roles where name = 'Fake Flags Camera')) $$, 'Camera 1 is linked');
reset role;
select pg_temp.as_service();
select lives_ok($$ select public.sync_planning_center((select p from payload)) $$, 'the sync runs');
reset role;

select is((select count(*)::integer from public.pco_unlinked_scheduled), 2,
  'the sync records both places it could not link');

select pg_temp.act_as('ab000000-0000-4000-8000-000000000002');
select is(
  (select array_agg(person_name || ' / ' || team_name || ' / ' || position_name order by position_name)
     from public.pco_unlinked_places()),
  array['Blake Flags in PCO / Fake Flags Team / Camera 9', 'Avery Flags in PCO / Fake Flags Team / Miscellaneous'],
  'checklist managers see who will miss a checklist, with a position name that matches nothing'
);
select is(
  (select count(*)::integer from public.pco_unlinked_places((select id from public.events where external_id = 'plan-flags'))),
  2, 'for one service');

select pg_temp.act_as('ab000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.pco_unlinked_places()), 2, 'so do Planning Center admins');

select pg_temp.act_as('ab000000-0000-4000-8000-000000000003');
select throws_ok($$ select * from public.pco_unlinked_places() $$, '42501', 'not_authorized',
  'volunteers cannot see the list');
select is((select count(*)::integer from public.pco_unlinked_scheduled), 0, 'nor read the table');

-- Linking Miscellaneous fixes one; the next read drops it.
select pg_temp.act_as('ab000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_pco_link('t-flags', 'pos-flags-misc', (select id from public.serving_roles where name = 'Fake Flags Camera')) $$, 'Miscellaneous is linked');
reset role;
select pg_temp.as_service();
select lives_ok($$ select public.sync_planning_center((select p from payload)) $$, 'the sync runs');
reset role;
select is((select array_agg(position_name) from public.pco_unlinked_scheduled), array['Camera 9'],
  'the list is replaced on each read');

-- Refreshing on demand.
select pg_temp.act_as('ab000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.request_pco_refresh() $$, '42501', 'not_authorized',
  'volunteers cannot ask for a refresh');
select pg_temp.act_as('ab000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.request_pco_refresh() $$, 'a Planning Center admin asks for a refresh');
select throws_ok($$ select public.request_pco_refresh() $$, 'P0001', 'too_soon',
  'but not twice within two minutes');
select throws_ok($$ insert into public.pco_refresh_requests (organization_id) select organization_id from public.profiles where id = auth.uid() $$,
  '42501', null, 'nor by writing the table');
reset role;
select is((select count(*)::integer from public.audit_events where action = 'pco_refresh.insert'
             and actor_id = 'ab000000-0000-4000-8000-000000000001'), 1,
  'the request is audited');

select * from finish();
rollback;
