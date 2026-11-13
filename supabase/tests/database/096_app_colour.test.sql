-- System colour (G, 2026-11-13): readable by anyone, changed only with branding.manage, checked,
-- and logged.
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
--   Admin      a9600000-0000-4000-8000-000000000001  (Platform Administrator)
--   Volunteer  a9600000-0000-4000-8000-000000000002
select pg_temp.new_user('a9600000-0000-4000-8000-000000000001', 'Test Colour Admin');
select pg_temp.new_user('a9600000-0000-4000-8000-000000000002', 'Test Colour Volunteer');
insert into public.user_roles (user_id, role_id)
select 'a9600000-0000-4000-8000-000000000001', r.id from public.roles r where r.key = 'platform_admin';

set local role anon;
select is((select app_colour from public.app_branding()), 'purple', 'purple by default, readable before signing in');
select is((select app_colour_logo from public.app_branding()), true, 'the logo follows it by default');
select throws_ok($$select public.set_app_colour('blue', true)$$, '42501', null,
  'someone not signed in cannot change it');
reset role;

select pg_temp.act_as('a9600000-0000-4000-8000-000000000002');
select throws_ok($$select public.set_app_colour('blue', true)$$, '42501', 'not_authorized',
  'a volunteer cannot change it');
reset role;

select pg_temp.act_as('a9600000-0000-4000-8000-000000000001');
select lives_ok($$select public.set_app_colour('teal', false)$$, 'a platform admin picks a colour');
select is((select app_colour from public.app_branding()), 'teal', 'the colour is saved');
select is((select app_colour_logo from public.app_branding()), false, 'the logo choice is saved');
select lives_ok($$select public.set_app_colour(' #F59E0B ', true)$$, 'a custom colour is saved');
select is((select app_colour from public.app_branding()), '#f59e0b', 'tidied to lower case');
select throws_ok($$select public.set_app_colour('#fff', true)$$, '23514', null,
  'a short hex is refused');
select throws_ok($$select public.set_app_colour('red; background: url(x)', true)$$, '23514', null,
  'anything that is not a colour is refused, since it ends up in the page''s styles');
reset role;

select ok(
  (select count(*) from public.audit_events
   where action = 'organization.updated' and metadata -> 'changed' ? 'app_colour') >= 1,
  'changing the colour writes an audit event');

select * from finish();
rollback;
