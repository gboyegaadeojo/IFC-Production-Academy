-- App name and logo (ADD-DASH-04): readable by anyone, changed only with branding.manage, logged.
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
--   Admin      a6000000-0000-4000-8000-000000000001  (Platform Administrator)
--   Volunteer  a6000000-0000-4000-8000-000000000002
select pg_temp.new_user('a6000000-0000-4000-8000-000000000001', 'Test Brand Admin');
select pg_temp.new_user('a6000000-0000-4000-8000-000000000002', 'Test Brand Volunteer');
insert into public.user_roles (user_id, role_id)
select 'a6000000-0000-4000-8000-000000000001', r.id from public.roles r where r.key = 'platform_admin';

-- Anyone can read it, even before signing in.
set local role anon;
select is(
  (select app_short_name from public.app_branding()), 'IFC Academy',
  'someone not signed in can read the short name');
select throws_ok(
  $$select public.set_app_branding('Hacked', 'Hacked', null)$$,
  '42501', null, 'someone not signed in cannot change it');
reset role;

select pg_temp.act_as('a6000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.set_app_branding('Mine', 'Mine', null)$$,
  '42501', 'not_authorized', 'a volunteer cannot change it');
reset role;

select pg_temp.act_as('a6000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.set_app_branding('  Fake Team App  ', 'Fake Team', 'app-icon-00000000-0000-4000-8000-000000000000.png')$$,
  'a platform admin changes it');
select is((select app_name from public.app_branding()), 'Fake Team App', 'the name is tidied and saved');
select is(
  (select app_icon_path from public.app_branding()),
  'app-icon-00000000-0000-4000-8000-000000000000.png', 'the icon is saved');
select throws_ok(
  $$select public.set_app_branding('', 'Fake', null)$$,
  '23514', null, 'an empty name is refused');
select throws_ok(
  $$select public.set_app_branding('Fake', repeat('x', 25), null)$$,
  '23514', null, 'a short name that is too long is refused');
select throws_ok(
  $$select public.set_app_branding('Fake', 'Fake', '../../secret.png')$$,
  '23514', null, 'an odd icon path is refused');
select lives_ok(
  $$select public.set_app_branding('Fake Team App', 'Fake Team', null)$$,
  'the icon can go back to the original');
reset role;

select ok(
  (select count(*) from public.audit_events
   where action = 'organization.updated' and metadata -> 'changed' ? 'app_name') >= 1,
  'changing the name writes an audit event');
select ok(
  (select public from storage.buckets where id = 'branding'),
  'icons sit in a public bucket, since an app icon is not private');

select * from finish();
rollback;
