-- Topics on courses: who can tag, who can read, and what removing a topic does.
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

--   Director       a7700000-0000-4000-8000-000000000001
--   Camera leader  a7700000-0000-4000-8000-000000000002
--   Audio leader   a7700000-0000-4000-8000-000000000003
--   Volunteer      a7700000-0000-4000-8000-000000000004
select pg_temp.new_user('a7700000-0000-4000-8000-000000000001', 'Test Director');
select pg_temp.new_user('a7700000-0000-4000-8000-000000000002', 'Test Camera Leader');
select pg_temp.new_user('a7700000-0000-4000-8000-000000000003', 'Test Audio Leader');
select pg_temp.new_user('a7700000-0000-4000-8000-000000000004', 'Test Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7700000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null),
  ('a7700000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('a7700000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select pg_temp.act_as('a7700000-0000-4000-8000-000000000002');
insert into ctx values ('topic', public.create_topic('Fake course topic'));
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Fake tagged course'));
select lives_ok($$ select public.set_course_topics((select id from ctx where key = 'course'), array[(select id from ctx where key = 'topic')]) $$,
  'a leader can tag a course in their department');
select lives_ok($$ select public.set_course_topics((select id from ctx where key = 'course'), array[(select id from ctx where key = 'topic')]) $$,
  'saving the same tags again is safe');
select is((select count(*)::int from public.course_topics where course_id = (select id from ctx where key = 'course')), 1, 'the tag is saved once');

select pg_temp.act_as('a7700000-0000-4000-8000-000000000003');
select throws_ok($$ select public.set_course_topics((select id from ctx where key = 'course'), array[]::uuid[]) $$,
  '42501', 'not_authorized', 'another department''s leader cannot tag it');

select pg_temp.act_as('a7700000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.course_topics where course_id = (select id from ctx where key = 'course')), 1, 'a volunteer can read it');
select throws_ok($$ select public.set_course_topics((select id from ctx where key = 'course'), array[]::uuid[]) $$,
  '42501', 'not_authorized', 'a volunteer cannot change it');
select throws_ok($$ insert into public.course_topics (course_id, topic_id) values ((select id from ctx where key = 'course'), (select id from ctx where key = 'topic')) $$,
  '42501', null, 'nobody writes to it directly');

select pg_temp.act_as('a7700000-0000-4000-8000-000000000001');
select lives_ok($$ select public.remove_topic((select id from ctx where key = 'topic')) $$, 'a director can remove the topic');
select is((select count(*)::int from public.course_topics where topic_id = (select id from ctx where key = 'topic')), 0,
  'removing a topic takes it off its courses');

select * from finish();
rollback;
