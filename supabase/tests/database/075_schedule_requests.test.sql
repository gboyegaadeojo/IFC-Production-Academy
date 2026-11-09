-- "Not sent yet" and Send requests (plan "Academy scheduling", PR 3): scheduling someone doesn't
-- email them; sending does, once per person for everything they're on at the service.
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
--   Lead   a7500000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Ada    a7500000-0000-4000-8000-000000000002  on both teams
--   Ben    a7500000-0000-4000-8000-000000000003  on the camera team
select pg_temp.new_user('a7500000-0000-4000-8000-000000000001', 'Test Request Lead', 'lead.request@example.com');
select pg_temp.new_user('a7500000-0000-4000-8000-000000000002', 'Test Ada Request', 'ada.request@example.com');
select pg_temp.new_user('a7500000-0000-4000-8000-000000000003', 'Test Ben Request', 'ben.request@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7500000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake request camera'),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake request director');
insert into ctx values
  ('cam', (select id from public.serving_roles where name = 'Fake request camera')),
  ('dir', (select id from public.serving_roles where name = 'Fake request director'));
insert into public.department_memberships (department_id, user_id, status, decided_at)
select 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', u::uuid, 'active', now()
from unnest(array['a7500000-0000-4000-8000-000000000002', 'a7500000-0000-4000-8000-000000000003']) u
on conflict do nothing;
insert into public.serving_team_members (role_id, department_id, user_id) values
  ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7500000-0000-4000-8000-000000000002'),
  ((select id from ctx where key = 'dir'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7500000-0000-4000-8000-000000000002'),
  ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7500000-0000-4000-8000-000000000003');

create function pg_temp.count_for(p_user uuid) returns integer language sql as $$
  select count(*)::int from public.notifications n
  where n.user_id = p_user and n.kind = 'assignment_scheduled';
$$;

-- A service needing two camera places and a director.
select pg_temp.act_as('a7500000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at)
  values ('Fake request Sunday', now() + interval '6 days', now() + interval '6 days 90 minutes');
insert into ctx values ('event', (select id from public.events where title = 'Fake request Sunday'));
insert into ctx values
  ('cam1', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam'))),
  ('cam2', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam'))),
  ('dir1', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'dir')));

-- Ada on camera and director at the same service: a warning, not a block.
select lives_ok($$ select public.assign_to_position((select id from ctx where key = 'cam1'), 'a7500000-0000-4000-8000-000000000002') $$,
  'Ada is added to a camera place');
select lives_ok($$ select public.assign_to_position((select id from ctx where key = 'dir1'), 'a7500000-0000-4000-8000-000000000002') $$,
  'and to director at the same service');
select lives_ok($$ select public.assign_to_position((select id from ctx where key = 'cam2'), 'a7500000-0000-4000-8000-000000000003') $$,
  'Ben fills the second camera place');
select is((select count(*)::int from public.event_conflicts((select id from ctx where key = 'event'))), 2,
  'both of Ada''s places carry a warning, Ben''s none');
reset role;

select is(pg_temp.count_for('a7500000-0000-4000-8000-000000000002'), 0, 'nobody is emailed when scheduled');
select is(
  (select count(*)::int from public.event_assignments
    where event_id = (select id from ctx where key = 'event') and request_sent_at is null),
  3, 'everyone is "Not sent yet"');

-- Volunteers can't send requests or see warnings.
select pg_temp.act_as('a7500000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.send_assignment_requests((select id from ctx where key = 'event'),
       array(select id from public.event_assignments), null) $$,
  '42501', 'not_authorized', 'volunteers cannot send requests');
select throws_ok($$ select * from public.event_conflicts((select id from ctx where key = 'event')) $$,
  '42501', 'not_authorized', 'or see the warnings');
reset role;

-- Send to Ada only.
select pg_temp.act_as('a7500000-0000-4000-8000-000000000001');
select is(
  public.send_assignment_requests((select id from ctx where key = 'event'),
    array(select a.id from public.event_assignments a
          where a.event_id = (select id from ctx where key = 'event')
            and a.user_id = 'a7500000-0000-4000-8000-000000000002'),
    'Rehearsal starts early.'),
  1, 'one person is asked');
select is(
  public.send_assignment_requests((select id from ctx where key = 'event'),
    array(select a.id from public.event_assignments a
          where a.event_id = (select id from ctx where key = 'event')
            and a.user_id = 'a7500000-0000-4000-8000-000000000002'),
    null),
  0, 'sending again asks nobody twice');
reset role;

select is(pg_temp.count_for('a7500000-0000-4000-8000-000000000002'), 1,
  'Ada gets one request for both places');
select is(
  (select title from public.notifications
    where user_id = 'a7500000-0000-4000-8000-000000000002' and kind = 'assignment_scheduled'),
  'Please accept: Fake request camera, Fake request director', 'it names every place');
select ok(
  (select body like '%Rehearsal starts early.' from public.notifications
    where user_id = 'a7500000-0000-4000-8000-000000000002' and kind = 'assignment_scheduled'),
  'with the scheduler''s message');
select is(pg_temp.count_for('a7500000-0000-4000-8000-000000000003'), 0, 'Ben, held back, isn''t asked');
select ok(exists (select 1 from public.audit_events where action = 'schedule.requests_sent'),
  'sending is in the audit log');

-- Ben's place isn't his to see until it's sent; Ada sees hers.
select pg_temp.act_as('a7500000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.event_assignments where request_sent_at is not null), 2,
  'Ada sees the places she was asked about');
reset role;

-- A "please confirm" reminder counts from when the request was sent.
update public.event_assignments set assigned_at = now() - interval '7 days'
 where event_id = (select id from ctx where key = 'event');
select public.queue_reminders();
select is(
  (select count(*)::int from public.notifications
    where user_id = 'a7500000-0000-4000-8000-000000000003' and kind = 'serving_reminder'),
  0, 'nobody is reminded of a request that hasn''t gone out');
update public.event_assignments set request_sent_at = now() - interval '7 days'
 where event_id = (select id from ctx where key = 'event') and request_sent_at is not null;
select public.queue_reminders();
select is(
  (select count(*)::int from public.notifications
    where user_id = 'a7500000-0000-4000-8000-000000000002' and kind = 'serving_reminder'),
  2, 'a request sent two days ago and still unanswered is reminded');

select * from finish();
rollback;
