-- You see whether you sign in with Planning Center and its name for you; nobody else's.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Test people (fake): Kai (linked)  af000000-…-01; Lee (email only)  af000000-…-02
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'af000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'kai.pco@example.com', '{"full_name": "kaipco"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'af000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'lee.pco@example.com', '{"full_name": "Test Lee"}', now(), now());
insert into public.pco_people (id, organization_id, display_name, seen_at)
select 'p-kai', id, 'Kai Example', now() from public.organizations order by created_at limit 1;
update public.profiles set pco_person_id = 'p-kai' where id = 'af000000-0000-4000-8000-000000000001';

-- Kai is on a position team linked to a Planning Center team; Lee is on one that isn't linked.
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'af000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'af000000-0000-4000-8000-000000000002', 'active', now());
insert into public.serving_roles (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Linked Cam'),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Unlinked Cam');
insert into public.serving_team_members (role_id, department_id, user_id)
select r.id, r.department_id, u.id
from public.serving_roles r
join (values ('Fake Linked Cam', 'af000000-0000-4000-8000-000000000001'::uuid),
             ('Fake Unlinked Cam', 'af000000-0000-4000-8000-000000000002'::uuid)) u(role_name, id)
  on u.role_name = r.name;
insert into public.pco_teams (id, organization_id, service_type_id, name)
select 't-fake', id, 'st-fake', 'Fake Media Team' from public.organizations order by created_at limit 1;
insert into public.pco_links (organization_id, pco_team_id, role_id)
select (select id from public.organizations order by created_at limit 1), 't-fake', id
from public.serving_roles where name = 'Fake Linked Cam';

select pg_temp.act_as('af000000-0000-4000-8000-000000000001');
select is((select linked from public.my_planning_center()), true, 'Kai signs in with Planning Center');
select is((select pco_name from public.my_planning_center()), 'Kai Example', 'and sees the name it has for them');
select is((select pco_teams from public.my_planning_center()), array['Fake Media Team'], 'and the Planning Center teams they''re on');
select is((select count(*)::integer from public.pco_people), 0, 'but not Planning Center''s people');
select is((select count(*)::integer from public.pco_teams), 0, 'or its teams');

select pg_temp.act_as('af000000-0000-4000-8000-000000000002');
select is((select linked from public.my_planning_center()), false, 'Lee signs in by email');
select is((select pco_name from public.my_planning_center()), null, 'with no Planning Center name');
select is((select pco_teams from public.my_planning_center()), '{}'::text[], 'and no teams: their position isn''t linked');

select * from finish();
rollback;
