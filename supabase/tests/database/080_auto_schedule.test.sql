-- Auto-schedule and scheduling preferences (plan "Academy scheduling", PR 8).
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

update public.organizations set scheduling_source = 'academy';

-- Test people (all fake):
--   Lead   a8000000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Ada    a8000000-0000-4000-8000-000000000002  camera team
--   Ben    a8000000-0000-4000-8000-000000000003  camera team, at most once a month
--   Cleo   a8000000-0000-4000-8000-000000000004  camera team, blocked out that day
select pg_temp.new_user('a8000000-0000-4000-8000-000000000001', 'Test Auto Lead', 'lead.auto@example.com');
select pg_temp.new_user('a8000000-0000-4000-8000-000000000002', 'Test Ada Auto', 'ada.auto@example.com');
select pg_temp.new_user('a8000000-0000-4000-8000-000000000003', 'Test Ben Auto', 'ben.auto@example.com');
select pg_temp.new_user('a8000000-0000-4000-8000-000000000004', 'Test Cleo Auto', 'cleo.auto@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8000000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
create temporary table days (key text primary key, day date);
grant all on days to authenticated;
-- The 11th of a month at least 40 days away, and the 14th: always the same month.
insert into days values ('day', date_trunc('month', current_date + 40)::date + 10);
insert into days values ('later', (select day from days where key = 'day') + 3);

insert into public.serving_roles (department_id, name)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake auto camera');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake auto camera'));
insert into public.department_memberships (department_id, user_id, status, decided_at)
select 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', u::uuid, 'active', now()
from unnest(array['a8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000003',
                  'a8000000-0000-4000-8000-000000000004']) u
on conflict do nothing;
insert into public.serving_team_members (role_id, department_id, user_id)
select (select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', u::uuid
from unnest(array['a8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000003',
                  'a8000000-0000-4000-8000-000000000004']) u;

-- Services: a morning service with two places and an evening one with one, the same day, and
-- another three days later with one.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at) values
  ('Fake auto morning', ((select day from days where key = 'day') + time '10:30') at time zone 'America/Winnipeg',
                        ((select day from days where key = 'day') + time '12:00') at time zone 'America/Winnipeg'),
  ('Fake auto evening', ((select day from days where key = 'day') + time '18:00') at time zone 'America/Winnipeg',
                        ((select day from days where key = 'day') + time '19:30') at time zone 'America/Winnipeg'),
  ('Fake auto later', ((select day from days where key = 'later') + time '10:30') at time zone 'America/Winnipeg',
                      ((select day from days where key = 'later') + time '12:00') at time zone 'America/Winnipeg');
insert into ctx values
  ('morning', (select id from public.events where title = 'Fake auto morning')),
  ('evening', (select id from public.events where title = 'Fake auto evening')),
  ('later', (select id from public.events where title = 'Fake auto later'));
insert into ctx values
  ('m1', public.add_event_position((select id from ctx where key = 'morning'), (select id from ctx where key = 'cam'))),
  ('m2', public.add_event_position((select id from ctx where key = 'morning'), (select id from ctx where key = 'cam'))),
  ('e1', public.add_event_position((select id from ctx where key = 'evening'), (select id from ctx where key = 'cam'))),
  ('l1', public.add_event_position((select id from ctx where key = 'later'), (select id from ctx where key = 'cam')));
-- Ben is already on the later service this month.
select public.assign_to_position((select id from ctx where key = 'l1'), 'a8000000-0000-4000-8000-000000000003');
reset role;

-- Ben serves at most once a month; Cleo is away that day.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000003');
select lives_ok($$ select public.set_my_scheduling_preferences(1, null, null) $$,
  'a volunteer says how often they''d like to serve');
select throws_ok($$ select public.set_my_scheduling_preferences(9, null, null) $$,
  '22023', 'invalid_preferences', 'at most eight times a month');
reset role;
insert into public.unavailability (user_id, starts_on, ends_on, note)
values ('a8000000-0000-4000-8000-000000000004', (select day from days where key = 'day'),
        (select day from days where key = 'day'), 'Away');

create temporary table proposal (position_id uuid, user_id uuid, display_name text, reason text);
grant all on proposal to authenticated;

-- Only schedulers ask for suggestions.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.propose_schedule(array[(select id from ctx where key = 'morning')]) $$,
  '42501', 'not_authorized', 'volunteers cannot auto-schedule');
reset role;

select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
insert into proposal select * from public.propose_schedule(array[
  (select id from ctx where key = 'morning'), (select id from ctx where key = 'evening')]);
reset role;

select is((select count(*)::int from proposal), 3, 'every open place gets a line');
select is((select user_id from proposal where position_id = (select id from ctx where key = 'm1')),
  'a8000000-0000-4000-8000-000000000002'::uuid, 'Ada is suggested for the first place');
select ok((select reason like '%hasn''t served yet%' and reason like '%1 this month%' from proposal
           where position_id = (select id from ctx where key = 'm1')),
  'with the reasons');
select is((select user_id from proposal where position_id = (select id from ctx where key = 'm2')), null,
  'nobody else: Ben has served his once this month and Cleo is away');
select is((select user_id from proposal where position_id = (select id from ctx where key = 'e1')), null,
  'and Ada isn''t suggested twice the same day');
select is((select reason from proposal where position_id = (select id from ctx where key = 'e1')),
  'No one on the team is free', 'an open place says why');
select is((select count(*)::int from public.event_assignments where event_id = (select id from ctx where key = 'morning')), 0,
  'suggesting adds nobody');

-- Keeping the suggestions adds them, not sent yet.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select is(public.apply_schedule_proposal(
  (select jsonb_agg(jsonb_build_object('position_id', position_id, 'user_id', user_id))
     from proposal where user_id is not null)), 1, 'the kept suggestion is added');
select is(public.apply_schedule_proposal(
  (select jsonb_agg(jsonb_build_object('position_id', position_id, 'user_id', user_id))
     from proposal where user_id is not null)), 0, 'keeping again adds nobody twice');
reset role;
select is(
  (select request_sent_at from public.event_assignments where position_id = (select id from ctx where key = 'm1')),
  null, 'they''re Not sent yet');

-- Household: Cleo is back, and wants to serve apart from Ada, then with her.
delete from public.unavailability where user_id = 'a8000000-0000-4000-8000-000000000004';
select pg_temp.act_as('a8000000-0000-4000-8000-000000000004');
select ok(exists (select 1 from public.household_options() where user_id = 'a8000000-0000-4000-8000-000000000002'),
  'teammates can be chosen as household');
select public.set_my_scheduling_preferences(null, 'a8000000-0000-4000-8000-000000000002', 'apart');
reset role;
select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select is(
  (select user_id from public.propose_schedule(array[(select id from ctx where key = 'morning')])
    where position_id = (select id from ctx where key = 'm2')),
  null, 'apart: not the same service as her household');
reset role;

select pg_temp.act_as('a8000000-0000-4000-8000-000000000004');
select public.set_my_scheduling_preferences(null, 'a8000000-0000-4000-8000-000000000002', 'together');
reset role;
select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select ok(
  (select user_id = 'a8000000-0000-4000-8000-000000000004' and reason like 'serves with Test Ada Auto%'
     from public.propose_schedule(array[(select id from ctx where key = 'morning')])
    where position_id = (select id from ctx where key = 'm2')),
  'together: suggested alongside her household, and it says so');
reset role;

select pg_temp.act_as('a8000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.scheduling_preferences), 0,
  'volunteers don''t see other people''s preferences');
reset role;

select * from finish();
rollback;
