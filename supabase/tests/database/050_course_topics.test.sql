-- Topics: courses only, with nothing to join, and the same permissions as any category.
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

--   Director   a7200000-0000-4000-8000-000000000001
--   Volunteer  a7200000-0000-4000-8000-000000000002
select pg_temp.new_user('a7200000-0000-4000-8000-000000000001', 'Test Director');
select pg_temp.new_user('a7200000-0000-4000-8000-000000000002', 'Test Volunteer');
insert into public.user_roles (user_id, role_id) values
  ('a7200000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values
  ('general', (select id from public.departments where slug = 'general')),
  ('leadership', (select id from public.departments where slug = 'leadership'));

select is((select count(*)::int from public.levels where department_id = (select id from ctx where key = 'general')), 1,
  'General has one hidden level');
select is((select count(*)::int from public.levels where department_id = (select id from ctx where key = 'leadership')), 3,
  'Leadership has three levels');
select throws_ok($$ update public.departments set uses_levels = false where slug = 'camera-operations' $$,
  '23514', null, 'a team always has levels');

-- A volunteer can see a topic, and can't join one.
select pg_temp.act_as('a7200000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.departments where kind = 'topic'), 2, 'a volunteer can browse topics');
select throws_ok($$ select public.request_membership((select id from ctx where key = 'general')) $$,
  'P0001', 'department_not_open', 'nobody can request to join a topic');
select ok((select id from ctx where key = 'general') not in (select id from public.open_departments()),
  'topics are not offered as departments to join');

-- A Production Director builds and publishes topic courses like any other.
select pg_temp.act_as('a7200000-0000-4000-8000-000000000001');
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = (select id from ctx where key = 'general')),
  'Fake Guide to Serving'));
select isnt((select id from ctx where key = 'course'), null, 'a director can create a course in a topic');
insert into ctx values ('cv', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));

-- Topics have no practicals, competencies, or positions.
select throws_ok($$ insert into public.practicals (course_version_id, title) values ((select id from ctx where key = 'cv'), 'Fake practical') $$,
  'P0001', 'topic_not_allowed', 'a topic course cannot have a practical');
select throws_ok($$ insert into public.competencies (department_id, name) values ((select id from ctx where key = 'general'), 'Fake skill') $$,
  'P0001', 'topic_not_allowed', 'a topic cannot have a competency');
select throws_ok($$ insert into public.serving_roles (department_id, name) values ((select id from ctx where key = 'general'), 'Fake position') $$,
  'P0001', 'topic_not_allowed', 'a topic cannot have a position');

-- Teams are unaffected.
select lives_ok($$ insert into public.competencies (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake team skill') $$,
  'a team can still have a competency');

select * from finish();
rollback;
