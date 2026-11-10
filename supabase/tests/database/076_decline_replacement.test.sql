-- A decline tells the scheduler and finds a free replacement (plan "Academy scheduling", PR 4).
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
--   Lead   a7600000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Ada    a7600000-0000-4000-8000-000000000002  camera team
--   Ben    a7600000-0000-4000-8000-000000000003  camera team
--   Cleo   a7600000-0000-4000-8000-000000000004  camera team, blocked out
select pg_temp.new_user('a7600000-0000-4000-8000-000000000001', 'Test Decline Lead', 'lead.decline@example.com');
select pg_temp.new_user('a7600000-0000-4000-8000-000000000002', 'Test Ada Decline', 'ada.decline@example.com');
select pg_temp.new_user('a7600000-0000-4000-8000-000000000003', 'Test Ben Decline', 'ben.decline@example.com');
select pg_temp.new_user('a7600000-0000-4000-8000-000000000004', 'Test Cleo Decline', 'cleo.decline@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7600000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake decline camera');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake decline camera'));
insert into public.department_memberships (department_id, user_id, status, decided_at)
select 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', u::uuid, 'active', now()
from unnest(array['a7600000-0000-4000-8000-000000000002', 'a7600000-0000-4000-8000-000000000003',
                  'a7600000-0000-4000-8000-000000000004']) u
on conflict do nothing;
insert into public.serving_team_members (role_id, department_id, user_id)
select (select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', u::uuid
from unnest(array['a7600000-0000-4000-8000-000000000002', 'a7600000-0000-4000-8000-000000000003',
                  'a7600000-0000-4000-8000-000000000004']) u;

select pg_temp.act_as('a7600000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at)
  values ('Fake decline Sunday', now() + interval '6 days', now() + interval '6 days 90 minutes');
insert into ctx values ('event', (select id from public.events where title = 'Fake decline Sunday'));
insert into ctx values
  ('place', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam')));
select public.assign_to_position((select id from ctx where key = 'place'), 'a7600000-0000-4000-8000-000000000002');
select public.send_assignment_requests((select id from ctx where key = 'event'),
  array(select id from public.event_assignments where position_id = (select id from ctx where key = 'place')), null);
reset role;

-- Cleo is blocked out that day.
insert into public.unavailability (user_id, starts_on, ends_on, note)
values ('a7600000-0000-4000-8000-000000000004',
        ((now() + interval '6 days') at time zone 'Etc/GMT+5')::date,
        ((now() + interval '6 days') at time zone 'Etc/GMT+5')::date, 'Away');

-- Ada declines: Ben is free, so he's added and asked; the lead is told.
select pg_temp.act_as('a7600000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.respond_to_assignment((select id from public.event_assignments
       where user_id = 'a7600000-0000-4000-8000-000000000002'), 'declined') $$,
  'Ada declines');
reset role;

select is(
  (select user_id from public.event_assignments
    where position_id = (select id from ctx where key = 'place') and status = 'pending'),
  'a7600000-0000-4000-8000-000000000003'::uuid,
  'the free teammate is added in her place, and the one blocked out isn''t');
select ok(
  (select request_sent_at is not null and override_reason = 'Added automatically after Test Ada Decline declined'
     from public.event_assignments
    where position_id = (select id from ctx where key = 'place') and status = 'pending'),
  'and asked straight away, with a note saying why');
select is(
  (select count(*)::int from public.notifications
    where user_id = 'a7600000-0000-4000-8000-000000000003' and kind = 'assignment_scheduled'),
  1, 'Ben gets the request');
select is(
  (select body from public.notifications
    where user_id = 'a7600000-0000-4000-8000-000000000001' and kind = 'schedule_update'
      and title = 'Declined: Fake decline camera'),
  'Test Ada Decline can''t serve at Fake decline Sunday, ' ||
    to_char((now() + interval '6 days') at time zone 'Etc/GMT+5', 'Dy Mon FMDD, FMHH12:MI AM') ||
    '. Test Ben Decline was free, so they were added and asked.',
  'the scheduler is told who declined and who was added');
select ok(exists (select 1 from public.audit_events where action = 'schedule.declined_replaced'),
  'the replacement is in the audit log');

-- Ben declines too: Ada has declined and Cleo is blocked out, so the place stays open.
select pg_temp.act_as('a7600000-0000-4000-8000-000000000003');
select public.respond_to_assignment((select id from public.event_assignments
  where user_id = 'a7600000-0000-4000-8000-000000000003' and status = 'pending'), 'declined');
reset role;
select is(
  (select count(*)::int from public.event_assignments
    where position_id = (select id from ctx where key = 'place') and status in ('pending', 'confirmed')),
  0, 'with nobody free, the place stays open');
select ok(
  exists (select 1 from public.notifications
          where user_id = 'a7600000-0000-4000-8000-000000000001' and kind = 'schedule_update'
            and body like '%No one else on the team is free, so the place is open.'),
  'and the scheduler is told');

select * from finish();
rollback;
