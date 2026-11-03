-- Someone training in a department without joining it shows up for its leaders and gets nudges,
-- but doesn't become a member, and volunteers still can't see any of this.
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

--   Learner  f2000000-0000-4000-8000-000000000001  (never joined Camera)
--   Idle     f2000000-0000-4000-8000-000000000002  (never joined, hasn't started)
--   Leader   f2000000-0000-4000-8000-000000000003
select pg_temp.new_user('f2000000-0000-4000-8000-000000000001', 'Test Open Learner');
select pg_temp.new_user('f2000000-0000-4000-8000-000000000002', 'Test Idle Person');
select pg_temp.new_user('f2000000-0000-4000-8000-000000000003', 'Test Camera Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('f2000000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

create temporary table before as
  select active_members, learners, in_progress from public.department_training_summary() where false;
grant all on before to authenticated;
select pg_temp.act_as('f2000000-0000-4000-8000-000000000003');
insert into before select active_members, learners, in_progress from public.department_training_summary()
  where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855';
reset role;

-- The learner starts the seed course without joining the department.
select pg_temp.act_as('f2000000-0000-4000-8000-000000000001');
select public.complete_lesson('cccccccc-0000-4000-8000-000000000001',
  (select lesson_key from public.lessons where course_version_id = 'cccccccc-0000-4000-8000-000000000011' limit 1));
select is_empty($$ select 1 from public.department_training_summary() $$, 'a volunteer still sees no dashboard figures');
select is_empty(
  $$ select 1 from public.assessable_members('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  'and cannot list who can be assessed');
select throws_ok(
  $$ select * from public.department_training_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501', 'not_authorized', 'or run reports');
reset role;

select is((select count(*)::int from public.department_memberships
           where user_id = 'f2000000-0000-4000-8000-000000000001'
             and department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'), 0,
  'starting a course does not make anyone a member');

select pg_temp.act_as('f2000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.assessable_members('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
           where user_id = 'f2000000-0000-4000-8000-000000000001'), 1,
  'the observer can choose someone who started training without joining');
select is((select count(*)::int from public.assessable_members('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
           where user_id = 'f2000000-0000-4000-8000-000000000002'), 0,
  'but not someone who has not started');
select is((select state from public.department_training_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
           where user_id = 'f2000000-0000-4000-8000-000000000001'
             and course_id = 'cccccccc-0000-4000-8000-000000000001'), 'in_progress',
  'the training report shows them');
select isnt((select joined_at from public.department_training_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
             where user_id = 'f2000000-0000-4000-8000-000000000001' limit 1), null,
  'with when they started');
select is((select s.active_members - b.active_members from public.department_training_summary() s, before b
            where s.department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'), 0,
  'the dashboard does not count them as a member');
select is((select s.learners - b.learners from public.department_training_summary() s, before b
            where s.department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'), 1,
  'it counts them as learning here');
select is((select s.in_progress - b.in_progress from public.department_training_summary() s, before b
            where s.department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'), 1,
  'and as in progress');
reset role;

-- A week later, they get a nudge like anyone else. Backdate without the updated_at trigger.
set local session_replication_role = replica;
update public.lesson_progress
   set last_viewed_at = now() - interval '8 days', updated_at = now() - interval '8 days'
 where user_id = 'f2000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
select public.queue_reminders();
select is((select count(*)::int from public.notifications
           where user_id = 'f2000000-0000-4000-8000-000000000001' and kind = 'learning_nudge'), 1,
  'someone who never joined still gets the Keep going nudge');

-- A deactivated person drops off the lists unless they were a member.
update public.profiles set status = 'deactivated' where id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.act_as('f2000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.department_training_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
           where user_id = 'f2000000-0000-4000-8000-000000000001'), 0,
  'someone deactivated who never joined leaves the report');
reset role;

select * from finish();
rollback;
