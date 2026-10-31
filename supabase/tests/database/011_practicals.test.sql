-- Practical assessments: SRS-ASSESS-001..008, SRS-COMP-001..004, ADD-ASSESS-01, SRS-RBAC-004.
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

-- Test people (all fake):
--   Camera member     b0000000-0000-4000-8000-000000000001
--   Second member     b0000000-0000-4000-8000-000000000002
--   Outsider          b0000000-0000-4000-8000-000000000003
--   Camera Leader     b0000000-0000-4000-8000-000000000004
--   Audio Leader      b0000000-0000-4000-8000-000000000005
--   Camera Trainer    b0000000-0000-4000-8000-000000000006  (assessment.record, no competency.approve)
select pg_temp.new_user('b0000000-0000-4000-8000-000000000001', 'Test Camera Member');
select pg_temp.new_user('b0000000-0000-4000-8000-000000000002', 'Test Second Member');
select pg_temp.new_user('b0000000-0000-4000-8000-000000000003', 'Test Outsider');
select pg_temp.new_user('b0000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('b0000000-0000-4000-8000-000000000005', 'Test Audio Leader');
select pg_temp.new_user('b0000000-0000-4000-8000-000000000006', 'Test Camera Trainer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('b0000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('b0000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'),
  ('b0000000-0000-4000-8000-000000000006', (select id from public.roles where key = 'trainer'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'b0000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'b0000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- A competency and role, then a course with a practical that grants it.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000004');
insert into public.competencies (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake tripod work');
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake tripod operator');
insert into ctx values
  ('comp', (select id from public.competencies where name = 'Fake tripod work')),
  ('role', (select id from public.serving_roles where name = 'Fake tripod operator'));
select public.set_role_competencies((select id from ctx where key = 'role'), array[(select id from ctx where key = 'comp')]);
insert into public.competencies (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake other');

insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Practical test course'));
insert into ctx values ('v1', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values ((select id from ctx where key = 'v1'), 'Module');
insert into public.lessons (course_version_id, module_id, title)
  values ((select id from ctx where key = 'v1'),
          (select id from public.course_modules where course_version_id = (select id from ctx where key = 'v1')), 'Lesson');
insert into public.practicals (course_version_id, title, competency_id)
  values ((select id from ctx where key = 'v1'), 'Fake tripod check', (select id from ctx where key = 'comp'));
insert into ctx values
  ('p1', (select id from public.practicals where course_version_id = (select id from ctx where key = 'v1'))),
  ('pkey', (select practical_key from public.practicals where course_version_id = (select id from ctx where key = 'v1')));
select results_eq(
  $$ select require_all_required, pass_min_percent, is_required from public.practicals where id = (select id from ctx where key = 'p1') $$,
  $$ values (true, 80, true) $$,
  'the default rule is every required item and 80% of all'
);
select throws_ok(
  $$ select public.publish_course_version((select id from ctx where key = 'v1'), 'First') $$,
  'P0001', 'practical_has_no_criteria', 'a practical needs a checklist before it goes live'
);
insert into public.practical_criteria (practical_id, course_version_id, label, is_required, sort_order) values
  ((select id from ctx where key = 'p1'), (select id from ctx where key = 'v1'), 'Fake required one', true, 10),
  ((select id from ctx where key = 'p1'), (select id from ctx where key = 'v1'), 'Fake required two', true, 20),
  ((select id from ctx where key = 'p1'), (select id from ctx where key = 'v1'), 'Fake optional one', false, 30),
  ((select id from ctx where key = 'p1'), (select id from ctx where key = 'v1'), 'Fake optional two', false, 40),
  ((select id from ctx where key = 'p1'), (select id from ctx where key = 'v1'), 'Fake optional three', false, 50);
insert into ctx values
  ('r1', (select id from public.practical_criteria where label = 'Fake required one')),
  ('r2', (select id from public.practical_criteria where label = 'Fake required two')),
  ('o1', (select id from public.practical_criteria where label = 'Fake optional one')),
  ('o2', (select id from public.practical_criteria where label = 'Fake optional two')),
  ('o3', (select id from public.practical_criteria where label = 'Fake optional three'));
select is(public.publish_course_version((select id from ctx where key = 'v1'), 'First'), 1, 'the course is published');
reset role;

select pg_temp.act_as('b0000000-0000-4000-8000-000000000004');
update public.practicals set title = 'Changed' where id = (select id from ctx where key = 'p1');
reset role;
select is((select title from public.practicals where id = (select id from ctx where key = 'p1')), 'Fake tripod check',
  'a published practical cannot be edited');

-- ---------------------------------------------------------------------------
-- Learners see the checklist and ask to be assessed (SRS-ASSESS-001, ADD-ASSESS-01)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.practical_criteria where practical_id = (select id from ctx where key = 'p1')), 5,
  'members can read what will be observed');
insert into ctx values ('req', public.request_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey')));
select is(public.request_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey')),
  (select id from ctx where key = 'req'), 'asking again returns the same request');
select throws_ok(
  $$ select * from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
       'b0000000-0000-4000-8000-000000000002', array[(select id from ctx where key = 'r1')], '') $$,
  '42501', 'not_authorized', 'volunteers cannot record assessments'
);
reset role;

select pg_temp.act_as('b0000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.request_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey')) $$,
  '42501', 'not_authorized', 'someone outside the department cannot ask to be assessed'
);
reset role;

-- ---------------------------------------------------------------------------
-- The system works out the outcome (decided 2026-10-30; SRS-ASSESS-003, -004)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b0000000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.assessment_requests where closed_at is null), 1,
  'the trainer sees the open request');
select is((select count(*)::int from public.assessable_members('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
           where user_id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002')), 2,
  'the trainer can list the department''s active members');
select throws_ok(
  $$ select * from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
       'b0000000-0000-4000-8000-000000000006', '{}', '') $$,
  '42501', 'cannot_assess_self', 'nobody assesses themselves'
);
select throws_ok(
  $$ select * from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
       'b0000000-0000-4000-8000-000000000003', '{}', '') $$,
  'P0001', 'learner_not_member', 'only members are assessed'
);
-- Every optional item but one required: Further practice, whatever the share.
select is(
  (select outcome::text from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
     'b0000000-0000-4000-8000-000000000001',
     array[(select id from ctx where key = 'r1'), (select id from ctx where key = 'o1'), (select id from ctx where key = 'o2'), (select id from ctx where key = 'o3')],
     'Practise the second step.')),
  'further_practice', 'a missed required item means further practice'
);
reset role;
select results_eq(
  $$ select observer_name, observed_count, required_observed, criteria_count, feedback, course_version_id
       from public.practical_assessments where user_id = 'b0000000-0000-4000-8000-000000000001' $$,
  $$ values ('Test Camera Trainer'::text, 4, 1, 5, 'Practise the second step.'::text, (select id from ctx where key = 'v1')) $$,
  'the assessment records the observer, what was seen, the version, and feedback'
);
select isnt((select closed_at from public.assessment_requests where id = (select id from ctx where key = 'req')), null,
  'recording an assessment closes the request');
select is_empty($$ select 1 from public.competency_records where user_id = 'b0000000-0000-4000-8000-000000000001' $$,
  'further practice grants nothing');

select pg_temp.act_as('b0000000-0000-4000-8000-000000000006');
-- Both required but only 3 of 5 (60%): still further practice.
select is(
  (select outcome::text from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
     'b0000000-0000-4000-8000-000000000001',
     array[(select id from ctx where key = 'r1'), (select id from ctx where key = 'r2'), (select id from ctx where key = 'o1')], '')),
  'further_practice', 'every required item but below 80% of all is further practice'
);
-- Both required and 4 of 5 (80%), with a criterion from elsewhere ignored: pass.
select is(
  (select outcome::text from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
     'b0000000-0000-4000-8000-000000000001',
     array[(select id from ctx where key = 'r1'), (select id from ctx where key = 'r2'), (select id from ctx where key = 'o1'),
           (select id from ctx where key = 'o2'), '00000000-0000-4000-8000-000000000000'::uuid], 'Well done.')),
  'pass', 'every required item and 80% of all passes'
);
select throws_ok(
  $$ select * from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
       'b0000000-0000-4000-8000-000000000001', '{}', '') $$,
  'P0001', 'already_passed', 'a passed practical is not reassessed'
);
reset role;

select is(
  (select r.status::text || ':' || (r.granted_by_assessment_id = a.id)::text
     from public.competency_records r
     join public.practical_assessments a on a.user_id = r.user_id and a.outcome = 'pass'
    where r.user_id = 'b0000000-0000-4000-8000-000000000001'),
  'approved:true', 'a pass grants the competency, linked to the assessment (SRS-COMP-001, -002)'
);
select is(
  (select status::text from public.serving_approvals where user_id = 'b0000000-0000-4000-8000-000000000001'
     and role_id = (select id from ctx where key = 'role')),
  'approved', 'Approved to Serve follows automatically (SRS-COMP-004)'
);
select ok(
  exists (select 1 from public.audit_events where action = 'practical_assessment.created'
            and actor_id = 'b0000000-0000-4000-8000-000000000006'),
  'assessments are audited (SRS-ASSESS-006)'
);

-- ---------------------------------------------------------------------------
-- Visibility (SRS-ASSESS-007, SRS-RBAC-004)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.practical_assessments), 3, 'learners see their own assessments and feedback');
select throws_ok(
  $$ update public.practical_assessments set outcome = 'pass' $$,
  '42501', null, 'assessments cannot be changed directly'
);
reset role;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.practical_assessments $$, 'a volunteer cannot read another''s assessments');
reset role;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000005');
select is_empty($$ select 1 from public.practical_assessments $$, 'another department''s leader cannot read them');
reset role;

-- ---------------------------------------------------------------------------
-- Corrections (SRS-ASSESS-006)
-- ---------------------------------------------------------------------------
insert into ctx values ('pass', (select id from public.practical_assessments
  where user_id = 'b0000000-0000-4000-8000-000000000001' and outcome = 'pass'));
select pg_temp.act_as('b0000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.void_practical_assessment((select id from ctx where key = 'pass'), 'Wrong person') $$,
  '42501', 'not_authorized', 'a trainer without competency approval cannot withdraw an assessment'
);
reset role;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.void_practical_assessment((select id from ctx where key = 'pass'), '') $$,
  '22023', 'reason_required', 'withdrawing needs a reason'
);
select lives_ok(
  $$ select public.void_practical_assessment((select id from ctx where key = 'pass'), 'Recorded against the wrong person') $$,
  'the leader withdraws the assessment'
);
reset role;
select results_eq(
  $$ select status::text, suspend_reason from public.competency_records where user_id = 'b0000000-0000-4000-8000-000000000001' $$,
  $$ values ('suspended'::text, 'Assessment voided: Recorded against the wrong person'::text) $$,
  'the competency it granted is suspended with the reason'
);
select is(
  (select status::text from public.serving_approvals where user_id = 'b0000000-0000-4000-8000-000000000001'),
  'withdrawn', 'and Approved to Serve is withdrawn'
);
select is((select count(*)::int from public.practical_assessments where id = (select id from ctx where key = 'pass') and voided_at is not null), 1,
  'the voided assessment is kept');

-- Reassessing after a void passes again and restores everything.
select pg_temp.act_as('b0000000-0000-4000-8000-000000000006');
select is(
  (select outcome::text from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
     'b0000000-0000-4000-8000-000000000001',
     array[(select id from ctx where key = 'r1'), (select id from ctx where key = 'r2'), (select id from ctx where key = 'o1'), (select id from ctx where key = 'o2')], '')),
  'pass', 'a fresh assessment after a void can pass'
);
reset role;
select is((select status::text from public.serving_approvals where user_id = 'b0000000-0000-4000-8000-000000000001'),
  'approved', 'and Approved to Serve returns');

-- Waiting before reassessment (SRS-ASSESS-005).
select pg_temp.act_as('b0000000-0000-4000-8000-000000000004');
insert into ctx values ('v2', public.start_course_draft((select id from ctx where key = 'course')));
select is(
  (select count(*)::int from public.practical_criteria pc join public.practicals p on p.id = pc.practical_id
    where p.course_version_id = (select id from ctx where key = 'v2') and p.practical_key = (select id from ctx where key = 'pkey')),
  5, 'a new draft copies the practical and its checklist under the same key'
);
update public.practicals set retry_wait_days = 7 where course_version_id = (select id from ctx where key = 'v2');
select public.publish_course_version((select id from ctx where key = 'v2'), 'Wait a week');
reset role;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000006');
select is(
  (select outcome::text from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
     'b0000000-0000-4000-8000-000000000002', array[(select id from ctx where key = 'r1')], '')),
  'further_practice', 'the second member needs more practice'
);
select throws_ok(
  $$ select * from public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
       'b0000000-0000-4000-8000-000000000002', '{}', '') $$,
  'P0001', 'reassessment_too_soon', 'reassessment waits for the configured days'
);
reset role;

select * from finish();
rollback;
