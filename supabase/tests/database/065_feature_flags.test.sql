-- Feature flags: everyone can see what's on, only feature.manage switches them, and it's audited.
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

--   Platform admin  a8100000-0000-4000-8000-000000000001
--   Volunteer       a8100000-0000-4000-8000-000000000002
--   Camera leader   a8100000-0000-4000-8000-000000000003
select pg_temp.new_user('a8100000-0000-4000-8000-000000000001', 'Test Flag Admin');
select pg_temp.new_user('a8100000-0000-4000-8000-000000000002', 'Test Flag Volunteer');
select pg_temp.new_user('a8100000-0000-4000-8000-000000000003', 'Test Flag Leader');
insert into public.user_roles (user_id, role_id)
select 'a8100000-0000-4000-8000-000000000001', r.id from public.roles r where r.key = 'platform_admin';
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8100000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

select is((select count(*)::int from public.feature_flags where key = 'messaging' and not enabled), 1,
  'messaging starts off');
select throws_ok($$ insert into public.feature_flags (organization_id, key)
  select id, 'not_a_feature' from public.organizations $$, '23514', null, 'only known keys exist');

select pg_temp.act_as('a8100000-0000-4000-8000-000000000002');
select is(private.feature_enabled('messaging'), false, 'a volunteer sees it''s off');
-- Messaging, and video and graphics approvals (090).
select is((select count(*)::int from public.feature_flags), 2, 'and can read the flags');
select throws_ok($$ select public.set_feature_flag('messaging', true) $$, '42501', 'not_authorized',
  'a volunteer can''t switch it');
select throws_ok($$ update public.feature_flags set enabled = true $$, '42501', null,
  'or change the table directly');

select pg_temp.act_as('a8100000-0000-4000-8000-000000000003');
select throws_ok($$ select public.set_feature_flag('messaging', true) $$, '42501', 'not_authorized',
  'nor can a department leader');

select pg_temp.act_as('a8100000-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_feature_flag('messaging', true) $$, 'a platform admin can switch it on');
select lives_ok($$ select public.set_feature_flag('messaging', true) $$, 'doing it again is safe');
select is(private.feature_enabled('messaging'), true, 'and it''s on');
select throws_ok($$ select public.set_feature_flag('not_a_feature', true) $$, '23514', null,
  'an unknown key is refused');
select lives_ok($$ select public.set_feature_flag('messaging', false) $$, 'and off again');
reset role;

select is((select count(*)::int from public.audit_events where target_table = 'feature_flags'), 2,
  'each change is audited once');
select is((select metadata ->> 'key' from public.audit_events
  where action = 'feature_flag.switched_on'), 'messaging', 'saying which feature');
select is((select actor_id from public.audit_events where action = 'feature_flag.switched_off'),
  'a8100000-0000-4000-8000-000000000001'::uuid, 'and who switched it');

select pg_temp.act_as('a8100000-0000-4000-8000-000000000002');
select is(private.feature_enabled('messaging'), false, 'everyone sees it off again');
select is(private.feature_enabled('not_a_feature'), false, 'and an unknown key is never on');

select * from finish();
rollback;
