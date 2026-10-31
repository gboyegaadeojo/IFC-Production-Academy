-- Reports and exports: SRS-REPORT-001..007, SRS-AUDIT-001, SRS-RBAC-004.
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

--   Member   f0000000-0000-4000-8000-000000000001
--   Trainer  f0000000-0000-4000-8000-000000000006  (report.view, no report.export)
--   Leader   f0000000-0000-4000-8000-000000000004
--   Audio    f0000000-0000-4000-8000-000000000005
select pg_temp.new_user('f0000000-0000-4000-8000-000000000001', 'Test Report Member');
select pg_temp.new_user('f0000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('f0000000-0000-4000-8000-000000000005', 'Test Audio Leader');
select pg_temp.new_user('f0000000-0000-4000-8000-000000000006', 'Test Camera Trainer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('f0000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('f0000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'),
  ('f0000000-0000-4000-8000-000000000006', (select id from public.roles where key = 'trainer'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'f0000000-0000-4000-8000-000000000001', 'active', now());

-- The member works through the seed course: not started → in progress → awaiting assessment.
create function pg_temp.state() returns text language sql as $$
  select state from public.department_training_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
   where user_id = 'f0000000-0000-4000-8000-000000000001' and course_id = 'cccccccc-0000-4000-8000-000000000001';
$$;

select pg_temp.act_as('f0000000-0000-4000-8000-000000000006');
select is(pg_temp.state(), 'not_started', 'a new member has not started');
reset role;

select pg_temp.act_as('f0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.department_training_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501', 'not_authorized', 'volunteers cannot run reports'
);
select public.complete_lesson('cccccccc-0000-4000-8000-000000000001',
  (select lesson_key from public.lessons where course_version_id = 'cccccccc-0000-4000-8000-000000000011' limit 1));
reset role;

select pg_temp.act_as('f0000000-0000-4000-8000-000000000006');
select is(pg_temp.state(), 'in_progress', 'the required quiz is still to do');
reset role;

-- Pass the seed quiz (both options are fake).
select pg_temp.act_as('f0000000-0000-4000-8000-000000000001');
create temporary table attempt (id uuid);
grant all on attempt to authenticated;
insert into attempt values (public.start_quiz_attempt('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000032'));
select public.submit_quiz_attempt((select id from attempt), (
  select jsonb_object_agg(q.question_id::text, jsonb_build_array('a'))
  from public.quiz_attempt_questions((select id from attempt)) q));
reset role;

select pg_temp.act_as('f0000000-0000-4000-8000-000000000006');
select is(pg_temp.state(), 'awaiting_assessment', 'lessons and quiz done: awaiting assessment');
select is(
  (select state from public.department_readiness_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
    where user_id = 'f0000000-0000-4000-8000-000000000001' and kind = 'role' and name = 'Sample role (seed data)'),
  'not_approved', 'readiness is reported separately: finishing learning never approves anyone'
);
select throws_ok(
  $$ select public.log_report_export('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'training', 1) $$,
  '42501', 'not_authorized', 'viewing reports does not include exporting them'
);
select public.record_practical_assessment('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000044',
  'f0000000-0000-4000-8000-000000000001',
  array(select id from public.practical_criteria where practical_id = 'cccccccc-0000-4000-8000-000000000043'), '');
select is(pg_temp.state(), 'completed', 'a passed practical completes the course');
select is(
  (select state from public.department_readiness_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
    where user_id = 'f0000000-0000-4000-8000-000000000001' and kind = 'role' and name = 'Sample role (seed data)'),
  'approved_to_serve', 'and the role shows Approved to serve'
);
reset role;

select pg_temp.act_as('f0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select * from public.department_readiness_report('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501', 'not_authorized', 'another department''s leader cannot report on camera'
);
reset role;

select pg_temp.act_as('f0000000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.log_report_export('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'readiness', 12) $$,
  'the leader may export'
);
reset role;
select ok(
  exists (select 1 from public.audit_events where action = 'report.exported'
            and actor_id = 'f0000000-0000-4000-8000-000000000004' and metadata ->> 'report' = 'readiness'),
  'exports are audited'
);

select * from finish();
rollback;
