-- Sign in with Planning Center (checklist app US-01, US-03a): who a Planning Center person is in
-- the Academy, and that only IFC's people get in.
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

-- Test people (all fake):
--   Avery   ac000000-0000-4000-8000-000000000001  avery.signin@example.com
select pg_temp.new_user('ac000000-0000-4000-8000-000000000001', 'Test Sign-in Avery', 'avery.signin@example.com');

-- Planning Center people as the sync saw them.
insert into public.pco_people (id, organization_id, display_name, seen_at)
select x.id, o.id, x.name, now()
from public.organizations o, (values ('p-signin-avery', 'Avery in PCO'), ('p-signin-new', 'New in PCO')) x(id, name);
update public.organizations set pco_organization_id = 'org-signin-ifc';

-- Nobody signed in can call it.
select pg_temp.act_as('ac000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.planning_center_sign_in('p-signin-avery', 'org-signin-ifc', array['avery.signin@example.com']) $$,
  '42501', null, 'only the sign-in route (service role) may ask');
reset role;

select pg_temp.as_service();
select throws_ok($$ select * from public.planning_center_sign_in('p-signin-avery', 'org-elsewhere', array['avery.signin@example.com']) $$,
  'P0001', 'wrong_organization', 'someone from another church''s Planning Center is refused');
select throws_ok($$ select * from public.planning_center_sign_in('p-not-on-a-team', 'org-signin-ifc', array['x@example.com']) $$,
  'P0001', 'not_in_planning_center', 'someone not on IFC''s teams or schedules is refused');

select is((select user_id from public.planning_center_sign_in('p-signin-avery', 'org-signin-ifc', array['Avery.Signin@example.com'])),
  'ac000000-0000-4000-8000-000000000001'::uuid, 'an existing account with one of their emails is theirs');
reset role;
select is((select pco_person_id from public.profiles where id = 'ac000000-0000-4000-8000-000000000001'), 'p-signin-avery',
  'and is linked to their Planning Center person');
select is((select user_id from public.pco_people where id = 'p-signin-avery'), 'ac000000-0000-4000-8000-000000000001'::uuid,
  'so their checklist follows straight away');

select pg_temp.as_service();
select is((select user_id from public.planning_center_sign_in('p-signin-avery', 'org-signin-ifc', array['changed@example.com'])),
  'ac000000-0000-4000-8000-000000000001'::uuid, 'the link holds when their email changes');
select is((select count(*)::integer from public.planning_center_sign_in('p-signin-new', 'org-signin-ifc', array['new.signin@example.com'])), 0,
  'no account yet: the app creates one and asks again');
reset role;

-- The app creates the account (as the Auth admin API would), then asks again.
select pg_temp.new_user('ac000000-0000-4000-8000-000000000002', 'New in PCO', 'new.signin@example.com');
select pg_temp.as_service();
select is((select user_id from public.planning_center_sign_in('p-signin-new', 'org-signin-ifc', array['new.signin@example.com'])),
  'ac000000-0000-4000-8000-000000000002'::uuid, 'the new account is theirs');

-- The sync keeps the link even when the email no longer matches, and records the organization.
select lives_ok($$ select public.sync_planning_center(jsonb_build_object(
  'from', now() - interval '1 day', 'to', now() + interval '60 days', 'organization_id', 'org-signin-ifc',
  'people', jsonb_build_array(jsonb_build_object('id', 'p-signin-avery', 'name', 'Avery in PCO',
    'emails', jsonb_build_array('changed@example.com'))))) $$, 'the sync runs');
reset role;
select is((select user_id from public.pco_people where id = 'p-signin-avery'), 'ac000000-0000-4000-8000-000000000001'::uuid,
  'the sync matches people by their sign-in link first');
select is((select pco_organization_id from public.organizations order by created_at limit 1), 'org-signin-ifc',
  'and keeps IFC''s Planning Center organization');

-- People can't set the link themselves.
select pg_temp.act_as('ac000000-0000-4000-8000-000000000002');
select throws_ok($$ update public.profiles set pco_person_id = 'p-signin-avery' where id = auth.uid() $$,
  '42501', null, 'nobody links their own account to someone else in Planning Center');

select * from finish();
rollback;
