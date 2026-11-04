-- Topics: who can add, tag, rename, and remove them, and that everyone can read them.
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

--   Director       a7600000-0000-4000-8000-000000000001
--   Camera leader  a7600000-0000-4000-8000-000000000002
--   Audio leader   a7600000-0000-4000-8000-000000000003
--   Volunteer      a7600000-0000-4000-8000-000000000004
select pg_temp.new_user('a7600000-0000-4000-8000-000000000001', 'Test Director');
select pg_temp.new_user('a7600000-0000-4000-8000-000000000002', 'Test Camera Leader');
select pg_temp.new_user('a7600000-0000-4000-8000-000000000003', 'Test Audio Leader');
select pg_temp.new_user('a7600000-0000-4000-8000-000000000004', 'Test Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7600000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null),
  ('a7600000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('a7600000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- A department leader can add a topic, and the same name returns the same topic.
select pg_temp.act_as('a7600000-0000-4000-8000-000000000002');
insert into ctx values ('topic', public.create_topic('Fake Mixing'));
select is(public.create_topic('  fake mixing '), (select id from ctx where key = 'topic'), 'a name already in use returns that topic');
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Fake tagged course'));
insert into ctx values ('cv', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values
  ((select id from ctx where key = 'cv'), 'Fake module');
insert into ctx values ('module', (select id from public.course_modules where course_version_id = (select id from ctx where key = 'cv')));
insert into public.lessons (course_version_id, module_id, title) values
  ((select id from ctx where key = 'cv'), (select id from ctx where key = 'module'), 'Fake lesson');
insert into ctx values ('lesson', (select lesson_key from public.lessons where course_version_id = (select id from ctx where key = 'cv')));

select lives_ok($$ select public.set_lesson_topics((select id from ctx where key = 'course'), (select id from ctx where key = 'lesson'), array[(select id from ctx where key = 'topic')]) $$,
  'a leader can tag a lesson in their department');
select is((select count(*)::int from public.lesson_topics where course_id = (select id from ctx where key = 'course')), 1, 'the tag is saved');
select throws_ok($$ select public.set_lesson_topics((select id from ctx where key = 'course'), gen_random_uuid(), array[]::uuid[]) $$,
  '42501', 'not_authorized', 'a lesson has to be in that course');
select throws_ok($$ select public.rename_topic((select id from ctx where key = 'topic'), 'Nope') $$,
  '42501', 'not_authorized', 'a department leader cannot rename a topic');
select throws_ok($$ select public.remove_topic((select id from ctx where key = 'topic')) $$,
  '42501', 'not_authorized', 'a department leader cannot remove a topic');

select pg_temp.act_as('a7600000-0000-4000-8000-000000000003');
select throws_ok($$ select public.set_lesson_topics((select id from ctx where key = 'course'), (select id from ctx where key = 'lesson'), array[]::uuid[]) $$,
  '42501', 'not_authorized', 'another department''s leader cannot tag it');

-- A volunteer can read, and nothing else.
select pg_temp.act_as('a7600000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.topics where id = (select id from ctx where key = 'topic')), 1, 'a volunteer can read topics');
select is((select count(*)::int from public.lesson_topics where topic_id = (select id from ctx where key = 'topic')), 1, 'and which lessons have them');
select throws_ok($$ select public.create_topic('Nope') $$, '42501', 'not_authorized', 'a volunteer cannot add a topic');
select throws_ok($$ insert into public.topics (organization_id, name) values ('fb45e05a-0afd-4170-aeab-622886acfc17', 'Nope') $$,
  '42501', null, 'nobody writes to topics directly');

-- A Production Director can tidy.
select pg_temp.act_as('a7600000-0000-4000-8000-000000000001');
select lives_ok($$ select public.rename_topic((select id from ctx where key = 'topic'), 'Fake Audio Mixing') $$, 'a director can rename a topic');
select lives_ok($$ select public.remove_topic((select id from ctx where key = 'topic')) $$, 'and remove one');
select is((select count(*)::int from public.lesson_topics where topic_id = (select id from ctx where key = 'topic')), 0,
  'removing a topic takes it off its lessons');

select * from finish();
rollback;
