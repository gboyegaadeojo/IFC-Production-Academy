-- An optional due date when assigning a course: set, changed, or taken off, never in the past.
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

--   Leader of Camera  a8000000-0000-4000-8000-000000000001
--   Learner           a8000000-0000-4000-8000-000000000002
--   Other learner     a8000000-0000-4000-8000-000000000003
select pg_temp.new_user('a8000000-0000-4000-8000-000000000001', 'Test Due Leader');
select pg_temp.new_user('a8000000-0000-4000-8000-000000000002', 'Test Due Learner');
select pg_temp.new_user('a8000000-0000-4000-8000-000000000003', 'Test Due Other');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8000000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Fake due date course'));
insert into ctx values ('cv', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values ((select id from ctx where key = 'cv'), 'Fake module');
insert into public.lessons (course_version_id, module_id, title) values
  ((select id from ctx where key = 'cv'),
   (select id from public.course_modules where course_version_id = (select id from ctx where key = 'cv')), 'Fake lesson');
select public.publish_course_version((select id from ctx where key = 'cv'), 'First');

select throws_ok(
  $$ select public.assign_course((select id from ctx where key = 'course'), 'a8000000-0000-4000-8000-000000000002', '2000-01-01') $$,
  'P0001', 'due_date_past', 'a due date in the past is refused');
select is(
  public.assign_course((select id from ctx where key = 'course'), 'a8000000-0000-4000-8000-000000000002', '2099-03-01'),
  'assigned', 'a leader can assign with a due date');
select is(
  public.assign_course((select id from ctx where key = 'course'), 'a8000000-0000-4000-8000-000000000002', '2099-03-01'),
  'unchanged', 'the same date again changes nothing');
select is(
  public.assign_course((select id from ctx where key = 'course'), 'a8000000-0000-4000-8000-000000000003'),
  'assigned', 'the due date is optional');
reset role;

select is((select due_on from public.course_assignments where user_id = 'a8000000-0000-4000-8000-000000000002'),
  '2099-03-01'::date, 'the due date is kept');
select is((select due_on from public.course_assignments where user_id = 'a8000000-0000-4000-8000-000000000003'),
  null, 'and left empty when there isn''t one');
select is((select body from public.notifications where user_id = 'a8000000-0000-4000-8000-000000000002'),
  'A leader asked you to take this course by Sun, Mar 1.', 'the notice says when it''s due');
select is((select count(*)::int from public.notifications where user_id = 'a8000000-0000-4000-8000-000000000002'), 1,
  'once, however many times it''s retried');

-- Changing it keeps the one assignment, tells them, and is audited.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select is(
  public.assign_course((select id from ctx where key = 'course'), 'a8000000-0000-4000-8000-000000000002', '2099-03-15'),
  'updated', 'a new date updates the assignment');
select is(
  public.assign_course((select id from ctx where key = 'course'), 'a8000000-0000-4000-8000-000000000002'),
  'updated', 'and the date can be taken off');
reset role;
select is((select count(*)::int from public.course_assignments where user_id = 'a8000000-0000-4000-8000-000000000002'), 1,
  'it''s still one assignment');
select is((select due_on from public.course_assignments where user_id = 'a8000000-0000-4000-8000-000000000002'),
  null, 'with no due date now');
select is((select count(*)::int from public.notifications where user_id = 'a8000000-0000-4000-8000-000000000002'
  and title in ('New due date: Fake due date course', 'No due date now: Fake due date course')), 2,
  'they hear about each change');
select is((select count(*)::int from public.audit_events where target_table = 'course_assignments'
  and target_id = (select id from public.course_assignments where user_id = 'a8000000-0000-4000-8000-000000000002')), 3,
  'and each change goes in the audit log');

-- A volunteer still can't assign, with or without a date.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.assign_course((select id from ctx where key = 'course'), 'a8000000-0000-4000-8000-000000000003', '2099-03-01') $$,
  '42501', 'not_authorized', 'a volunteer can''t assign');
reset role;

select * from finish();
rollback;
