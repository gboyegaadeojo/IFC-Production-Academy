-- A scheduled person whose position the sync script couldn't match by id is matched by name in
-- the database (checklist app US-15, C38).
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_email, jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

update public.organizations set scheduling_source = 'planning_center';
-- Test person (fake): Riley  ad000000-0000-4000-8000-000000000001  riley.match@example.com
select pg_temp.new_user('ad000000-0000-4000-8000-000000000001', 'Test Match Riley', 'riley.match@example.com');
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Match Camera');

create temporary table payload (p jsonb);
grant all on payload to service_role;
insert into payload values (jsonb_build_object(
  'from', now() - interval '1 day', 'to', now() + interval '60 days',
  'service_types', jsonb_build_array(jsonb_build_object('id', 'st-match', 'name', 'Fake Match Sunday')),
  'teams', jsonb_build_array(jsonb_build_object('id', 't-match', 'service_type_id', 'st-match', 'name', 'Fake Match Team',
    'positions', jsonb_build_array(jsonb_build_object('id', 'pos-match-cam', 'name', 'Camera 1')))),
  'people', jsonb_build_array(jsonb_build_object('id', 'u-match', 'name', 'Riley in PCO',
    'emails', jsonb_build_array('riley.match@example.com'))),
  'roster', '[]'::jsonb,
  'plans', jsonb_build_array(jsonb_build_object('id', 'plan-match', 'service_type_id', 'st-match', 'title', 'Fake Match Sunday',
    'starts_at', now() + interval '2 days', 'ends_at', now() + interval '2 days 2 hours',
    'members', jsonb_build_array(jsonb_build_object('id', 'mm1', 'person_id', 'u-match', 'team_id', 't-match',
      'position_id', null, 'position_name', '  camera   1 ', 'status', 'C')))),
  'blockouts', '[]'::jsonb
));

insert into public.pco_service_types (id, organization_id, name, seen_at)
select 'st-match', id, 'Fake Match Sunday', now() from public.organizations order by created_at limit 1;
insert into public.pco_teams (id, organization_id, service_type_id, name, seen_at)
select 't-match', id, 'st-match', 'Fake Match Team', now() from public.organizations order by created_at limit 1;
insert into public.pco_positions (id, organization_id, team_id, name, seen_at)
select 'pos-match-cam', id, 't-match', 'Camera 1', now() from public.organizations order by created_at limit 1;
insert into public.pco_links (organization_id, pco_team_id, pco_position_id, role_id)
select o.id, 't-match', 'pos-match-cam', (select id from public.serving_roles where name = 'Fake Match Camera')
from public.organizations o order by o.created_at limit 1;

select pg_temp.as_service();
select lives_ok($$ select public.sync_planning_center((select p from payload)) $$, 'the sync runs');
reset role;

select is((select count(*)::integer from public.pco_unlinked_scheduled where pco_member_id = 'mm1'), 0,
  'a position named like a linked one is not reported as unlinked');
select is((select role_id from public.event_assignments where external_id = 'mm1'),
  (select id from public.serving_roles where name = 'Fake Match Camera'),
  'they are scheduled in the linked Academy position');

select * from finish();
rollback;
