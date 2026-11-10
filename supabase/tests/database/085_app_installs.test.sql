-- Who has the app: people note it for themselves only, leaders see it for their teams, and the
-- list shows which kinds of alert someone has switched off for their phone.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

--   On a team (volunteer)   af000000-0000-4000-8000-000000000001
--   Leader of that dept     af000000-0000-4000-8000-000000000002
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('af000000-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'installs-' || n || '@example.com',
       jsonb_build_object('display_name', 'Fake Installer ' || n), now(), now()
from generate_series(1, 2) n;

create temporary table test_department on commit drop as
select (select id from public.departments where kind = 'team' order by sort_order limit 1) as id;
grant select on test_department to authenticated;

insert into public.department_memberships (user_id, department_id, status, decided_at)
values ('af000000-0000-4000-8000-000000000001', (select id from test_department), 'active', now());
insert into public.user_roles (user_id, role_id, department_id)
select 'af000000-0000-4000-8000-000000000002', r.id, (select id from test_department)
from public.roles r where r.key = 'department_leader';

-- The volunteer opens the installed app on an iPhone, twice, and switches Training alerts off.
select pg_temp.act_as('af000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.record_app_open('iphone') $$, 'opening the app is noted');
select lives_ok($$ select public.record_app_open('iphone') $$, 'opening it again just updates the date');
select throws_ok($$ select public.record_app_open('toaster') $$, '22023', 'invalid_platform',
  'only known kinds of device are accepted');
select is((select count(*)::int from public.app_installs), 1, 'they see their own install, once');
select throws_ok(
  $$ insert into public.app_installs (user_id, platform) values ('af000000-0000-4000-8000-000000000002', 'android') $$,
  '42501', null, 'nobody writes installs directly');
reset role;
insert into public.notification_preferences (user_id, kind, email, push)
values ('af000000-0000-4000-8000-000000000001', 'course_assigned', true, false);

-- The leader sees it in the team list; nobody else's installs are readable directly.
select pg_temp.act_as('af000000-0000-4000-8000-000000000002');
select is(
  (select app_platforms from public.team_alert_status() where user_id = 'af000000-0000-4000-8000-000000000001'),
  array['iphone'], 'a leader sees where their team member has the app');
select is(
  (select push_off_kinds from public.team_alert_status() where user_id = 'af000000-0000-4000-8000-000000000001'),
  array['course_assigned'], 'and which alerts they switched off for their phone');
select is_empty($$ select 1 from public.app_installs $$, 'but can''t read the installs table itself');
reset role;

select * from finish();
rollback;
