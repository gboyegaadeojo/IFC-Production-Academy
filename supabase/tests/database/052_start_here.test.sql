-- Start here: only topics, only people who publish them, and team status only for team managers.
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

--   Director   a7400000-0000-4000-8000-000000000001
--   Volunteer  a7400000-0000-4000-8000-000000000002
select pg_temp.new_user('a7400000-0000-4000-8000-000000000001', 'Test Director');
select pg_temp.new_user('a7400000-0000-4000-8000-000000000002', 'Test Volunteer');
insert into public.user_roles (user_id, role_id) values
  ('a7400000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select pg_temp.act_as('a7400000-0000-4000-8000-000000000001');
insert into ctx values ('topic', public.create_course(
  (select l.id from public.levels l join public.departments d on d.id = l.department_id where d.slug = 'general'),
  'Fake Guide to Serving'));
insert into ctx values ('team', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Fake team course'));

select lives_ok($$ select public.set_course_start_here((select id from ctx where key = 'topic'), true) $$,
  'a director can mark a topic course Start here');
select ok((select start_here from public.courses where id = (select id from ctx where key = 'topic')), 'and it is saved');
select throws_ok($$ select public.set_course_start_here((select id from ctx where key = 'team'), true) $$,
  '42501', 'not_authorized', 'a department''s course cannot be marked Start here');
select lives_ok($$ select * from public.start_here_status('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  'a director can see the status for a team');

select pg_temp.act_as('a7400000-0000-4000-8000-000000000002');
select throws_ok($$ select public.set_course_start_here((select id from ctx where key = 'topic'), false) $$,
  '42501', 'not_authorized', 'a volunteer cannot change it');
select throws_ok($$ select * from public.start_here_status('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501', 'not_authorized', 'a volunteer cannot see who has finished');

select * from finish();
rollback;
