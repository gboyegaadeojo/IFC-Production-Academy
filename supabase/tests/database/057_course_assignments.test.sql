-- Assigning a course: leaders only, a request and nothing more, audited, and no email until launch.
begin;
select no_plan();
-- Start with the launch switch off, as it was before go-live.
update public.organizations set notifications_live = false;

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

--   Leader of Camera  a7900000-0000-4000-8000-000000000001
--   Learner           a7900000-0000-4000-8000-000000000002
--   Other volunteer   a7900000-0000-4000-8000-000000000003
--   Leader of Audio   a7900000-0000-4000-8000-000000000004
select pg_temp.new_user('a7900000-0000-4000-8000-000000000001', 'Test Leader');
select pg_temp.new_user('a7900000-0000-4000-8000-000000000002', 'Test Learner');
select pg_temp.new_user('a7900000-0000-4000-8000-000000000003', 'Test Other');
select pg_temp.new_user('a7900000-0000-4000-8000-000000000004', 'Test Audio Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7900000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('a7900000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select pg_temp.act_as('a7900000-0000-4000-8000-000000000001');
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Fake assignment course'));
insert into ctx values ('cv', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values ((select id from ctx where key = 'cv'), 'Fake module');
insert into public.lessons (course_version_id, module_id, title) values
  ((select id from ctx where key = 'cv'),
   (select id from public.course_modules where course_version_id = (select id from ctx where key = 'cv')), 'Fake lesson');

select throws_ok(
  $$ select public.assign_course((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000002') $$,
  'P0001', 'course_not_available', 'a course that isn''t published can''t be assigned');
select public.publish_course_version((select id from ctx where key = 'cv'), 'First');

select lives_ok(
  $$ select public.assign_course((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000002') $$,
  'a leader can assign a course in their department');
select lives_ok(
  $$ select public.assign_course((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000002') $$,
  'doing it again is safe');
select is((select count(*)::int from public.course_assignments), 1, 'and records nothing new');
select ok(
  exists (select 1 from public.assignable_people((select id from ctx where key = 'course'))
          where display_name = 'Test Other'),
  'a leader can search anyone active');
select ok(
  exists (select 1 from public.department_training_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
          where user_id = 'a7900000-0000-4000-8000-000000000002' and state = 'not_started'),
  'someone assigned shows in the report before they start');
select throws_ok(
  $$ select public.assign_course((select id from ctx where key = 'course'), gen_random_uuid()) $$,
  'P0001', 'person_not_available', 'an unknown person is refused');
reset role;

select is((select count(*)::int from public.audit_events where target_table = 'course_assignments'
  and target_id = (select id from public.course_assignments)), 1, 'assigning goes in the audit log');
select is((select count(*)::int from public.notifications where kind = 'course_assigned'), 1,
  'they get one notice in the app, however many times it''s retried');
select is((select email_status::text from public.notifications where kind = 'course_assigned'), 'skipped',
  'and no email before launch');
select is((select count(*)::int from public.department_memberships
  where user_id = 'a7900000-0000-4000-8000-000000000002'), 0, 'it doesn''t add them to a department');
select is((select count(*)::int from public.serving_approvals
  where user_id = 'a7900000-0000-4000-8000-000000000002'), 0, 'or approve them to serve');

-- Their own, and nobody else's.
select pg_temp.act_as('a7900000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.course_assignments), 1, 'people read their own assignment');
select throws_ok(
  $$ select public.assign_course((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000003') $$,
  '42501', 'not_authorized', 'a volunteer can''t assign');
select throws_ok(
  $$ select public.remove_course_assignment((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000002') $$,
  '42501', 'not_authorized', 'or remove their own');
select is((select count(*)::int from public.assignable_people((select id from ctx where key = 'course'))), 0,
  'or list people');
select throws_ok($$ delete from public.course_assignments $$, '42501', null, 'nobody changes the table directly');

select pg_temp.act_as('a7900000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.course_assignments), 0, 'another volunteer can''t read it');

select pg_temp.act_as('a7900000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.course_assignments), 0, 'nor can another department''s leader');
select throws_ok(
  $$ select public.assign_course((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000003') $$,
  '42501', 'not_authorized', 'who can''t assign here either');

-- Removing keeps the record, and assigning again makes a new one.
select pg_temp.act_as('a7900000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.remove_course_assignment((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000002') $$,
  'a leader can remove an assignment');
select is((select count(*)::int from public.course_assignments where removed_at is not null), 1, 'the record stays');
select ok(
  not exists (select 1 from public.department_training_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
              where user_id = 'a7900000-0000-4000-8000-000000000002'),
  'and they leave the report, having never started');
reset role;

-- After launch, a new assignment is emailed, once.
update public.organizations set notifications_live = true;
select pg_temp.act_as('a7900000-0000-4000-8000-000000000001');
select public.assign_course((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000002');
select public.assign_course((select id from ctx where key = 'course'), 'a7900000-0000-4000-8000-000000000002');
reset role;
select is((select count(*)::int from public.course_assignments), 2, 'assigning again makes a new record');
select is((select count(*)::int from public.notifications where kind = 'course_assigned'
  and email_status = 'pending'), 1, 'and one email, once the Academy is live');

select * from finish();
rollback;
