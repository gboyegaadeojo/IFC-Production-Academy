-- Starting a course over: your own only, kept on record, and nothing else changes.
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

--   Leader   a7800000-0000-4000-8000-000000000001
--   Learner  a7800000-0000-4000-8000-000000000002
--   Other    a7800000-0000-4000-8000-000000000003
select pg_temp.new_user('a7800000-0000-4000-8000-000000000001', 'Test Leader');
select pg_temp.new_user('a7800000-0000-4000-8000-000000000002', 'Test Learner');
select pg_temp.new_user('a7800000-0000-4000-8000-000000000003', 'Test Other');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7800000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select pg_temp.act_as('a7800000-0000-4000-8000-000000000001');
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Fake restart course'));
insert into ctx values ('cv', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values ((select id from ctx where key = 'cv'), 'Fake module');
insert into ctx values ('module', (select id from public.course_modules where course_version_id = (select id from ctx where key = 'cv')));
insert into public.lessons (course_version_id, module_id, title) values
  ((select id from ctx where key = 'cv'), (select id from ctx where key = 'module'), 'Fake lesson');
insert into ctx values ('lesson', (select id from public.lessons where course_version_id = (select id from ctx where key = 'cv')));
reset role;

-- Progress for two people, written directly: learners only write it through functions.
insert into public.lesson_progress (user_id, lesson_id, lesson_key, course_id, course_version_id, department_id, status, completed_at)
select u.id, l.id, l.lesson_key, (select id from ctx where key = 'course'), l.course_version_id,
       'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'completed', now()
from public.lessons l
cross join (values ('a7800000-0000-4000-8000-000000000002'::uuid), ('a7800000-0000-4000-8000-000000000003'::uuid)) as u (id)
where l.id = (select id from ctx where key = 'lesson');

select pg_temp.act_as('a7800000-0000-4000-8000-000000000002');
select lives_ok($$ select public.restart_course((select id from ctx where key = 'course')) $$, 'a learner can start a course over');
reset role;
select is((select count(*)::int from public.lesson_progress where user_id = 'a7800000-0000-4000-8000-000000000002'), 0,
  'their progress is cleared');
select is((select count(*)::int from public.lesson_progress where user_id = 'a7800000-0000-4000-8000-000000000003'), 1,
  'nobody else''s progress changes');
select is((select jsonb_array_length(lesson_progress) from public.course_restarts where user_id = 'a7800000-0000-4000-8000-000000000002'), 1,
  'what was cleared is kept on record');
select is((select count(*)::int from public.audit_events where target_table = 'course_restarts'
  and target_id = (select id from public.course_restarts where user_id = 'a7800000-0000-4000-8000-000000000002')), 1,
  'and it goes in the audit log');

select pg_temp.act_as('a7800000-0000-4000-8000-000000000002');
select lives_ok($$ select public.restart_course((select id from ctx where key = 'course')) $$, 'doing it again is safe');
reset role;
select is((select count(*)::int from public.course_restarts where user_id = 'a7800000-0000-4000-8000-000000000002'), 1,
  'and records nothing new');

select pg_temp.act_as('a7800000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.course_restarts), 0, 'people cannot read someone else''s record');
select throws_ok($$ select public.restart_course(gen_random_uuid()) $$, '42501', 'not_authorized', 'an unknown course is refused');
select throws_ok($$ delete from public.course_restarts $$, '42501', null, 'nobody changes the record directly');

select * from finish();
rollback;
