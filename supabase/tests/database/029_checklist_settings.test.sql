-- Checklist settings (checklist app US-07, US-11a, US-15): the service type the checklist
-- follows, and the service day it opens for when nothing is published.
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
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

update public.organizations set scheduling_source = 'planning_center';
-- Nothing on the schedule, so the checklist has a service day to open.
update public.events set cancelled_at = now() where cancelled_at is null;

-- Test people (all fake):
--   Director    aa000000-0000-4000-8000-000000000001  (Production Director: church-wide checklist.manage)
--   Volunteer   aa000000-0000-4000-8000-000000000002  (not on a position's team)
--   Crew        aa000000-0000-4000-8000-000000000003  (on the Camera position's team)
select pg_temp.new_user('aa000000-0000-4000-8000-000000000001', 'Test Settings Director');
select pg_temp.new_user('aa000000-0000-4000-8000-000000000002', 'Test Settings Volunteer');
select pg_temp.new_user('aa000000-0000-4000-8000-000000000003', 'Test Settings Crew');
insert into public.user_roles (user_id, role_id, department_id) values
  ('aa000000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null);
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Settings Cam');
insert into public.department_memberships (department_id, user_id, status, decided_at)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'aa000000-0000-4000-8000-000000000003', 'active', now());
insert into public.serving_team_members (role_id, department_id, user_id)
select r.id, r.department_id, 'aa000000-0000-4000-8000-000000000003'
from public.serving_roles r where r.name = 'Fake Settings Cam';

insert into public.pco_service_types (id, organization_id, name, seen_at)
select x.id, o.id, x.name, now()
from public.organizations o, (values ('st-fake-sun', 'Fake Sunday Service'), ('st-fake-other', 'Fake Youth Night')) x(id, name);

create temporary table ctx (key text primary key, id uuid);
create temporary table vals (key text primary key, n integer);
grant all on ctx, vals to authenticated, service_role;
insert into vals values ('tomorrow_dow',
  extract(dow from (now() at time zone 'America/Winnipeg')::date + 1)::integer);

-- Only church-wide checklist managers see and change the settings.
select pg_temp.act_as('aa000000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.checklist_settings() $$, '42501', 'not_authorized',
  'volunteers cannot see the settings');
select throws_ok($$ select public.set_checklist_settings(null, 0) $$, '42501', 'not_authorized',
  'nor change them');
update public.organizations set service_weekday = 3;
reset role;
select is((select service_weekday::integer from public.organizations order by created_at limit 1), 0,
  'nor write them directly');
select pg_temp.act_as('aa000000-0000-4000-8000-000000000002');
select is(public.open_current_service(), null,
  'with nothing published, the checklist opens nothing for someone it isn''t for');

select pg_temp.act_as('aa000000-0000-4000-8000-000000000001');
select is((select service_weekday from public.checklist_settings()), 0, 'the service day starts as Sunday');
select is((select service_type_id from public.checklist_settings()), null, 'and every service type counts');
select is((select jsonb_array_length(service_types) from public.checklist_settings()), 2,
  'the director chooses from Planning Center''s service types');
select throws_ok($$ select public.set_checklist_settings('st-not-in-pco', 0) $$, '22023', 'invalid_settings',
  'a service type must come from Planning Center');
select throws_ok($$ select public.set_checklist_settings(null, 7) $$, '22023', 'invalid_settings',
  'and the day must be a day of the week');
select lives_ok($$ select public.set_checklist_settings('st-fake-sun', (select n from vals where key = 'tomorrow_dow')) $$,
  'the director follows the Sunday service type, on tomorrow''s weekday');
select is((select service_type_id from public.checklist_settings()), 'st-fake-sun', 'the settings are saved');
reset role;
select is((select count(*)::integer from public.checklist_log where action = 'settings' and kind = 'edit'), 1,
  'the change is in the activity log');
select pg_temp.act_as('aa000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_checklist_settings('st-fake-sun', (select n from vals where key = 'tomorrow_dow')) $$,
  'saving the same settings again is fine');
reset role;
select is((select count(*)::integer from public.checklist_log where action = 'settings'), 1,
  'and logs nothing new');

-- Nothing published: the checklist opens the next service day.
select pg_temp.act_as('aa000000-0000-4000-8000-000000000003');
select is(public.current_service(), null, 'nothing is published');
insert into ctx values ('opened', public.open_current_service());
select isnt((select id from ctx where key = 'opened'), null, 'the crew still get a checklist');
select is(public.open_current_service(), (select id from ctx where key = 'opened'), 'the same one every time');
select is(public.current_service(), (select id from ctx where key = 'opened'), 'and it is now the current service');
reset role;
select ok((select is_placeholder from public.events where id = (select id from ctx where key = 'opened')),
  'it is marked as opened by the checklist');
select is((select (starts_at at time zone 'America/Winnipeg')::date from public.events where id = (select id from ctx where key = 'opened')),
  (now() at time zone 'America/Winnipeg')::date + 1, 'for the next service day');
select is((select count(*)::integer from public.events where is_placeholder), 1, 'only one is opened');
select pg_temp.act_as('aa000000-0000-4000-8000-000000000003');
select throws_ok($$ insert into public.events (organization_id, title, starts_at, ends_at, is_placeholder)
                    select organization_id, 'Nope', now(), now() + interval '1 hour', true from public.profiles where id = auth.uid() $$,
  null, null, 'nobody opens a service directly');

-- Planning Center publishes that day: the Sunday plan takes over, the other type doesn't.
reset role;
select pg_temp.as_service();
select lives_ok($$ select public.sync_planning_center(jsonb_build_object(
  'from', now() - interval '1 day', 'to', now() + interval '60 days',
  'plans', jsonb_build_array(
    jsonb_build_object('id', 'plan-fake-other', 'service_type_id', 'st-fake-other', 'title', 'Fake Youth Night',
      'starts_at', (((now() at time zone 'America/Winnipeg')::date + 1 + time '09:00') at time zone 'America/Winnipeg'),
      'ends_at', (((now() at time zone 'America/Winnipeg')::date + 1 + time '10:00') at time zone 'America/Winnipeg')),
    jsonb_build_object('id', 'plan-fake-sun', 'service_type_id', 'st-fake-sun', 'title', 'Fake Sunday Service',
      'starts_at', (((now() at time zone 'America/Winnipeg')::date + 1 + time '10:00') at time zone 'America/Winnipeg'),
      'ends_at', (((now() at time zone 'America/Winnipeg')::date + 1 + time '12:00') at time zone 'America/Winnipeg'))))) $$,
  'the sync runs');
reset role;
select is((select external_id from public.events where id = (select id from ctx where key = 'opened')), 'plan-fake-sun',
  'the Sunday plan takes over the opened service, so its check-offs stay');
select ok(not (select is_placeholder from public.events where id = (select id from ctx where key = 'opened')),
  'which is no longer marked as opened');
select is((select pco_service_type_id from public.events where id = (select id from ctx where key = 'opened')), 'st-fake-sun',
  'and records its service type');
select is((select count(*)::integer from public.events where external_id in ('plan-fake-sun', 'plan-fake-other')), 2,
  'the other plan is a service of its own');

select pg_temp.act_as('aa000000-0000-4000-8000-000000000003');
select is(public.current_service(), (select id from ctx where key = 'opened'),
  'the checklist follows the chosen type, though the other starts earlier');

select pg_temp.act_as('aa000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_checklist_settings(null, 0) $$, 'the director clears the type');
select pg_temp.act_as('aa000000-0000-4000-8000-000000000003');
select is(public.current_service(), (select id from public.events where external_id = 'plan-fake-other'),
  'and the earliest service of any type is current again');

select * from finish();
rollback;
