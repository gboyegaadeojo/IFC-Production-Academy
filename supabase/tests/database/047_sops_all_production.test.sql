-- SOPs for all of production: who can manage them, who can read them, their files, and lessons.
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
--   Director   a4000000-0000-4000-8000-000000000001  (organisation-wide)
--   Leader     a4000000-0000-4000-8000-000000000002  (Camera only)
--   Volunteer  a4000000-0000-4000-8000-000000000003  (no department)
--   Suspended  a4000000-0000-4000-8000-000000000004
select pg_temp.new_user('a4000000-0000-4000-8000-000000000001', 'Test Director');
select pg_temp.new_user('a4000000-0000-4000-8000-000000000002', 'Test Camera Leader');
select pg_temp.new_user('a4000000-0000-4000-8000-000000000003', 'Test Volunteer');
select pg_temp.new_user('a4000000-0000-4000-8000-000000000004', 'Test Suspended');
update public.profiles set status = 'suspended' where id = 'a4000000-0000-4000-8000-000000000004';
insert into public.user_roles (user_id, role_id) values
  ('a4000000-0000-4000-8000-000000000001', (select id from public.roles where key = 'production_director'));
insert into public.user_roles (user_id, role_id, department_id) values
  ('a4000000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

create temporary table ctx (key text primary key, id uuid, path text);
grant all on ctx to authenticated, anon;

-- Only organisation-wide rights can create one.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.create_sop(null, 'Not mine') $$, '42501', 'not_authorized',
  'a department leader cannot add an SOP for all of production');
select lives_ok($$ select public.create_sop('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake camera SOP', 'Setup') $$,
  'a department leader still adds their own, with a category');
select is((select category from public.sops where id = (select sop_id from public.sop_versions where title = 'Fake camera SOP')),
  'Setup', 'the category is kept');
reset role;

select pg_temp.act_as('a4000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.create_sop(null, 'Not mine') $$, '42501', 'not_authorized',
  'a volunteer cannot add one');
reset role;

select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
insert into ctx (key, id) values ('sop', public.create_sop(null, 'Fake copyright review', '  Copyright   and licensing '));
insert into ctx (key, id) values ('v1', (select id from public.sop_versions where sop_id = (select id from ctx where key = 'sop')));
select is((select department_id from public.sops where id = (select id from ctx where key = 'sop')), null,
  'the director adds one with no department');
select isnt((select organization_id from public.sops where id = (select id from ctx where key = 'sop')), null,
  'and it belongs to the organisation');
select is((select category from public.sops where id = (select id from ctx where key = 'sop')), 'Copyright and licensing',
  'with a tidied category');

-- Its file lives under the SOP's own id.
insert into ctx (key, path) values
  ('path1', (select id::text from ctx where key = 'sop') || '/' || (select id::text from ctx where key = 'sop') || '/11111111-1111-4111-8111-111111111111.pdf'),
  ('wrong', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855/' || (select id::text from ctx where key = 'sop') || '/22222222-2222-4222-8222-222222222222.pdf');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('sops', (select path from ctx where key = 'path1')) $$,
  'the director uploads its file');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('sops', (select path from ctx where key = 'wrong')) $$,
  '42501', null, 'not under a department''s folder');
select throws_ok(
  $$ update public.sop_versions set file_path = (select path from ctx where key = 'wrong'), file_name = 'x.pdf',
            file_size = 10, file_type = 'application/pdf' where id = (select id from ctx where key = 'v1') $$,
  '22023', 'invalid_file_path', 'a version only points at files under its own SOP');
update public.sop_versions
   set file_path = (select path from ctx where key = 'path1'), file_name = 'Copyright.pdf',
       file_size = 1200, file_type = 'application/pdf'
 where id = (select id from ctx where key = 'v1');
reset role;

-- A draft stays with the people who manage it.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.sop_versions where sop_id = (select id from ctx where key = 'sop')), 0,
  'a volunteer cannot see the draft');
select is_empty($$ select 1 from storage.objects where bucket_id = 'sops' and name = (select path from ctx where key = 'path1') $$,
  'or its file');
reset role;

select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
select is(public.publish_sop_version((select id from ctx where key = 'v1'), 'First version'), 1, 'the director publishes it');
reset role;

-- Anyone active reads the current version, in any department or none.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.sops where id = (select id from ctx where key = 'sop')), 1,
  'a volunteer in no department reads it');
select is((select title from public.sop_versions where sop_id = (select id from ctx where key = 'sop') and status = 'published'),
  'Fake copyright review', 'and its current version');
select isnt_empty($$ select 1 from storage.objects where bucket_id = 'sops' and name = (select path from ctx where key = 'path1') $$,
  'and its file');
select is((select owner_name from public.sop_owner_names(array[(select id from ctx where key = 'sop')])), 'Test Director',
  'and who owns it');
update public.sops set category = 'Changed' where id = (select id from ctx where key = 'sop');
select throws_ok($$ select public.archive_sop((select id from ctx where key = 'sop')) $$, '42501', 'not_authorized',
  'a volunteer cannot archive it');
reset role;
select is((select category from public.sops where id = (select id from ctx where key = 'sop')), 'Copyright and licensing',
  'and a volunteer''s edit changes nothing');

select pg_temp.act_as('a4000000-0000-4000-8000-000000000004');
select is_empty($$ select 1 from public.sops where id = (select id from ctx where key = 'sop') $$,
  'a suspended account cannot read it');
reset role;

set local role anon;
select throws_ok($$ select 1 from public.sops $$, '42501', null, 'nobody signed out can read SOPs');
reset role;

-- A department leader reads it and can attach it, but can't change it.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.sops where id = (select id from ctx where key = 'sop')), 1,
  'a department leader reads it');
select throws_ok($$ select public.start_sop_draft((select id from ctx where key = 'sop')) $$, '42501', 'not_authorized',
  'but cannot start a draft');
select throws_ok($$ select public.mark_sop_reviewed((select id from ctx where key = 'sop')) $$, '42501', 'not_authorized',
  'or confirm a review');
select throws_ok($$ select public.archive_sop((select id from ctx where key = 'sop')) $$, '42501', 'not_authorized',
  'or archive it');
insert into ctx (key, id) values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'General SOP test course'));
insert into ctx (key, id) values ('cv1', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values ((select id from ctx where key = 'cv1'), 'Module');
insert into public.lessons (course_version_id, module_id, title)
  values ((select id from ctx where key = 'cv1'),
          (select id from public.course_modules where course_version_id = (select id from ctx where key = 'cv1')), 'Lesson');
insert into ctx (key, id) values ('lesson', (select id from public.lessons where course_version_id = (select id from ctx where key = 'cv1')));
select lives_ok(
  $$ insert into public.lesson_resources (lesson_id, sop_id) values ((select id from ctx where key = 'lesson'), (select id from ctx where key = 'sop')) $$,
  'and can attach it to a draft lesson');
reset role;

-- History and archiving work as for a department's.
select is((select count(*)::int from public.audit_events where target_id = (select id from ctx where key = 'sop')
           and action = 'sop.created'), 1, 'creating it writes an audit event');
select is((select organization_id from public.audit_events where target_id = (select id from ctx where key = 'sop')
           and action = 'sop.created'), (select organization_id from public.sops where id = (select id from ctx where key = 'sop')),
  'for the organisation');

select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.archive_sop((select id from ctx where key = 'sop')) $$, 'the director archives it');
select is((select count(*)::int from public.sops where id = (select id from ctx where key = 'sop')), 1,
  'and still sees it');
reset role;

select pg_temp.act_as('a4000000-0000-4000-8000-000000000003');
select is_empty($$ select 1 from public.sops where id = (select id from ctx where key = 'sop') $$,
  'a volunteer no longer sees it');
select is_empty($$ select 1 from storage.objects where bucket_id = 'sops' and name = (select path from ctx where key = 'path1') $$,
  'or its file');
reset role;

select * from finish();
rollback;
