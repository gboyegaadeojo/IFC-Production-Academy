-- Leader dashboard figures: SPEC §7 "Leader dashboard", SRS-RBAC-004. Counts only, scoped.
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

select pg_temp.new_user('d0000000-0000-4000-8000-000000000001', 'Test Camera Member');
select pg_temp.new_user('d0000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('d0000000-0000-4000-8000-000000000005', 'Test Audio Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('d0000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('d0000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');

create temporary table before (active_members integer, awaiting integer, in_progress integer);
grant all on before to authenticated;

select pg_temp.act_as('d0000000-0000-4000-8000-000000000004');
select results_eq(
  $$ select department_id from public.department_training_summary() $$,
  $$ values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855'::uuid) $$,
  'a department leader sees only their own department'
);
insert into before select active_members, awaiting_assessment, in_progress from public.department_training_summary();
reset role;

-- A new member joins, opens the seed lesson, and asks to be assessed on the seed practical.
insert into public.department_memberships (department_id, user_id, status, decided_at)
values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'd0000000-0000-4000-8000-000000000001', 'active', now());
select pg_temp.act_as('d0000000-0000-4000-8000-000000000001');
select public.record_lesson_view('cccccccc-0000-4000-8000-000000000001',
  (select lesson_key from public.lessons where course_version_id = 'cccccccc-0000-4000-8000-000000000011' limit 1));
select public.request_assessment('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000044');
select is_empty($$ select 1 from public.department_training_summary() $$, 'volunteers see no dashboard figures');
reset role;

select pg_temp.act_as('d0000000-0000-4000-8000-000000000004');
select results_eq(
  $$ select s.active_members - b.active_members, s.awaiting_assessment - b.awaiting, s.in_progress - b.in_progress
       from public.department_training_summary() s, before b $$,
  $$ values (1, 1, 1) $$,
  'the figures follow real records: one more member, waiting for assessment, in progress'
);
reset role;

select pg_temp.act_as('d0000000-0000-4000-8000-000000000005');
select is(
  (select count(*)::int from public.department_training_summary() where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  0, 'another department''s leader does not see camera figures'
);
reset role;

select * from finish();
rollback;
