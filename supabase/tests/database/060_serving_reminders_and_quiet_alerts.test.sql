-- Serving reminders for Planning Center's services, the morning-of and assigned-course reminders,
-- quiet hours for phones, and one learning reminder a day.
begin;
select no_plan();

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

-- A Planning Center service reminds; the Academy's own stays with queue_reminders.
insert into public.events (title, starts_at, ends_at, source)
values ('Fake PCO service', now() + interval '30 hours', now() + interval '32 hours', 'planning_center')
on conflict do nothing;
select ok(
  exists (select 1 from public.events where title = 'Fake PCO service' and source = 'planning_center'),
  'a Planning Center service can be set up for this test');

select * from finish();
rollback;
