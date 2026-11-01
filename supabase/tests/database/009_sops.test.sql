-- SOP library, files, and lesson resources: SRS-SOP-001..006, SRS-LESSON-005, SRS-RBAC-004.
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
--   Camera member     90000000-0000-4000-8000-000000000001
--   Outsider          90000000-0000-4000-8000-000000000003  (no memberships)
--   Camera Leader     90000000-0000-4000-8000-000000000004
--   Audio Leader      90000000-0000-4000-8000-000000000005
select pg_temp.new_user('90000000-0000-4000-8000-000000000001', 'Test Camera Member');
select pg_temp.new_user('90000000-0000-4000-8000-000000000003', 'Test Outsider');
select pg_temp.new_user('90000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('90000000-0000-4000-8000-000000000005', 'Test Audio Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('90000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('90000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '90000000-0000-4000-8000-000000000001', 'active', now());

create temporary table ctx (key text primary key, id uuid, path text);
grant all on ctx to authenticated;

-- ---------------------------------------------------------------------------
-- Creating and publishing (SRS-SOP-001, -002)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('90000000-0000-4000-8000-000000000004');
insert into ctx (key, id) values ('sop', public.create_sop('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake camera power-up'));
insert into ctx (key, id) values ('v1', (select id from public.sop_versions where sop_id = (select id from ctx where key = 'sop')));
select throws_ok(
  $$ select public.create_sop('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'Not mine') $$,
  '42501', 'not_authorized', 'a leader cannot create SOPs in another department'
);
select throws_ok(
  $$ select public.publish_sop_version((select id from ctx where key = 'v1'), 'First') $$,
  'P0001', 'sop_has_no_file', 'an SOP needs a file before it is published'
);

insert into ctx (key, path) values
  ('path1', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855/' || (select id from ctx where key = 'sop') || '/11111111-1111-4111-8111-111111111111.pdf'),
  ('path2', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855/' || (select id from ctx where key = 'sop') || '/22222222-2222-4222-8222-222222222222.pdf'),
  ('wrong', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73/' || (select id from ctx where key = 'sop') || '/33333333-3333-4333-8333-333333333333.pdf');

-- Storage policies (SRS-SOP-006).
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sops', (select path from ctx where key = 'path1')) $$,
  'a leader uploads a file into their SOP''s draft'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sops', (select path from ctx where key = 'wrong')) $$,
  '42501', null, 'files cannot be stored under another department'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sops', 'loose-file.pdf') $$,
  '42501', null, 'files must follow the department/SOP/file layout'
);
select throws_ok(
  $$ update public.sop_versions set file_path = (select path from ctx where key = 'wrong'), file_name = 'x.pdf',
            file_size = 10, file_type = 'application/pdf' where id = (select id from ctx where key = 'v1') $$,
  '22023', 'invalid_file_path', 'a version only points at files under its own SOP'
);
update public.sop_versions
   set file_path = (select path from ctx where key = 'path1'), file_name = 'Power-up.pdf',
       file_size = 1200, file_type = 'application/pdf'
 where id = (select id from ctx where key = 'v1');
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000001');
select is_empty($$ select 1 from public.sop_versions $$, 'members cannot see a draft');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'sops' $$,
  'members cannot open a draft''s file'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sops', (select path from ctx where key = 'path2')) $$,
  '42501', null, 'members cannot upload files'
);
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000004');
select is(public.publish_sop_version((select id from ctx where key = 'v1'), 'First version'), 1,
  'the leader publishes version 1');
select isnt((select last_reviewed_at from public.sops where id = (select id from ctx where key = 'sop')), null,
  'publishing counts as a review (SRS-SOP-003)');
update public.sop_versions set title = 'Changed' where id = (select id from ctx where key = 'v1');
reset role;
select is((select title from public.sop_versions where id = (select id from ctx where key = 'v1')), 'Fake camera power-up',
  'a published version cannot be edited');
select ok(
  exists (select 1 from public.audit_events where action = 'sop_version.updated'
            and target_id = (select id from ctx where key = 'v1')
            and metadata -> 'status' ->> 'to' = 'published'),
  'publishing is audited'
);

-- ---------------------------------------------------------------------------
-- Reading (SRS-SOP-001, -006)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('90000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.sop_versions), 1, 'members read the current version');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'sops' and name = (select path from ctx where key = 'path1')),
  1, 'members can open the current file'
);
select is(
  (select owner_name from public.sop_owner_names(array[(select id from ctx where key = 'sop')])),
  'Test Camera Leader', 'members see who owns the SOP'
);
select throws_ok(
  $$ select public.mark_sop_reviewed((select id from ctx where key = 'sop')) $$,
  '42501', 'not_authorized', 'members cannot mark an SOP reviewed'
);
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000003');
-- Training is open to everyone in the Academy (decision 2026-11-01), SOPs included.
select isnt_empty($$ select 1 from public.sops $$, 'anyone in the Academy can read a published SOP');
select isnt_empty($$ select 1 from storage.objects where bucket_id = 'sops' $$,
  'and open its file');
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000005');
select isnt_empty($$ select 1 from public.sop_versions $$, 'another department''s leader can read camera SOPs, like anyone');
select throws_ok(
  $$ select public.start_sop_draft((select id from ctx where key = 'sop')) $$,
  '42501', 'not_authorized', 'another department''s leader cannot edit camera SOPs'
);
reset role;

-- ---------------------------------------------------------------------------
-- A new version supersedes the old one (workflow E)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('90000000-0000-4000-8000-000000000004');
insert into ctx (key, id) values ('v2', public.start_sop_draft((select id from ctx where key = 'sop')));
select is(public.start_sop_draft((select id from ctx where key = 'sop')), (select id from ctx where key = 'v2'),
  'starting a draft again returns the open one');
select is((select file_path from public.sop_versions where id = (select id from ctx where key = 'v2')),
  (select path from ctx where key = 'path1'), 'the draft starts with the current file');
insert into storage.objects (bucket_id, name) values ('sops', (select path from ctx where key = 'path2'));
update public.sop_versions set file_path = (select path from ctx where key = 'path2')
 where id = (select id from ctx where key = 'v2');
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000001');
select is_empty(
  $$ select 1 from storage.objects where name = (select path from ctx where key = 'path2') $$,
  'members cannot open the new file before it is published'
);
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000004');
select is(public.publish_sop_version((select id from ctx where key = 'v2'), 'Updated steps'), 2,
  'version 2 is published');
reset role;
select results_eq(
  $$ select version_number, status::text from public.sop_versions
      where sop_id = (select id from ctx where key = 'sop') order by version_number $$,
  $$ values (1, 'superseded'::text), (2, 'published'::text) $$,
  'version 1 is kept and marked superseded'
);

select pg_temp.act_as('90000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select name from storage.objects where bucket_id = 'sops' $$,
  $$ values ((select path from ctx where key = 'path2')) $$,
  'members open only the current file, never a superseded one'
);
select is((select count(*)::int from public.sop_versions), 2,
  'members still see the superseded version listed, so it is clearly marked');
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000004');
select is((select count(*)::int from storage.objects where bucket_id = 'sops'), 2,
  'curriculum staff can open every version''s file');
select lives_ok($$ select public.mark_sop_reviewed((select id from ctx where key = 'sop')) $$,
  'the leader confirms a review without a new version');
reset role;

-- ---------------------------------------------------------------------------
-- Lesson resources (SRS-LESSON-005)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('90000000-0000-4000-8000-000000000005');
insert into ctx (key, id) values ('audio_sop', public.create_sop('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'Fake audio SOP'));
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000004');
insert into ctx (key, id) values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'SOP test course'));
insert into ctx (key, id) values ('cv1', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values ((select id from ctx where key = 'cv1'), 'Module');
insert into public.lessons (course_version_id, module_id, title)
  values ((select id from ctx where key = 'cv1'),
          (select id from public.course_modules where course_version_id = (select id from ctx where key = 'cv1')), 'Lesson');
insert into ctx (key, id) values ('lesson', (select id from public.lessons where course_version_id = (select id from ctx where key = 'cv1')));
select lives_ok(
  $$ insert into public.lesson_resources (lesson_id, sop_id) values ((select id from ctx where key = 'lesson'), (select id from ctx where key = 'sop')) $$,
  'a leader attaches their department''s SOP to a draft lesson'
);
select throws_ok(
  $$ insert into public.lesson_resources (lesson_id, sop_id) values ((select id from ctx where key = 'lesson'), (select id from ctx where key = 'audio_sop')) $$,
  '42501', null, 'another department''s SOP cannot be attached'
);
select is(public.publish_course_version((select id from ctx where key = 'cv1'), 'First'), 1, 'the course is published');
insert into ctx (key, id) values ('cv2', public.start_course_draft((select id from ctx where key = 'course')));
select is(
  (select count(*)::int from public.lesson_resources r join public.lessons l on l.id = r.lesson_id
    where l.course_version_id = (select id from ctx where key = 'cv2')),
  1, 'a new course draft copies the lesson''s resources'
);
select throws_ok(
  $$ select public.remove_lesson_resource((select r.id from public.lesson_resources r where r.lesson_id = (select id from ctx where key = 'lesson'))) $$,
  '42501', 'not_authorized', 'resources of a published lesson cannot be removed'
);
reset role;

select pg_temp.act_as('90000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.lesson_resources where lesson_id = (select id from ctx where key = 'lesson')),
  1, 'members see the published lesson''s resources'
);
select throws_ok(
  $$ insert into public.sops (department_id) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501', null, 'SOPs cannot be inserted directly'
);
select throws_ok($$ delete from public.sop_versions $$, '42501', null, 'SOP versions cannot be deleted');
reset role;

-- ---------------------------------------------------------------------------
-- Archiving
-- ---------------------------------------------------------------------------
select pg_temp.act_as('90000000-0000-4000-8000-000000000004');
select lives_ok($$ select public.archive_sop((select id from ctx where key = 'sop')) $$, 'the leader archives the SOP');
reset role;
select pg_temp.act_as('90000000-0000-4000-8000-000000000001');
select is_empty($$ select 1 from public.sops $$, 'members no longer see an archived SOP');
select is_empty($$ select 1 from storage.objects where bucket_id = 'sops' $$, 'nor open its files');
reset role;
select is((select count(*)::int from public.sop_versions where sop_id = (select id from ctx where key = 'sop')), 2,
  'an archived SOP keeps its history');

select * from finish();
rollback;
