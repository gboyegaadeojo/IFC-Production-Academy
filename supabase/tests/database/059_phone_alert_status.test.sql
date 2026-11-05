-- Who has phone alerts on: leaders see their own teams, and nobody else sees devices.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

--   On a team, phone on     a9000000-0000-4000-8000-000000000001
--   On a team, computer     a9000000-0000-4000-8000-000000000002
--   On a team, nothing      a9000000-0000-4000-8000-000000000003
--   Not on a team           a9000000-0000-4000-8000-000000000004
--   Leader of this dept     a9000000-0000-4000-8000-000000000005
--   Leader of another dept  a9000000-0000-4000-8000-000000000006
--   Production Director     a9000000-0000-4000-8000-000000000007
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('a9000000-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'alerts-' || n || '@example.com',
       jsonb_build_object('display_name', 'Fake Person ' || n), now(), now()
from generate_series(1, 7) n;

create temporary table test_departments on commit drop as
select
  (select id from public.departments where kind = 'team' order by sort_order limit 1) as ours,
  (select id from public.departments where kind = 'team' order by sort_order offset 1 limit 1) as other;
grant select on test_departments to authenticated;

insert into public.department_memberships (user_id, department_id, status, decided_at)
select ('a9000000-0000-4000-8000-00000000000' || n)::uuid, (select ours from test_departments), 'active', now()
from generate_series(1, 3) n;

insert into public.user_roles (user_id, role_id, department_id)
select 'a9000000-0000-4000-8000-000000000005', r.id, (select ours from test_departments)
from public.roles r where r.key = 'department_leader';
insert into public.user_roles (user_id, role_id, department_id)
select 'a9000000-0000-4000-8000-000000000006', r.id, (select other from test_departments)
from public.roles r where r.key = 'department_leader';
insert into public.user_roles (user_id, role_id)
select 'a9000000-0000-4000-8000-000000000007', r.id
from public.roles r where r.key = 'production_director';

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label) values
  ('a9000000-0000-4000-8000-000000000001', 'https://push.example.net/send/fake-phone', repeat('B', 87), repeat('C', 22), 'iPhone'),
  ('a9000000-0000-4000-8000-000000000002', 'https://push.example.net/send/fake-mac', repeat('B', 87), repeat('C', 22), 'Mac');

-- The leader of this department sees its people, each with the right status.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000005');
select is(
  (select status from public.team_alert_status() where user_id = 'a9000000-0000-4000-8000-000000000001'),
  'on', 'a phone counts as on');
select is(
  (select status from public.team_alert_status() where user_id = 'a9000000-0000-4000-8000-000000000002'),
  'computer_only', 'a computer alone is shown as computer only');
select is(
  (select status from public.team_alert_status() where user_id = 'a9000000-0000-4000-8000-000000000003'),
  'off', 'no device is off');
select is_empty(
  $$ select 1 from public.team_alert_status() where user_id = 'a9000000-0000-4000-8000-000000000004' $$,
  'someone on no team isn''t listed');
reset role;

-- Another department's leader doesn't see them.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000006');
select is_empty(
  $$ select 1 from public.team_alert_status() where user_id = 'a9000000-0000-4000-8000-000000000001' $$,
  'a leader of another department sees nobody here');
reset role;

-- A Production Director sees everyone on a team.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000007');
select isnt_empty(
  $$ select 1 from public.team_alert_status() where user_id = 'a9000000-0000-4000-8000-000000000001' $$,
  'a Production Director sees every department');
reset role;

-- A volunteer sees no list, and can't read anyone else's devices or exception.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
select is_empty($$ select 1 from public.team_alert_status() $$, 'a volunteer sees no list');
select is_empty(
  $$ select 1 from public.push_subscriptions where user_id <> 'a9000000-0000-4000-8000-000000000003' $$,
  'a volunteer can''t read other people''s devices');
reset role;

-- Who gets asked.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
select is(public.alerts_setup_needed(), true, 'someone on a team with no phone is asked');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000002');
select is(public.alerts_setup_needed(), true, 'a computer alone still gets asked about a phone');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000001');
select is(public.alerts_setup_needed(), false, 'someone with a phone on isn''t asked');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000004');
select is(public.alerts_setup_needed(), false, 'someone on no team isn''t asked');
reset role;

-- "My phone can't do this" stops the asking and shows to leaders, and can be undone.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
select public.set_alerts_unavailable(true);
select is(public.alerts_setup_needed(), false, 'saying the phone can''t stops the asking');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000005');
select is(
  (select status from public.team_alert_status() where user_id = 'a9000000-0000-4000-8000-000000000003'),
  'cannot', 'leaders see that the phone can''t');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000004');
select is_empty(
  $$ select 1 from public.alert_exceptions $$,
  'nobody else can read someone''s exception');
select throws_ok(
  $$ insert into public.alert_exceptions (user_id) values ('a9000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'nobody writes the table directly');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
select public.set_alerts_unavailable(false);
select is(public.alerts_setup_needed(), true, 'taking it back starts the asking again');
reset role;

select * from finish();
rollback;
