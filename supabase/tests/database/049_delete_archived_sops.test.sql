-- Deleting archived SOPs: who can, when it's refused, and what's left behind.
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

--   Leader     a7100000-0000-4000-8000-000000000001  (Camera)
--   Other      a7100000-0000-4000-8000-000000000002  (Audio leader)
--   Volunteer  a7100000-0000-4000-8000-000000000003
select pg_temp.new_user('a7100000-0000-4000-8000-000000000001', 'Test Camera Leader');
select pg_temp.new_user('a7100000-0000-4000-8000-000000000002', 'Test Audio Leader');
select pg_temp.new_user('a7100000-0000-4000-8000-000000000003', 'Test Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7100000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('a7100000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');

create temporary table ctx (key text primary key, id uuid, path text);
grant all on ctx to authenticated;

select pg_temp.act_as('a7100000-0000-4000-8000-000000000001');
insert into ctx (key, id) values ('sop', public.create_sop('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake old SOP'));
insert into ctx (key, id) values ('v1', (select id from public.sop_versions where sop_id = (select id from ctx where key = 'sop')));
update public.sop_versions set body = '1. Fake step' where id = (select id from ctx where key = 'v1');
select public.publish_sop_version((select id from ctx where key = 'v1'), 'First');

select throws_ok($$ select public.delete_archived_sop((select id from ctx where key = 'sop')) $$,
  'P0001', 'sop_not_archived', 'an SOP has to be archived before it can be deleted');

-- Attach it to a draft lesson, then archive it.
insert into ctx (key, id) values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Delete test course'));
insert into ctx (key, id) values ('cv1', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values ((select id from ctx where key = 'cv1'), 'Module');
insert into public.lessons (course_version_id, module_id, title)
  values ((select id from ctx where key = 'cv1'),
          (select id from public.course_modules where course_version_id = (select id from ctx where key = 'cv1')), 'Lesson');
insert into ctx (key, id) values ('lesson', (select id from public.lessons where course_version_id = (select id from ctx where key = 'cv1')));
insert into public.lesson_resources (lesson_id, sop_id)
  values ((select id from ctx where key = 'lesson'), (select id from ctx where key = 'sop'));
select public.archive_sop((select id from ctx where key = 'sop'));

select throws_ok($$ select public.delete_archived_sop((select id from ctx where key = 'sop')) $$,
  'P0001', 'sop_in_lesson', 'it cannot be deleted while a course still lists it');
insert into ctx (key, path) values
  ('path', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855/' || (select id from ctx where key = 'sop') || '/11111111-1111-4111-8111-111111111111.pdf');
select is(private.can_delete_sop_file((select path from ctx where key = 'path')), false,
  'and its files cannot be deleted either');
reset role;

-- Other people can't.
select pg_temp.act_as('a7100000-0000-4000-8000-000000000002');
select throws_ok($$ select public.delete_archived_sop((select id from ctx where key = 'sop')) $$,
  '42501', 'not_authorized', 'another department''s leader cannot delete it');
select is(private.can_delete_sop_file((select path from ctx where key = 'path')), false,
  'or its files');
reset role;
select pg_temp.act_as('a7100000-0000-4000-8000-000000000003');
select throws_ok($$ select public.delete_archived_sop((select id from ctx where key = 'sop')) $$,
  '42501', 'not_authorized', 'a volunteer cannot delete it');
reset role;
set local role anon;
select throws_ok($$ select public.delete_archived_sop(gen_random_uuid()) $$, '42501', null, 'nobody signed out can');
reset role;

-- Once the course no longer uses it, it goes, with its versions.
select pg_temp.act_as('a7100000-0000-4000-8000-000000000001');
select public.remove_lesson_resource((select id from public.lesson_resources where sop_id = (select id from ctx where key = 'sop')));
select is(private.can_delete_sop_file((select path from ctx where key = 'path')), true,
  'its files can now be deleted');
select lives_ok($$ select public.delete_archived_sop((select id from ctx where key = 'sop')) $$,
  'the leader deletes it');
reset role;
select is((select count(*)::int from public.sops where id = (select id from ctx where key = 'sop')), 0, 'the SOP is gone');
select is((select count(*)::int from public.sop_versions where sop_id = (select id from ctx where key = 'sop')), 0, 'and its versions');
select is((select metadata ->> 'title' from public.audit_events
           where action = 'sop.deleted' and target_id = (select id from ctx where key = 'sop')), 'Fake old SOP',
  'the audit log keeps what it was');
select is((select actor_id from public.audit_events
           where action = 'sop.deleted' and target_id = (select id from ctx where key = 'sop')),
  'a7100000-0000-4000-8000-000000000001'::uuid, 'and who deleted it');

-- A lesson on an old, replaced course version doesn't block it.
select pg_temp.act_as('a7100000-0000-4000-8000-000000000001');
insert into ctx (key, id) values ('sop2', public.create_sop('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake second SOP'));
insert into public.lesson_resources (lesson_id, sop_id)
  values ((select id from ctx where key = 'lesson'), (select id from ctx where key = 'sop2'));
select public.archive_sop((select id from ctx where key = 'sop2'));
reset role;
update public.course_versions set status = 'superseded', version_number = 1, published_at = now()
 where id = (select id from ctx where key = 'cv1');
select pg_temp.act_as('a7100000-0000-4000-8000-000000000001');
select lives_ok($$ select public.delete_archived_sop((select id from ctx where key = 'sop2')) $$,
  'an old course version does not stop it');
reset role;
select is((select count(*)::int from public.lesson_resources where sop_id = (select id from ctx where key = 'sop2')), 0,
  'and that old link goes with it');

select * from finish();
rollback;
