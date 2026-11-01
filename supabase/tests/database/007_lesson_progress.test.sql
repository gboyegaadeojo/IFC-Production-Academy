-- Lesson video and progress: SRS-LESSON-003, SRS-PROG-001..005, SRS-RBAC-004.
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
--   Camera member     70000000-0000-4000-8000-000000000001
--   Second member     70000000-0000-4000-8000-000000000002
--   Outsider          70000000-0000-4000-8000-000000000003  (no memberships)
--   Camera Leader     70000000-0000-4000-8000-000000000004
--   Audio Leader      70000000-0000-4000-8000-000000000005
select pg_temp.new_user('70000000-0000-4000-8000-000000000001', 'Test Camera Member');
select pg_temp.new_user('70000000-0000-4000-8000-000000000002', 'Test Second Member');
select pg_temp.new_user('70000000-0000-4000-8000-000000000003', 'Test Outsider');
select pg_temp.new_user('70000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('70000000-0000-4000-8000-000000000005', 'Test Audio Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('70000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('70000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '70000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '70000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- A published camera course with two lessons; then an open draft.
select pg_temp.act_as('70000000-0000-4000-8000-000000000004');
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Progress test course'));
insert into ctx values ('v1', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title, sort_order)
  values ((select id from ctx where key = 'v1'), 'Module', 10);
insert into ctx values ('module', (select id from public.course_modules where course_version_id = (select id from ctx where key = 'v1')));
insert into public.lessons (course_version_id, module_id, title, sort_order) values
  ((select id from ctx where key = 'v1'), (select id from ctx where key = 'module'), 'First', 10),
  ((select id from ctx where key = 'v1'), (select id from ctx where key = 'module'), 'Second', 20);
insert into ctx values
  ('lesson1', (select id from public.lessons where course_version_id = (select id from ctx where key = 'v1') and title = 'First')),
  ('key1', (select lesson_key from public.lessons where course_version_id = (select id from ctx where key = 'v1') and title = 'First')),
  ('key2', (select lesson_key from public.lessons where course_version_id = (select id from ctx where key = 'v1') and title = 'Second'));

-- ---------------------------------------------------------------------------
-- Video references (SRS-LESSON-003). Ids and paths are fake.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.lessons set video_provider = 'youtube', video_ref = 'AbC_dEf-123'
      where id = (select id from ctx where key = 'lesson1') $$,
  'a leader attaches a YouTube video id to a draft lesson'
);
select throws_ok(
  $$ update public.lessons set video_provider = 'youtube', video_ref = 'https://youtu.be/AbC_dEf-123'
      where id = (select id from ctx where key = 'lesson1') $$,
  '23514', null, 'a full URL is never stored as a YouTube reference'
);
select throws_ok(
  $$ update public.lessons set video_provider = 'youtube', video_ref = null
      where id = (select id from ctx where key = 'lesson1') $$,
  '23514', null, 'a provider needs a reference'
);
select lives_ok(
  $$ update public.lessons set video_provider = 'nas', video_ref = 'camera/level-1/Framing basics.MP4'
      where id = (select id from ctx where key = 'lesson1') $$,
  'a leader attaches a church video library file'
);
select throws_ok(
  $$ update public.lessons set video_provider = 'nas', video_ref = 'camera/../../secret.mp4'
      where id = (select id from ctx where key = 'lesson1') $$,
  '23514', null, 'library paths cannot climb out of the training folder'
);
select throws_ok(
  $$ update public.lessons set video_provider = 'nas', video_ref = '/etc/framing.mp4'
      where id = (select id from ctx where key = 'lesson1') $$,
  '23514', null, 'library paths are relative'
);
select throws_ok(
  $$ update public.lessons set video_provider = 'nas', video_ref = 'camera/framing.mov'
      where id = (select id from ctx where key = 'lesson1') $$,
  '23514', null, 'library files must be web video'
);
update public.lessons set video_provider = 'youtube', video_ref = 'AbC_dEf-123'
 where id = (select id from ctx where key = 'lesson1');

-- Progress can't be recorded on a draft.
reset role;
select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  '42501', 'not_authorized', 'nothing is recorded on an unpublished course'
);
reset role;

select pg_temp.act_as('70000000-0000-4000-8000-000000000004');
select is(public.publish_course_version((select id from ctx where key = 'v1'), 'First version'), 1,
  'the course is published');
reset role;

-- ---------------------------------------------------------------------------
-- Recording progress (SRS-PROG-001, -004)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  'a member records opening a lesson'
);
select lives_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1'), 125) $$,
  'a member saves the video position'
);
select lives_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  'recording again is harmless'
);
select results_eq(
  $$ select status::text, position_seconds, lesson_id, course_version_id
       from public.lesson_progress where lesson_key = (select id from ctx where key = 'key1') $$,
  $$ values ('in_progress'::text, 125, (select id from ctx where key = 'lesson1'), (select id from ctx where key = 'v1')) $$,
  'one row, on the exact lesson version, keeping the position when none is sent'
);

select isnt(
  public.complete_lesson((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')),
  null,
  'a member marks a lesson complete'
);
-- The subquery reads the row as it was before this statement: the first completion.
select is(
  public.complete_lesson((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')),
  (select completed_at from public.lesson_progress where lesson_key = (select id from ctx where key = 'key1')),
  'completing again keeps the first completion time'
);
select lives_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1'), 10) $$,
  'viewing a completed lesson again'
);
select is(
  (select status::text from public.lesson_progress where lesson_key = (select id from ctx where key = 'key1')),
  'completed',
  'viewing never undoes a completion'
);
select lives_ok(
  $$ select public.reopen_lesson((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  'a member undoes their completion'
);
select results_eq(
  $$ select status::text, completed_at is null
       from public.lesson_progress where lesson_key = (select id from ctx where key = 'key1') $$,
  $$ values ('in_progress'::text, true) $$,
  'reopening clears the completion'
);
select public.complete_lesson((select id from ctx where key = 'course'), (select id from ctx where key = 'key2'));

-- Nobody writes progress directly.
select throws_ok(
  $$ insert into public.lesson_progress (user_id, lesson_id, lesson_key, course_id, course_version_id, department_id, status, completed_at)
     values ('70000000-0000-4000-8000-000000000001', (select id from ctx where key = 'lesson1'), (select id from ctx where key = 'key1'),
             (select id from ctx where key = 'course'), (select id from ctx where key = 'v1'),
             'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'completed', now()) $$,
  '42501', null, 'progress cannot be inserted directly'
);
select throws_ok(
  $$ update public.lesson_progress set status = 'completed', completed_at = now() $$,
  '42501', null, 'progress cannot be updated directly'
);
select throws_ok(
  $$ delete from public.lesson_progress $$,
  '42501', null, 'progress cannot be deleted'
);
reset role;

-- ---------------------------------------------------------------------------
-- Who can record and who can read (SRS-RBAC-004)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('70000000-0000-4000-8000-000000000003');
-- Training is open to everyone in the Academy (decision 2026-11-01): no membership needed.
select lives_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  'someone who isn''t a member can still learn and record progress'
);
select lives_ok(
  $$ select public.complete_lesson((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  'and complete a lesson'
);
select is_empty(
  $$ select 1 from public.lesson_progress where user_id <> '70000000-0000-4000-8000-000000000003' $$,
  'but reads nobody else''s progress'
);
reset role;

select pg_temp.act_as('70000000-0000-4000-8000-000000000002');
select is_empty(
  $$ select 1 from public.lesson_progress where user_id = '70000000-0000-4000-8000-000000000001' $$,
  'a volunteer cannot read another volunteer''s progress'
);
select lives_ok(
  $$ select public.reopen_lesson((select id from ctx where key = 'course'), (select id from ctx where key = 'key2')) $$,
  'reopening a lesson you never started is harmless'
);
reset role;
select is(
  (select status::text from public.lesson_progress
    where user_id = '70000000-0000-4000-8000-000000000001' and lesson_key = (select id from ctx where key = 'key2')),
  'completed',
  'reopening only touches your own record'
);

select pg_temp.act_as('70000000-0000-4000-8000-000000000004');
select is(
  (select count(*)::int from public.lesson_progress where user_id = '70000000-0000-4000-8000-000000000001'),
  2,
  'the department''s leader reads its members'' progress (report.view)'
);
select lives_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  'curriculum staff can take the training too'
);
reset role;

select pg_temp.act_as('70000000-0000-4000-8000-000000000005');
select is_empty(
  $$ select 1 from public.lesson_progress $$,
  'another department''s leader cannot read camera progress'
);
reset role;

-- Leaving a department doesn't stop someone learning: training is open to everyone.
update public.department_memberships set status = 'removed', decided_at = now()
 where user_id = '70000000-0000-4000-8000-000000000002';
select pg_temp.act_as('70000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  'someone who left the department can keep learning'
);
reset role;
-- A hidden department's training is closed to everyone but its staff.
update public.departments set status = 'inactive'
 where id = (select department_id from public.courses where id = (select id from ctx where key = 'course'));
select pg_temp.act_as('70000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1')) $$,
  '42501', 'not_authorized', 'nobody learns in a hidden department'
);
reset role;
update public.departments set status = 'active'
 where id = (select department_id from public.courses where id = (select id from ctx where key = 'course'));

-- ---------------------------------------------------------------------------
-- New versions keep history (SRS-CUR-008) and copy the video
-- ---------------------------------------------------------------------------
select pg_temp.act_as('70000000-0000-4000-8000-000000000004');
insert into ctx values ('v2', public.start_course_draft((select id from ctx where key = 'course')));
select results_eq(
  $$ select video_provider::text, video_ref from public.lessons
      where course_version_id = (select id from ctx where key = 'v2')
        and lesson_key = (select id from ctx where key = 'key1') $$,
  $$ values ('youtube'::text, 'AbC_dEf-123'::text) $$,
  'a new draft copies the lesson''s video'
);
select is(public.publish_course_version((select id from ctx where key = 'v2'), 'Second version'), 2,
  'version 2 is published');
reset role;

select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
select public.record_lesson_view((select id from ctx where key = 'course'), (select id from ctx where key = 'key1'));
select is(
  (select count(*)::int from public.lesson_progress where lesson_key = (select id from ctx where key = 'key1')),
  2,
  'progress on the new version is a new row; the old one is kept'
);
reset role;
select results_eq(
  $$ select v.version_number from public.lesson_progress p
       join public.course_versions v on v.id = p.course_version_id
      where p.lesson_key = (select id from ctx where key = 'key1')
        and p.user_id = '70000000-0000-4000-8000-000000000001' order by v.version_number $$,
  $$ values (1), (2) $$,
  'the earlier row still points at version 1'
);

select * from finish();
rollback;
