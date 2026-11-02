-- Service Dashboard, stage 1 (ADD-DASH-01 to 03): who can view, who can edit, up to 3 editors.
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
--   Manager    a5000000-0000-4000-8000-000000000001  (Platform Administrator)
--   Teammate   a5000000-0000-4000-8000-000000000002  (on a serving team)
--   Outsider   a5000000-0000-4000-8000-000000000003  (signed in, on no team)
--   Editors    a5000000-0000-4000-8000-00000000001x  (candidates for the 3 editor spots)
select pg_temp.new_user('a5000000-0000-4000-8000-000000000001', 'Test Manager');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000002', 'Test Teammate');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000003', 'Test Outsider');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000011', 'Test Editor One');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000012', 'Test Editor Two');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000013', 'Test Editor Three');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000014', 'Test Editor Four');

insert into public.user_roles (user_id, role_id)
select 'a5000000-0000-4000-8000-000000000001', r.id from public.roles r where r.key = 'platform_admin';

insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000002', 'active', now());
insert into public.serving_roles (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Dashboard Cam');
insert into public.serving_team_members (role_id, department_id, user_id)
select id, 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000002'
from public.serving_roles where name = 'Fake Dashboard Cam';

-- Who can view follows teams, with no training requirement.
select pg_temp.act_as('a5000000-0000-4000-8000-000000000002');
select ok(public.can_view_service_dashboard(), 'someone on a team can view the dashboard');
reset role;
select pg_temp.act_as('a5000000-0000-4000-8000-000000000003');
select ok(not public.can_view_service_dashboard(), 'someone on no team cannot view the dashboard');

-- Saving is for editors.
select throws_ok(
  $$select public.save_dashboard_layout('Mine', '[]'::jsonb, '[]'::jsonb)$$,
  '42501', 'not_authorized', 'someone who is not an editor cannot save the layout');
select throws_ok(
  $$insert into public.dashboard_layouts (organization_id, name, items)
    select id, 'Direct', '[]'::jsonb from public.organizations limit 1$$,
  '42501', null, 'the layout table cannot be written directly');
reset role;
select pg_temp.act_as('a5000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.save_dashboard_layout('Mine', '[]'::jsonb, '[]'::jsonb)$$,
  '42501', 'not_authorized', 'a team member who is not an editor cannot save the layout');

-- Choosing editors is for managers.
select throws_ok(
  $$select public.set_dashboard_editor('a5000000-0000-4000-8000-000000000002', true)$$,
  '42501', 'not_authorized', 'a team member cannot choose editors');
select throws_ok(
  $$select * from public.service_dashboard_people()$$,
  '42501', 'not_authorized', 'a team member cannot list people for the editor choice');
reset role;

select pg_temp.act_as('a5000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.set_dashboard_editor('a5000000-0000-4000-8000-000000000011', true)$$,
  'a manager adds the first editor');
select lives_ok(
  $$select public.set_dashboard_editor('a5000000-0000-4000-8000-000000000011', true)$$,
  'adding the same editor again is harmless');
select lives_ok(
  $$select public.set_dashboard_editor('a5000000-0000-4000-8000-000000000012', true)$$,
  'a manager adds the second editor');
select lives_ok(
  $$select public.set_dashboard_editor('a5000000-0000-4000-8000-000000000013', true)$$,
  'a manager adds the third editor');
select throws_ok(
  $$select public.set_dashboard_editor('a5000000-0000-4000-8000-000000000014', true)$$,
  'P0001', 'dashboard_editor_limit', 'a fourth editor is refused');
select is(
  (select count(*)::int from public.service_dashboard_people() where is_editor),
  3, 'the list shows 3 editors');
reset role;

-- The limit holds even when the role is assigned directly, as the People page does.
select throws_ok(
  $$insert into public.user_roles (user_id, role_id)
    select 'a5000000-0000-4000-8000-000000000014', r.id
    from public.roles r where r.key = 'dashboard_editor'$$,
  'P0001', 'dashboard_editor_limit', 'the limit holds outside the editor screen too');

-- An editor saves, and it's logged.
select pg_temp.act_as('a5000000-0000-4000-8000-000000000011');
select lives_ok(
  $$select public.save_dashboard_layout('Sunday', '[{"tile":"run","x":0,"y":0,"w":4,"h":4}]'::jsonb, '["ch01"]'::jsonb)$$,
  'an editor saves the layout');
select lives_ok(
  $$select public.save_dashboard_layout('Sunday two', '[]'::jsonb, '[]'::jsonb)$$,
  'saving again replaces the one layout');
reset role;
select is((select count(*)::int from public.dashboard_layouts), 1, 'there is only ever one layout');
select is((select name from public.dashboard_layouts), 'Sunday two', 'the latest save wins');
select is(
  (select count(*)::int from public.audit_events where action = 'service_dashboard.layout_saved'),
  2, 'every save writes an audit event');

-- Viewers read it; others don't.
select pg_temp.act_as('a5000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.dashboard_layouts), 1, 'a team member reads the layout');
reset role;
select pg_temp.act_as('a5000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.dashboard_layouts), 0, 'someone on no team reads nothing');
reset role;

-- Removing an editor frees a spot.
select pg_temp.act_as('a5000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.set_dashboard_editor('a5000000-0000-4000-8000-000000000013', false)$$,
  'a manager removes an editor');
select lives_ok(
  $$select public.set_dashboard_editor('a5000000-0000-4000-8000-000000000014', true)$$,
  'the freed spot can be filled');
reset role;
select pg_temp.act_as('a5000000-0000-4000-8000-000000000013');
select throws_ok(
  $$select public.save_dashboard_layout('Late', '[]'::jsonb, '[]'::jsonb)$$,
  '42501', 'not_authorized', 'a removed editor can no longer save');
reset role;

select * from finish();
rollback;
