-- Blockout dates like Planning Center's (plan "Academy scheduling", PR 7).
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
--   Lead   a7900000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Ada    a7900000-0000-4000-8000-000000000002  camera team
select pg_temp.new_user('a7900000-0000-4000-8000-000000000001', 'Test Blockout Lead', 'lead.blockout@example.com');
select pg_temp.new_user('a7900000-0000-4000-8000-000000000002', 'Test Ada Blockout', 'ada.blockout@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7900000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
create temporary table days (key text primary key, day date);
grant all on days to authenticated;
-- A Sunday at least two weeks away, and the Sunday and Monday a week before it.
insert into days values ('sunday', current_date + 14 + ((7 - extract(dow from current_date + 14)::int) % 7));
insert into days values ('week_before', (select day from days where key = 'sunday') - 7),
                        ('monday_before', (select day from days where key = 'sunday') - 6);

insert into public.serving_roles (department_id, name)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake blockout camera');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake blockout camera'));
insert into public.department_memberships (department_id, user_id, status, decided_at)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7900000-0000-4000-8000-000000000002', 'active', now())
on conflict do nothing;
insert into public.serving_team_members (role_id, department_id, user_id)
values ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7900000-0000-4000-8000-000000000002');

-- A Sunday service, 10:30 to 12:00.
select pg_temp.act_as('a7900000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at) values ('Fake blockout Sunday',
  ((select day from days where key = 'sunday') + time '10:30') at time zone 'Etc/GMT+5',
  ((select day from days where key = 'sunday') + time '12:00') at time zone 'Etc/GMT+5');
insert into ctx values ('event', (select id from public.events where title = 'Fake blockout Sunday'));
reset role;

create function pg_temp.blocked() returns boolean language sql as $$
  select private.is_unavailable('a7900000-0000-4000-8000-000000000002', (select id from ctx where key = 'event'));
$$;
create function pg_temp.clear() returns void language sql as $$
  delete from public.unavailability where user_id = 'a7900000-0000-4000-8000-000000000002';
$$;

-- Part of a day counts only when it overlaps the service.
select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select public.add_blockout((select day from days where key = 'sunday'), (select day from days where key = 'sunday'),
  'Early appointment', '08:00', '09:00', null);
reset role;
select is(pg_temp.blocked(), false, 'a morning blockout that ends before the service doesn''t count');
select pg_temp.clear();

select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select public.add_blockout((select day from days where key = 'sunday'), (select day from days where key = 'sunday'),
  'Kids'' recital', '10:00', '11:00', null);
reset role;
select is(pg_temp.blocked(), true, 'one that overlaps the service does');
select is(private.blockout_note('a7900000-0000-4000-8000-000000000002', (select id from ctx where key = 'event')),
  'Kids'' recital', 'and its reason is what schedulers see');
select pg_temp.clear();

-- Repeating, on the first day's weekday.
select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select public.add_blockout((select day from days where key = 'week_before'),
  (select day from days where key = 'sunday') + 60, '', null, null, 'weekly');
reset role;
select is(pg_temp.blocked(), true, 'every Sunday covers the service');
select is(private.blockout_note('a7900000-0000-4000-8000-000000000002', (select id from ctx where key = 'event')),
  'Away', 'a blockout with no reason reads Away');
select pg_temp.clear();

select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select public.add_blockout((select day from days where key = 'monday_before'),
  (select day from days where key = 'sunday') + 60, '', null, null, 'weekly');
reset role;
select is(pg_temp.blocked(), false, 'every Monday doesn''t');
select pg_temp.clear();

select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select public.add_blockout((select day from days where key = 'week_before'),
  (select day from days where key = 'sunday') + 60, '', null, null, 'every_other_week');
reset role;
select is(pg_temp.blocked(), false, 'every other Sunday skips the week after it starts');
select pg_temp.clear();

-- Ranges, as before.
select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select public.add_blockout((select day from days where key = 'sunday') - 1, (select day from days where key = 'sunday') + 1,
  'Family visit');
reset role;
select is(pg_temp.blocked(), true, 'a date range covers the days in it');
select pg_temp.clear();

-- Checks.
select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.add_blockout(current_date + 1, current_date + 2, '', '08:00', '09:00', null) $$,
  '22023', 'invalid_dates', 'part of a day is on one day');
select throws_ok(
  $$ select public.add_blockout(current_date + 1, current_date + 1, '', '09:00', '08:00', null) $$,
  '22023', 'invalid_dates', 'and ends after it starts');
select throws_ok(
  $$ select public.add_blockout(current_date + 1, current_date + 400, '', null, null, 'weekly') $$,
  '22023', 'invalid_dates', 'within a year');
select throws_ok(
  $$ select public.add_blockout(current_date + 1, current_date + 30, '', null, null, 'daily') $$,
  '22023', 'invalid_dates', 'only the repeats on offer');
reset role;

-- A blockout over a service someone is already on tells the scheduler.
select pg_temp.act_as('a7900000-0000-4000-8000-000000000001');
insert into ctx values
  ('place', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam')));
select public.assign_to_position((select id from ctx where key = 'place'), 'a7900000-0000-4000-8000-000000000002');
reset role;
select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select public.add_blockout((select day from days where key = 'sunday'), (select day from days where key = 'sunday'),
  'Out of town');
reset role;
select ok(
  exists (select 1 from public.notifications
          where user_id = 'a7900000-0000-4000-8000-000000000001' and kind = 'schedule_update'
            and title = 'Blocked out: Test Ada Blockout'),
  'the scheduler is told when someone blocks out a service they''re on');

select * from finish();
rollback;
