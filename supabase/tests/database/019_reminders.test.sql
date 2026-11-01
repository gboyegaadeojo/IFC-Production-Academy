-- Reminders: SRS-NOTIF-001..006, ADD-NOTIF-01, ADD-SCHED-01, ADD-ASSESS-01, SRS-COMP-009 (decision 8).
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
create function pg_temp.count_for(p_user uuid, p_kind text) returns integer language sql as $$
  select count(*)::int from public.notifications where user_id = p_user and kind::text = p_kind;
$$;

-- Test people (all fake):
--   Volunteer       f1000000-0000-4000-8000-000000000001  (approved for the role)
--   Supervised      f1000000-0000-4000-8000-000000000002  (not approved; serves supervised)
--   Supervisor      f1000000-0000-4000-8000-000000000003  (approved for the role)
--   Learner         f1000000-0000-4000-8000-000000000006
--   Camera Leader   f1000000-0000-4000-8000-000000000004
--   Director        f1000000-0000-4000-8000-000000000005  (organisation-wide)
select pg_temp.new_user('f1000000-0000-4000-8000-000000000001', 'Test Volunteer');
select pg_temp.new_user('f1000000-0000-4000-8000-000000000002', 'Test Supervised');
select pg_temp.new_user('f1000000-0000-4000-8000-000000000003', 'Test Supervisor');
select pg_temp.new_user('f1000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('f1000000-0000-4000-8000-000000000005', 'Test Director');
select pg_temp.new_user('f1000000-0000-4000-8000-000000000006', 'Test Learner');
insert into public.user_roles (user_id, role_id, department_id) values
  ('f1000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('f1000000-0000-4000-8000-000000000005', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null);
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'f1000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'f1000000-0000-4000-8000-000000000002', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'f1000000-0000-4000-8000-000000000003', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'f1000000-0000-4000-8000-000000000006', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select pg_temp.act_as('f1000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.queue_reminders() $$, '42501', null, 'only the email job (service role) queues reminders');
reset role;

-- ---------------------------------------------------------------------------
-- An assessment request reaches the department's trainers straight away (ADD-ASSESS-01)
-- ---------------------------------------------------------------------------
insert into public.assessment_requests (user_id, course_id, practical_key, department_id)
values ('f1000000-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
        'cccccccc-0000-4000-8000-000000000044', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000004', 'assessment_requested'), 1,
  'the department''s leader hears a volunteer is ready');
select is(
  (select title from public.notifications where user_id = 'f1000000-0000-4000-8000-000000000004' and kind = 'assessment_requested'),
  'Test Volunteer is ready for an assessment', 'it names who is waiting');
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000005', 'assessment_requested'), 0,
  'the Production Director isn''t copied while the department has its own trainers');
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000001', 'assessment_requested'), 0,
  'the volunteer isn''t told about their own request');

-- After a week, the leaders hear it's still waiting.
update public.assessment_requests set requested_at = now() - interval '8 days'
 where user_id = 'f1000000-0000-4000-8000-000000000001';
select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000004', 'assessment_requested'), 2,
  'a request open for a week reminds the department''s leaders');

-- ---------------------------------------------------------------------------
-- Serving reminders (SRS-SCHED reminders, ADD-SCHED-01)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('f1000000-0000-4000-8000-000000000004');
insert into public.competencies (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake reminder skill');
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake operator');
insert into ctx values
  ('comp', (select id from public.competencies where name = 'Fake reminder skill')),
  ('role', (select id from public.serving_roles where name = 'Fake operator'));
select public.set_role_competencies((select id from ctx where key = 'role'), array[(select id from ctx where key = 'comp')]);
reset role;
select private.grant_competency('f1000000-0000-4000-8000-000000000001', (select id from ctx where key = 'comp'), null);
select private.grant_competency('f1000000-0000-4000-8000-000000000003', (select id from ctx where key = 'comp'), null);
insert into public.serving_team_members (role_id, department_id, user_id)
select (select id from ctx where key = 'role'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', u::uuid
from unnest(array['f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002',
                  'f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000006']) u;

-- Soon: an event later today or tomorrow, so its 10:00-two-days-before moment has passed.
select pg_temp.act_as('f1000000-0000-4000-8000-000000000004');
insert into public.events (title, starts_at, ends_at)
  values ('Fake soon service', now() + interval '6 hours', now() + interval '8 hours'),
         ('Fake later service', now() + interval '5 days', now() + interval '5 days 2 hours');
insert into ctx values
  ('soon', (select id from public.events where title = 'Fake soon service')),
  ('later', (select id from public.events where title = 'Fake later service'));
insert into ctx values
  ('soon1', public.add_event_position((select id from ctx where key = 'soon'), (select id from ctx where key = 'role'))),
  ('soon2', public.add_event_position((select id from ctx where key = 'soon'), (select id from ctx where key = 'role'))),
  ('later1', public.add_event_position((select id from ctx where key = 'later'), (select id from ctx where key = 'role')));
select public.assign_to_position((select id from ctx where key = 'soon1'), 'f1000000-0000-4000-8000-000000000001');
select public.assign_to_position((select id from ctx where key = 'soon2'), 'f1000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000003');
select public.assign_to_position((select id from ctx where key = 'later1'), 'f1000000-0000-4000-8000-000000000003');
reset role;
-- Scheduled a week ago.
update public.event_assignments set assigned_at = now() - interval '7 days';

select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000001', 'serving_reminder'), 0,
  'nothing "serving soon" until the volunteer confirms; the soon event is too close for "please confirm"');
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000003', 'serving_reminder'), 1,
  'an assignment still unconfirmed after 48 hours asks the volunteer to confirm');
select is(
  (select title from public.notifications where user_id = 'f1000000-0000-4000-8000-000000000003' and kind = 'serving_reminder'),
  'Please confirm: Fake operator', 'the confirm reminder names the role');

select pg_temp.act_as('f1000000-0000-4000-8000-000000000001');
select public.respond_to_assignment((select id from public.event_assignments where position_id = (select id from ctx where key = 'soon1')), 'confirmed');
reset role;
select pg_temp.act_as('f1000000-0000-4000-8000-000000000002');
select public.respond_to_assignment((select id from public.event_assignments where position_id = (select id from ctx where key = 'soon2')), 'confirmed');
reset role;

select public.queue_reminders();
select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000001', 'serving_reminder'), 1,
  'a confirmed volunteer is reminded once, however often the job runs');
select is(
  (select title from public.notifications where user_id = 'f1000000-0000-4000-8000-000000000001' and kind = 'serving_reminder'),
  'Serving soon: Fake operator', 'the reminder says what they''re serving as');
select is(
  (select count(*)::int from public.notifications
    where user_id = 'f1000000-0000-4000-8000-000000000003' and title = 'You''re supervising Test Supervised'),
  1, 'the supervisor is reminded who they''re supervising');

-- Assigned after the reminder moment: they've just had the scheduling email, so no second one.
select pg_temp.act_as('f1000000-0000-4000-8000-000000000004');
insert into ctx values ('soon3', public.add_event_position((select id from ctx where key = 'soon'), (select id from ctx where key = 'role')));
select public.assign_to_position((select id from ctx where key = 'soon3'), 'f1000000-0000-4000-8000-000000000006',
  'f1000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.act_as('f1000000-0000-4000-8000-000000000006');
select public.respond_to_assignment((select id from public.event_assignments where position_id = (select id from ctx where key = 'soon3')), 'confirmed');
reset role;
select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000006', 'serving_reminder'), 0,
  'someone scheduled at the last minute isn''t sent a second reminder');

-- ---------------------------------------------------------------------------
-- Keep going (ADD-NOTIF-01)
-- ---------------------------------------------------------------------------
insert into public.lesson_progress (user_id, lesson_id, lesson_key, course_id, course_version_id, department_id,
                                    status, started_at, last_viewed_at, created_at, updated_at)
select 'f1000000-0000-4000-8000-000000000006', l.id, l.lesson_key, 'cccccccc-0000-4000-8000-000000000001',
       l.course_version_id, 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'in_progress',
       now() - interval '8 days', now() - interval '8 days', now() - interval '8 days', now() - interval '8 days'
from public.lessons l where l.course_version_id = 'cccccccc-0000-4000-8000-000000000011';
select public.queue_reminders();
select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000006', 'learning_nudge'), 1,
  'a course untouched for a week nudges the learner once');
select is(
  (select body from public.notifications where user_id = 'f1000000-0000-4000-8000-000000000006' and kind = 'learning_nudge'),
  'Your next lesson is Sample lesson.', 'the nudge names the next lesson');

-- Backdate without the updated_at trigger.
set local session_replication_role = replica;
update public.lesson_progress set last_viewed_at = now() - interval '22 days', updated_at = now() - interval '22 days'
 where user_id = 'f1000000-0000-4000-8000-000000000006';
set local session_replication_role = origin;
select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000006', 'learning_nudge'), 2,
  'and once more at three weeks');

-- Backdate without the updated_at trigger.
set local session_replication_role = replica;
update public.lesson_progress set last_viewed_at = now() - interval '90 days', updated_at = now() - interval '90 days'
 where user_id = 'f1000000-0000-4000-8000-000000000006';
set local session_replication_role = origin;
select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000006', 'learning_nudge'), 2,
  'long-abandoned courses aren''t nagged');

-- Waiting for an assessment isn't a stall.
insert into public.lesson_progress (user_id, lesson_id, lesson_key, course_id, course_version_id, department_id,
                                    status, started_at, last_viewed_at, created_at, updated_at)
select 'f1000000-0000-4000-8000-000000000001', l.id, l.lesson_key, 'cccccccc-0000-4000-8000-000000000001',
       l.course_version_id, 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'in_progress',
       now() - interval '8 days', now() - interval '8 days', now() - interval '8 days', now() - interval '8 days'
from public.lessons l where l.course_version_id = 'cccccccc-0000-4000-8000-000000000011';
select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000001', 'learning_nudge'), 0,
  'no nudge while an assessment request is open');

-- ---------------------------------------------------------------------------
-- Competency expiring (SRS-COMP-009)
-- ---------------------------------------------------------------------------
update public.competency_records set expires_at = now() + interval '10 days'
 where user_id = 'f1000000-0000-4000-8000-000000000001' and competency_id = (select id from ctx where key = 'comp');
select public.queue_reminders();
select public.queue_reminders();
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000001', 'competency_expiring'), 1,
  'the volunteer hears a month ahead that an approval expires, once');
select is(pg_temp.count_for('f1000000-0000-4000-8000-000000000004', 'competency_expiring'), 1,
  'and so does the department''s leader');

select * from finish();
rollback;
