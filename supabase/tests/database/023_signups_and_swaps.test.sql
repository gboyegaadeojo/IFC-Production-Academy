-- Sign-ups and swaps (decision record 9, stage 3).
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
--   Scheduler  a5000000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Avery      a5000000-0000-4000-8000-000000000002  (on the Fake Spot team)
--   Blake      a5000000-0000-4000-8000-000000000003  (on the Fake Spot team)
--   Casey      a5000000-0000-4000-8000-000000000004  (Camera member, not on the team)
select pg_temp.new_user('a5000000-0000-4000-8000-000000000001', 'Test Scheduler');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000002', 'Test Avery');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000003', 'Test Blake');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000004', 'Test Casey');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a5000000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000002', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000003', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000004', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Spot');
insert into ctx values ('role', (select id from public.serving_roles where name = 'Fake Spot'));
insert into public.serving_team_members (role_id, department_id, user_id) values
  ((select id from ctx where key = 'role'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000002'),
  ((select id from ctx where key = 'role'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000003');

-- A service with one open position, sign-ups closed.
select pg_temp.act_as('a5000000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at)
  values ('Fake signup service', now() + interval '5 days', now() + interval '5 days 2 hours');
insert into ctx values ('event', (select id from public.events where title = 'Fake signup service'));
insert into ctx values ('pos', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'role')));
reset role;

-- ---------------------------------------------------------------------------
-- Sign-ups
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a5000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.my_open_spots()), 0, 'nothing to sign up for while sign-ups are closed');
select throws_ok(
  $$ select public.sign_up_for_position((select id from ctx where key = 'pos')) $$,
  'P0001', 'signups_closed', 'sign-ups are closed until a scheduler opens them'
);
select throws_ok(
  $$ select public.set_event_signups((select id from ctx where key = 'event'), true) $$,
  '42501', 'not_authorized', 'volunteers cannot open sign-ups'
);
reset role;

select pg_temp.act_as('a5000000-0000-4000-8000-000000000001');
select public.set_event_signups((select id from ctx where key = 'event'), true);
reset role;

select pg_temp.act_as('a5000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.my_open_spots()), 0, 'people off the team see no open spots');
select throws_ok(
  $$ select public.sign_up_for_position((select id from ctx where key = 'pos')) $$,
  'P0001', 'not_on_team', 'and cannot sign up'
);
reset role;

select pg_temp.act_as('a5000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.my_open_spots()), 1, 'a team member sees the open spot');
select lives_ok(
  $$ select public.sign_up_for_position((select id from ctx where key = 'pos')) $$,
  'and signs up'
);
reset role;
select is(
  (select status::text from public.event_assignments where position_id = (select id from ctx where key = 'pos')),
  'confirmed', 'a sign-up is confirmed straight away'
);
select is(
  (select count(*)::int from public.notifications
    where user_id = 'a5000000-0000-4000-8000-000000000002' and kind = 'assignment_scheduled'),
  0, 'nobody is asked to confirm a spot they chose'
);

select pg_temp.act_as('a5000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.my_open_spots()), 0, 'a filled spot is no longer open');
select throws_ok(
  $$ select public.sign_up_for_position((select id from ctx where key = 'pos')) $$,
  'P0001', 'position_filled', 'one person per position'
);
reset role;

-- ---------------------------------------------------------------------------
-- Swaps
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a5000000-0000-4000-8000-000000000002');
insert into ctx values ('request', public.request_cover(
  (select id from public.event_assignments where position_id = (select id from ctx where key = 'pos') and status = 'confirmed'),
  'Family visiting'));
reset role;
select is(
  (select count(*)::int from public.notifications
    where user_id = 'a5000000-0000-4000-8000-000000000003' and kind = 'cover_requested'),
  1, 'a free teammate is asked'
);
select is(
  (select count(*)::int from public.notifications
    where user_id = 'a5000000-0000-4000-8000-000000000004' and kind = 'cover_requested'),
  0, 'people off the team are not'
);
select ok(
  exists (select 1 from public.notifications
    where user_id = 'a5000000-0000-4000-8000-000000000001' and kind = 'schedule_update'),
  'the scheduler is told'
);

select pg_temp.act_as('a5000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.cover_requests_for_me()), 0, 'people off the team cannot take it');
select throws_ok(
  $$ select public.take_cover((select id from ctx where key = 'request')) $$,
  'P0001', 'not_on_team', 'even directly'
);
reset role;

select pg_temp.act_as('a5000000-0000-4000-8000-000000000003');
select is((select note from public.cover_requests_for_me()), 'Family visiting', 'a teammate sees the request and its note');
select lives_ok(
  $$ select public.take_cover((select id from ctx where key = 'request')) $$,
  'a teammate takes it'
);
select throws_ok(
  $$ select public.take_cover((select id from ctx where key = 'request')) $$,
  'P0001', 'request_closed', 'a request is taken once'
);
reset role;

select is(
  (select array_agg(user_id::text || ':' || status::text order by assigned_at)
     from public.event_assignments where position_id = (select id from ctx where key = 'pos')),
  array['a5000000-0000-4000-8000-000000000002:cancelled', 'a5000000-0000-4000-8000-000000000003:confirmed'],
  'the original is cancelled, never deleted, and the teammate is confirmed'
);
select ok(
  exists (select 1 from public.notifications
    where user_id = 'a5000000-0000-4000-8000-000000000002' and kind = 'schedule_update'
      and title like 'Test Blake is covering%'),
  'the person who asked is told who is covering'
);

-- Withdrawing a request leaves the assignment as it was.
select pg_temp.act_as('a5000000-0000-4000-8000-000000000003');
insert into ctx values ('request2', public.request_cover(
  (select id from public.event_assignments where position_id = (select id from ctx where key = 'pos') and status = 'confirmed'), ''));
select lives_ok($$ select public.withdraw_cover_request((select id from ctx where key = 'request2')) $$, 'a request is withdrawn');
reset role;
select is(
  (select status::text from public.cover_requests where id = (select id from ctx where key = 'request2')),
  'withdrawn', 'and marked so'
);

-- Services made from a type take its sign-up setting.
select pg_temp.act_as('a5000000-0000-4000-8000-000000000001');
insert into ctx values ('type', public.save_service_type(null, 'Fake signup type', '10:00', 60, '', ''));
select public.set_service_type_signups((select id from ctx where key = 'type'), true);
select public.create_services((select id from ctx where key = 'type'), array[current_date + 9]);
reset role;
select ok(
  (select signups_open from public.events where service_type_id = (select id from ctx where key = 'type')),
  'services made from a type with sign-ups open start open'
);

select * from finish();
rollback;
