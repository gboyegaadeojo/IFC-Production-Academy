-- Moving courses within a level.
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

select pg_temp.new_user('a7500000-0000-4000-8000-000000000001', 'Test Director');
select pg_temp.new_user('a7500000-0000-4000-8000-000000000002', 'Test Volunteer');
insert into public.user_roles (user_id, role_id) values
  ('a7500000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values ('level', (select l.id from public.levels l join public.departments d on d.id = l.department_id where d.slug = 'general'));

select pg_temp.act_as('a7500000-0000-4000-8000-000000000001');
insert into ctx values ('one', public.create_course((select id from ctx where key = 'level'), 'Fake one'));
insert into ctx values ('two', public.create_course((select id from ctx where key = 'level'), 'Fake two'));
select public.move_course((select id from ctx where key = 'one'), -1);
select public.move_course((select id from ctx where key = 'two'), 1);
select public.move_course((select id from ctx where key = 'one'), 1);
select ok(
  (select sort_order from public.courses where id = (select id from ctx where key = 'two')) <
  (select sort_order from public.courses where id = (select id from ctx where key = 'one')),
  'moving a course down puts it after the next one');
select lives_ok($$ select public.move_course((select id from ctx where key = 'one'), 1) $$,
  'moving the last course down does nothing');

select pg_temp.act_as('a7500000-0000-4000-8000-000000000002');
select throws_ok($$ select public.move_course((select id from ctx where key = 'one'), -1) $$,
  '42501', 'not_authorized', 'a volunteer cannot reorder courses');

select * from finish();
rollback;
