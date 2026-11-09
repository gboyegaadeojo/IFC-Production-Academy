-- Files on a service, and the calendar link (plan "Academy scheduling", PR 10).
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
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

update public.organizations set scheduling_source = 'academy';

-- Test people (all fake):
--   Lead   a8200000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Ada    a8200000-0000-4000-8000-000000000002  asked to serve
--   Ben    a8200000-0000-4000-8000-000000000003  not serving
select pg_temp.new_user('a8200000-0000-4000-8000-000000000001', 'Test Files Lead', 'lead.files@example.com');
select pg_temp.new_user('a8200000-0000-4000-8000-000000000002', 'Test Ada Files', 'ada.files@example.com');
select pg_temp.new_user('a8200000-0000-4000-8000-000000000003', 'Test Ben Files', 'ben.files@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8200000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated, anon;
create temporary table feed (token text);
grant all on feed to authenticated, anon;
insert into public.serving_roles (department_id, name)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake files camera');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake files camera'));
insert into public.department_memberships (department_id, user_id, status, decided_at)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8200000-0000-4000-8000-000000000002', 'active', now())
on conflict do nothing;
insert into public.serving_team_members (role_id, department_id, user_id)
values ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8200000-0000-4000-8000-000000000002');

select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at)
  values ('Fake files Sunday', now() + interval '6 days', now() + interval '6 days 90 minutes');
insert into ctx values ('event', (select id from public.events where title = 'Fake files Sunday'));
insert into ctx values
  ('place', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam')));
select public.assign_to_position((select id from ctx where key = 'place'), 'a8200000-0000-4000-8000-000000000002');
reset role;

-- A stored file, as an upload leaves it.
insert into storage.objects (bucket_id, name)
values ('service-files', (select id from ctx where key = 'event') || '/plot.pdf');

select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.add_service_file((select id from ctx where key = 'event'), 'not-a-service/plot.pdf', 'Plot', 'application/pdf', 1000) $$,
  '22023', 'invalid_file', 'a file must be stored under its own service');
select lives_ok(
  $$ select public.add_service_file((select id from ctx where key = 'event'),
       (select id from ctx where key = 'event') || '/plot.pdf', 'Stage plot.pdf', 'application/pdf', 1000) $$,
  'a scheduler adds a file to a service');
reset role;

-- Ada hasn't been asked yet, so she can't see it; once asked, she can. Ben never can.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.service_files $$, 'not before the request is sent');
reset role;
select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
select public.send_assignment_requests((select id from ctx where key = 'event'),
  array(select id from public.event_assignments where position_id = (select id from ctx where key = 'place')), null);
reset role;
select pg_temp.act_as('a8200000-0000-4000-8000-000000000002');
select is((select name from public.service_files), 'Stage plot.pdf', 'someone asked to serve sees the service''s files');
select is((select count(*)::int from storage.objects where bucket_id = 'service-files'), 1,
  'and can open the stored file');
select throws_ok($$ select public.remove_service_file((select id from public.service_files limit 1)) $$,
  '42501', 'not_authorized', 'but not remove it');
reset role;
select pg_temp.act_as('a8200000-0000-4000-8000-000000000003');
select is_empty($$ select 1 from public.service_files $$, 'someone not serving sees nothing');
select is_empty($$ select 1 from storage.objects where bucket_id = 'service-files' $$, 'and opens nothing');
reset role;

select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
select is(public.remove_service_file((select id from public.service_files limit 1)),
  (select id from ctx where key = 'event') || '/plot.pdf', 'a scheduler removes it, and the app removes the stored file');
reset role;

-- The calendar link.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000002');
insert into feed select public.reset_my_calendar_feed();
select ok((select token ~ '^[0-9a-f]{48}$' from feed), 'Ada makes a calendar link');
select ok(public.my_calendar_feed_since() is not null, 'and the page knows she has one');
reset role;
select is((select count(*)::int from public.calendar_feeds where token_hash = private.feed_hash((select token from feed))), 1,
  'only a hash of the link is kept');

select pg_temp.as_anon();
select is(
  (select title from public.calendar_feed((select token from feed))),
  'Fake files Sunday', 'a calendar app reads her serving with the link, without signing in');
select is_empty($$ select 1 from public.calendar_feed(repeat('0', 48)) $$, 'a wrong link reads nothing');
select throws_ok($$ select 1 from public.calendar_feeds $$, '42501', null,
  'and nobody reads the links themselves');
reset role;

select pg_temp.act_as('a8200000-0000-4000-8000-000000000002');
select public.reset_my_calendar_feed();
reset role;
select pg_temp.as_anon();
select is_empty($$ select 1 from public.calendar_feed((select token from feed)) $$,
  'a new link stops the old one');
reset role;

select * from finish();
rollback;
