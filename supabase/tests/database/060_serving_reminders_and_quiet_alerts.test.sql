-- Serving reminders for Planning Center's services, the morning-of and assigned-course reminders,
-- quiet hours for phones, and one learning reminder a day.
begin;
select no_plan();
-- Start with the launch switch off, as it was before go-live.
update public.organizations set notifications_live = false;

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Quiet hours, at fixed times: well away from either edge, whichever offset the time zone uses.
select is(private.is_quiet_hour('2026-11-05T18:00:00Z'), false, 'midday isn''t quiet');
select is(private.is_quiet_hour('2026-11-05T08:00:00Z'), true, 'the small hours are quiet');

-- The morning of: only on the day, from 08:00, until it starts.
select is(private.serving_today_due('2026-11-08T22:00:00Z', '2026-11-08T18:00:00Z'), true,
  'due on the morning of the service');
select is(private.serving_today_due('2026-11-08T22:00:00Z', '2026-11-08T08:00:00Z'), false,
  'not before 08:00');
select is(private.serving_today_due('2026-11-08T22:00:00Z', '2026-11-07T18:00:00Z'), false,
  'not the day before');
select is(private.serving_today_due('2026-11-08T18:00:00Z', '2026-11-08T19:00:00Z'), false,
  'not once it has started');

-- Volunteer  aa000000-0000-4000-8000-000000000001
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'reminders-1@example.com', '{"display_name":"Fake Reminded"}', now(), now());

-- One learning reminder a day; serving reminders aren't limited.
select private.notify('aa000000-0000-4000-8000-000000000001', 'learning_nudge', 'Keep going: one', 'Fake', '/home', 'test-nudge-1');
select private.notify('aa000000-0000-4000-8000-000000000001', 'learning_nudge', 'Keep going: two', 'Fake', '/home', 'test-nudge-2');
select private.notify('aa000000-0000-4000-8000-000000000001', 'course_assigned', 'Still to start', 'Fake', '/home', 'assigned_reminder:test');
select private.notify('aa000000-0000-4000-8000-000000000001', 'course_assigned', 'Course for you', 'Fake', '/home', 'assigned:test');
select private.notify('aa000000-0000-4000-8000-000000000001', 'serving_reminder', 'Serving today', 'Fake', '/schedule', 'test-serving');
select is((select count(*)::int from public.notifications
           where user_id = 'aa000000-0000-4000-8000-000000000001' and dedupe_key in ('test-nudge-1', 'test-nudge-2', 'assigned_reminder:test')),
  1, 'only one learning reminder is written in a day');
select is((select count(*)::int from public.notifications
           where user_id = 'aa000000-0000-4000-8000-000000000001' and dedupe_key = 'assigned:test'),
  1, 'being assigned a course isn''t a reminder, so it still goes');
select is((select count(*)::int from public.notifications
           where user_id = 'aa000000-0000-4000-8000-000000000001' and dedupe_key = 'test-serving'),
  1, 'serving reminders aren''t limited');

-- A later day gets the next one.
update public.notifications set created_at = now() - interval '2 days'
 where user_id = 'aa000000-0000-4000-8000-000000000001';
select private.notify('aa000000-0000-4000-8000-000000000001', 'learning_nudge', 'Keep going: two', 'Fake', '/home', 'test-nudge-2');
select is((select count(*)::int from public.notifications where dedupe_key = 'test-nudge-2'),
  1, 'a skipped reminder is written on a later day');

-- Only the job runs the queue.
select pg_temp.act_as('aa000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.queue_serving_reminders() $$, '42501', null, 'a volunteer can''t run the queue');
reset role;
select lives_ok($$ select public.queue_serving_reminders() $$, 'the job can');

-- Real services: a Planning Center one reminds; the Academy's own stays with queue_reminders.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('aa000000-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'reminders-' || n || '@example.com',
       jsonb_build_object('display_name', 'Fake Person ' || n), now(), now()
from generate_series(2, 5) n;

create temporary table ctx on commit drop as
select (select id from public.departments where kind = 'team' order by sort_order limit 1) as department_id;
insert into public.serving_roles (department_id, name)
select department_id, 'Fake camera' from ctx;

insert into public.events (title, starts_at, ends_at, source, external_id) values
  ('Fake PCO soon', now() + interval '30 hours', now() + interval '32 hours', 'planning_center', 'fake-pco-1'),
  ('Fake PCO later', now() + interval '5 days', now() + interval '5 days 2 hours', 'planning_center', 'fake-pco-2');
insert into public.events (title, starts_at, ends_at) values
  ('Fake Academy later', now() + interval '5 days', now() + interval '5 days 2 hours');

create function pg_temp.assign(p_user uuid, p_event text, p_status public.assignment_status)
returns void language plpgsql as $f$
declare
  v_event uuid := (select id from public.events where title = p_event);
  v_department uuid := (select department_id from ctx);
  v_role uuid := (select id from public.serving_roles where name = 'Fake camera');
  v_position uuid;
begin
  insert into public.event_positions (event_id, department_id, role_id)
  values (v_event, v_department, v_role) returning id into v_position;
  insert into public.event_assignments
    (position_id, event_id, department_id, role_id, user_id, status, readiness, assigned_by, assigned_at)
  values (v_position, v_event, v_department, v_role, p_user, p_status,
          private.readiness_for(p_user, v_role), null, now() - interval '7 days');
end;
$f$;

select pg_temp.assign('aa000000-0000-4000-8000-000000000002', 'Fake PCO later', 'pending');
select pg_temp.assign('aa000000-0000-4000-8000-000000000003', 'Fake PCO soon', 'confirmed');
select pg_temp.assign('aa000000-0000-4000-8000-000000000004', 'Fake Academy later', 'pending');

select public.queue_serving_reminders();
select public.queue_serving_reminders();
select is(
  (select title from public.notifications where user_id = 'aa000000-0000-4000-8000-000000000002'),
  'Please confirm: Fake camera', 'Planning Center services ask for a reply after 48 hours');
select is(
  (select count(*)::int from public.notifications where user_id = 'aa000000-0000-4000-8000-000000000003' and dedupe_key like 'serving_soon:%'),
  1, 'Planning Center services remind before serving, once however often the job runs');
select is_empty(
  $q$ select 1 from public.notifications where user_id = 'aa000000-0000-4000-8000-000000000004' $q$,
  'the Academy''s own services stay with queue_reminders, so nobody gets two');

-- Everything here still waits behind the launch switch.
select is(
  (select email_status::text from public.notifications where user_id = 'aa000000-0000-4000-8000-000000000002'),
  'skipped', 'nothing is emailed before launch');
select is(
  (select push_status from public.notifications where user_id = 'aa000000-0000-4000-8000-000000000002'),
  'none', 'nothing goes to a phone before launch');

-- An assigned course not started after 7 days reminds once; started or removed ones don't.
insert into public.course_assignments (user_id, course_id, department_id, assigned_at)
select 'aa000000-0000-4000-8000-000000000005', c.id, c.department_id, now() - interval '8 days'
from public.courses c
join public.course_versions v on v.course_id = c.id and v.status = 'published'
where c.archived_at is null
limit 1;
select public.queue_serving_reminders();
select is(
  (select count(*)::int from public.notifications where user_id = 'aa000000-0000-4000-8000-000000000005' and title like 'Still to start:%'),
  1, 'an assigned course not started after a week reminds them');

select * from finish();
rollback;
