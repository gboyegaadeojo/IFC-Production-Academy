-- Curriculum structure and publishing: SRS-CUR-001..009, SRS-MEM-005, SRS-MEM-006, SRS-AUDIT-001.
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

-- Test people:
--   Camera member     50000000-0000-4000-8000-000000000001
--   Outsider          50000000-0000-4000-8000-000000000002  (no memberships)
--   Camera Leader     50000000-0000-4000-8000-000000000003
--   Director          50000000-0000-4000-8000-000000000005
select pg_temp.new_user('50000000-0000-4000-8000-000000000001', 'Test Camera Member');
select pg_temp.new_user('50000000-0000-4000-8000-000000000002', 'Test Outsider');
select pg_temp.new_user('50000000-0000-4000-8000-000000000003', 'Test Camera Leader');
select pg_temp.new_user('50000000-0000-4000-8000-000000000005', 'Test Director');
insert into public.user_roles (user_id, role_id, department_id) values
  ('50000000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('50000000-0000-4000-8000-000000000005', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null);
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '50000000-0000-4000-8000-000000000001', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values
  ('camera_l1', (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1)),
  ('audio_l1', (select id from public.levels where department_id = '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73' and number = 1));

-- ---------------------------------------------------------------------------
-- Levels are data
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select number, name from public.levels
      where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' order by number $$,
  $$ values (1, 'Foundations'::text), (2, 'Proficiency'::text), (3, 'Advanced and Leadership'::text) $$,
  'every department has the three levels'
);

-- ---------------------------------------------------------------------------
-- Creating and drafting
-- ---------------------------------------------------------------------------
select pg_temp.act_as('50000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.create_course((select id from ctx where key = 'camera_l1'), 'Not allowed') $$,
  '42501', 'not_authorized', 'a volunteer cannot create a course'
);
reset role;

select pg_temp.act_as('50000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.create_course((select id from ctx where key = 'audio_l1'), 'Wrong department') $$,
  '42501', 'not_authorized', 'a leader cannot create a course in another department'
);
insert into ctx values ('course', public.create_course((select id from ctx where key = 'camera_l1'), 'Framing basics'));
insert into ctx values ('empty_course', public.create_course((select id from ctx where key = 'camera_l1'), 'Empty course'));
insert into ctx values ('v1', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title, sort_order)
  values ((select id from ctx where key = 'v1'), 'Getting started', 10);
insert into ctx values ('module', (select id from public.course_modules where course_version_id = (select id from ctx where key = 'v1')));
insert into public.lessons (course_version_id, module_id, title, body, sort_order) values
  ((select id from ctx where key = 'v1'), (select id from ctx where key = 'module'), 'Rule of thirds', 'Fake lesson body', 10),
  ((select id from ctx where key = 'v1'), (select id from ctx where key = 'module'), 'Headroom', 'Fake lesson body', 20);
select is(
  (select count(*)::int from public.lessons where course_version_id = (select id from ctx where key = 'v1')),
  2,
  'a leader adds modules and lessons to a draft'
);

-- ---------------------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.publish_course_version((select id from ctx where key = 'v1'), '  ') $$,
  '22023', 'change_note_required', 'publishing needs a change note'
);
select throws_ok(
  $$ select public.publish_course_version(
       (select id from public.course_versions where course_id = (select id from ctx where key = 'empty_course')),
       'First version') $$,
  'P0001', 'course_has_no_lessons', 'a course without lessons cannot be published'
);
select is(
  public.publish_course_version((select id from ctx where key = 'v1'), 'First version'),
  1,
  'a department leader publishes their own course as version 1'
);
update public.lessons set title = 'Edited after publishing'
 where course_version_id = (select id from ctx where key = 'v1');
select is(
  (select count(*)::int from public.lessons
    where course_version_id = (select id from ctx where key = 'v1') and title = 'Edited after publishing'),
  0,
  'published lessons cannot be edited'
);
select throws_ok(
  $$ select public.delete_lesson((select id from public.lessons
       where course_version_id = (select id from ctx where key = 'v1') limit 1)) $$,
  '42501', 'not_authorized', 'published lessons cannot be deleted'
);
reset role;

select is(
  (select count(*)::int from public.audit_events
    where action = 'course_version.updated'
      and target_id = (select id from ctx where key = 'v1')
      and actor_id = '50000000-0000-4000-8000-000000000003'
      and metadata -> 'status' ->> 'to' = 'published'
      and department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  1,
  'publishing writes an audit event with the department'
);

-- ---------------------------------------------------------------------------
-- Who reads what (SRS-MEM-005, SRS-MEM-006)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('50000000-0000-4000-8000-000000000002');
select is(
  (select title from public.course_versions where course_id = (select id from ctx where key = 'course')),
  'Framing basics',
  'anyone signed in can browse a published course''s title'
);
select is_empty(
  $$ select 1 from public.lessons where course_version_id = (select id from ctx where key = 'v1') $$,
  'people outside the department cannot read its lessons'
);
select is_empty(
  $$ select 1 from public.course_versions where course_id = (select id from ctx where key = 'empty_course') $$,
  'nobody outside curriculum staff sees drafts'
);
reset role;

select pg_temp.act_as('50000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.lessons where course_version_id = (select id from ctx where key = 'v1')),
  2,
  'members read the published lessons'
);
reset role;

-- ---------------------------------------------------------------------------
-- New versions keep history (SRS-CUR-007, SRS-CUR-008)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('50000000-0000-4000-8000-000000000003');
insert into ctx values ('v2', public.start_course_draft((select id from ctx where key = 'course')));
select is(
  public.start_course_draft((select id from ctx where key = 'course')),
  (select id from ctx where key = 'v2'),
  'starting a draft twice returns the same draft'
);
select set_eq(
  $$ select lesson_key from public.lessons where course_version_id = (select id from ctx where key = 'v2') $$,
  $$ select lesson_key from public.lessons where course_version_id = (select id from ctx where key = 'v1') $$,
  'a new draft copies the lessons and keeps their keys'
);
update public.course_versions set title = 'Framing fundamentals' where id = (select id from ctx where key = 'v2');
select is(
  public.publish_course_version((select id from ctx where key = 'v2'), 'Renamed the course'),
  2,
  'the next publish is version 2'
);
reset role;
select results_eq(
  $$ select version_number, status::text, title from public.course_versions
      where course_id = (select id from ctx where key = 'course') order by version_number $$,
  $$ values (1, 'superseded'::text, 'Framing basics'::text), (2, 'published'::text, 'Framing fundamentals'::text) $$,
  'version 1 is superseded and kept unchanged'
);

select pg_temp.act_as('50000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.lessons where course_version_id = (select id from ctx where key = 'v1')),
  0,
  'members no longer read superseded lessons'
);
reset role;

-- Restoring copies an old version into a new draft.
select pg_temp.act_as('50000000-0000-4000-8000-000000000003');
insert into ctx values ('v3', public.restore_course_version((select id from ctx where key = 'v1')));
select results_eq(
  $$ select status::text, title, change_note from public.course_versions where id = (select id from ctx where key = 'v3') $$,
  $$ values ('draft'::text, 'Framing basics'::text, 'Restored version 1'::text) $$,
  'restoring version 1 makes a draft with its content'
);
select throws_ok(
  $$ select public.restore_course_version((select id from ctx where key = 'v1')) $$,
  'P0001', 'draft_exists', 'you can''t restore while a draft is open'
);
reset role;

-- ---------------------------------------------------------------------------
-- Optional review: a second person publishes
-- ---------------------------------------------------------------------------
update public.departments set curriculum_requires_review = true
 where id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855';

select pg_temp.act_as('50000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.publish_course_version((select id from ctx where key = 'v3'), 'Back to v1') $$,
  'P0001', 'review_required', 'with review on, a draft can''t be published directly'
);
select lives_ok(
  $$ select public.submit_course_version((select id from ctx where key = 'v3'), 'Back to the original') $$,
  'a leader submits the draft for review'
);
select throws_ok(
  $$ select public.publish_course_version((select id from ctx where key = 'v3')) $$,
  '42501', 'cannot_publish_own_submission', 'the person who submitted can''t publish it'
);
reset role;

select pg_temp.act_as('50000000-0000-4000-8000-000000000005');
select is(
  public.publish_course_version((select id from ctx where key = 'v3')),
  3,
  'a second person publishes it as version 3'
);
reset role;

-- ---------------------------------------------------------------------------
-- Archiving
-- ---------------------------------------------------------------------------
select pg_temp.act_as('50000000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.archive_course((select id from ctx where key = 'course')) $$,
  'a leader archives a course'
);
reset role;
select pg_temp.act_as('50000000-0000-4000-8000-000000000001');
select is_empty(
  $$ select 1 from public.courses where id = (select id from ctx where key = 'course') $$,
  'archived courses leave the catalogue'
);
reset role;
select is(
  (select count(*)::int from public.course_versions where course_id = (select id from ctx where key = 'course')),
  3,
  'archiving keeps every version'
);

select * from finish();
rollback;
