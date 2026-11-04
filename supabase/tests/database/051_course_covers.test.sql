-- Course covers: who can set one, and what a path has to look like.
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

--   Camera leader  a7300000-0000-4000-8000-000000000001
--   Audio leader   a7300000-0000-4000-8000-000000000002
--   Volunteer      a7300000-0000-4000-8000-000000000003
select pg_temp.new_user('a7300000-0000-4000-8000-000000000001', 'Test Camera Leader');
select pg_temp.new_user('a7300000-0000-4000-8000-000000000002', 'Test Audio Leader');
select pg_temp.new_user('a7300000-0000-4000-8000-000000000003', 'Test Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7300000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('a7300000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select pg_temp.act_as('a7300000-0000-4000-8000-000000000001');
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Fake cover course'));
create function pg_temp.cover_path() returns text language sql as $$
  select (select id from ctx where key = 'course')::text || '/11111111-1111-4111-8111-111111111111.png';
$$;

select lives_ok($$ select public.set_course_cover((select id from ctx where key = 'course'), pg_temp.cover_path()) $$,
  'a leader can set a cover in their own department');
select is((select cover_image_path from public.courses where id = (select id from ctx where key = 'course')), pg_temp.cover_path(),
  'the path is saved');
select throws_ok($$ select public.set_course_cover((select id from ctx where key = 'course'), '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png') $$,
  '42501', 'not_authorized', 'a path has to be inside the course''s own folder');

select pg_temp.act_as('a7300000-0000-4000-8000-000000000002');
select throws_ok($$ select public.set_course_cover((select id from ctx where key = 'course'), null) $$,
  '42501', 'not_authorized', 'another department''s leader cannot change it');

select pg_temp.act_as('a7300000-0000-4000-8000-000000000003');
select throws_ok($$ select public.set_course_cover((select id from ctx where key = 'course'), null) $$,
  '42501', 'not_authorized', 'a volunteer cannot change it');

select * from finish();
rollback;
