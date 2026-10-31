-- Quizzes: SRS-QUIZ-001..007, SRS-CUR-008, SRS-RBAC-004.
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
--   Camera member     80000000-0000-4000-8000-000000000001
--   Second member     80000000-0000-4000-8000-000000000002
--   Outsider          80000000-0000-4000-8000-000000000003  (no memberships)
--   Camera Leader     80000000-0000-4000-8000-000000000004
--   Audio Leader      80000000-0000-4000-8000-000000000005
select pg_temp.new_user('80000000-0000-4000-8000-000000000001', 'Test Camera Member');
select pg_temp.new_user('80000000-0000-4000-8000-000000000002', 'Test Second Member');
select pg_temp.new_user('80000000-0000-4000-8000-000000000003', 'Test Outsider');
select pg_temp.new_user('80000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('80000000-0000-4000-8000-000000000005', 'Test Audio Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('80000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('80000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '80000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '80000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- A camera course with one lesson and a quiz at the end.
select pg_temp.act_as('80000000-0000-4000-8000-000000000004');
insert into ctx values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Quiz test course'));
insert into ctx values ('v1', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title, sort_order)
  values ((select id from ctx where key = 'v1'), 'Module', 10);
insert into public.lessons (course_version_id, module_id, title, sort_order)
  values ((select id from ctx where key = 'v1'),
          (select id from public.course_modules where course_version_id = (select id from ctx where key = 'v1')),
          'Only lesson', 10);
insert into public.quizzes (course_version_id, title) values ((select id from ctx where key = 'v1'), 'Check');
insert into ctx values
  ('quiz1', (select id from public.quizzes where course_version_id = (select id from ctx where key = 'v1'))),
  ('quizkey', (select quiz_key from public.quizzes where course_version_id = (select id from ctx where key = 'v1')));

select results_eq(
  $$ select pass_percent, max_attempts, answer_policy::text, is_required
       from public.quizzes where id = (select id from ctx where key = 'quiz1') $$,
  $$ values (80, 3, 'after_final_attempt'::text, true) $$,
  'a new quiz defaults to an 80% pass mark and 3 attempts (SRS-QUIZ-003)'
);
select throws_ok(
  $$ select public.publish_course_version((select id from ctx where key = 'v1'), 'First') $$,
  'P0001', 'quiz_has_no_questions', 'a quiz without questions cannot be published'
);

-- Question shapes (SRS-QUIZ-001).
select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, course_version_id, kind, prompt, options)
     values ((select id from ctx where key = 'quiz1'), (select id from ctx where key = 'v1'), 'single', 'Two right?',
             '[{"key":"a","label":"One","correct":true},{"key":"b","label":"Two","correct":true}]') $$,
  '23514', null, 'single choice needs exactly one correct option'
);
select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, course_version_id, kind, prompt, options)
     values ((select id from ctx where key = 'quiz1'), (select id from ctx where key = 'v1'), 'multiple', 'Bad key',
             '[{"key":"z","label":"One","correct":true},{"key":"b","label":"Two","correct":false}]') $$,
  '23514', null, 'option keys are a to f'
);
select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, course_version_id, kind, prompt, options)
     values ((select id from ctx where key = 'quiz1'), (select id from ctx where key = 'v1'), 'true_false', 'Three?',
             '[{"key":"a","label":"True","correct":true},{"key":"b","label":"False","correct":false},{"key":"c","label":"Maybe","correct":false}]') $$,
  '23514', null, 'true/false has exactly two options'
);
select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, course_version_id, kind, prompt, scenario, options)
     values ((select id from ctx where key = 'quiz1'), (select id from ctx where key = 'v1'), 'single', 'Q', 'Not a scenario',
             '[{"key":"a","label":"One","correct":true},{"key":"b","label":"Two","correct":false}]') $$,
  '23514', null, 'only scenario questions have a situation'
);
select lives_ok(
  $$ insert into public.quiz_questions (quiz_id, course_version_id, kind, prompt, explanation, options, sort_order)
     values ((select id from ctx where key = 'quiz1'), (select id from ctx where key = 'v1'), 'single', 'Fake question one',
             'Because one.',
             '[{"key":"a","label":"Right","correct":true},{"key":"b","label":"Wrong","correct":false}]', 10),
            ((select id from ctx where key = 'quiz1'), (select id from ctx where key = 'v1'), 'multiple', 'Fake question two',
             '', '[{"key":"a","label":"Yes","correct":true},{"key":"b","label":"No","correct":false},{"key":"c","label":"Also yes","correct":true}]', 20) $$,
  'a leader adds single-choice and multiple-select questions to the draft'
);
insert into ctx values
  ('q1', (select id from public.quiz_questions where prompt = 'Fake question one')),
  ('q2', (select id from public.quiz_questions where prompt = 'Fake question two'));
update public.quizzes set max_attempts = 2 where id = (select id from ctx where key = 'quiz1');
select is(public.publish_course_version((select id from ctx where key = 'v1'), 'First'), 1,
  'the course and its quiz are published');
reset role;

-- ---------------------------------------------------------------------------
-- What learners can read (SRS-QUIZ-006)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('80000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.quizzes where id = (select id from ctx where key = 'quiz1')), 1,
  'members read the published quiz''s settings');
select is_empty($$ select 1 from public.quiz_questions $$,
  'members cannot read questions, which hold the correct answers');

insert into ctx values ('a1', public.start_quiz_attempt((select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey')));
select is(
  public.start_quiz_attempt((select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey')),
  (select id from ctx where key = 'a1'),
  'starting again returns the attempt in progress'
);
select is(
  (select count(*)::int from public.quiz_attempt_questions((select id from ctx where key = 'a1'))),
  2, 'the attempt hands out its questions'
);
select ok(
  (select bool_and(not (o ? 'correct'))
     from public.quiz_attempt_questions((select id from ctx where key = 'a1')) q,
          jsonb_array_elements(q.options) o),
  'questions reach the learner without the correct answers'
);
select throws_ok(
  $$ select * from public.quiz_attempt_review((select id from ctx where key = 'a1')) $$,
  '42501', 'not_authorized', 'an attempt in progress has no review'
);

-- ---------------------------------------------------------------------------
-- Scoring (the system decides, decided 2026-10-30; SRS-QUIZ-002, -005)
-- ---------------------------------------------------------------------------
select is(
  public.submit_quiz_attempt((select id from ctx where key = 'a1'), jsonb_build_object(
    (select id from ctx where key = 'q1')::text, jsonb_build_array('a', 'z'),
    (select id from ctx where key = 'q2')::text, jsonb_build_array('a'),
    '00000000-0000-4000-8000-000000000000', jsonb_build_array('a'))),
  false,
  'one of two right is 50%, below the 80% pass mark'
);
select results_eq(
  $$ select score_percent, correct_count, passed, submitted_at is not null, course_version_id, attempt_number
       from public.quiz_attempts where id = (select id from ctx where key = 'a1') $$,
  $$ values (50, 1, false, true, (select id from ctx where key = 'v1'), 1) $$,
  'the attempt records the score, result, time, and version'
);
select is(
  (select answers from public.quiz_attempts where id = (select id from ctx where key = 'a1')),
  jsonb_build_object((select id from ctx where key = 'q1')::text, jsonb_build_array('a'),
                     (select id from ctx where key = 'q2')::text, jsonb_build_array('a')),
  'only real options of the attempt''s questions are kept'
);
select is(
  public.submit_quiz_attempt((select id from ctx where key = 'a1'), jsonb_build_object(
    (select id from ctx where key = 'q1')::text, jsonb_build_array('a'),
    (select id from ctx where key = 'q2')::text, jsonb_build_array('a', 'c'))),
  false,
  'submitting again returns the first result and changes nothing'
);
select ok(
  (select bool_and(is_correct is null and not (options -> 0 ? 'correct') and explanation = '')
     from public.quiz_attempt_review((select id from ctx where key = 'a1'))),
  'answers stay hidden while attempts remain (after_final_attempt)'
);

insert into ctx values ('a2', public.start_quiz_attempt((select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey')));
select is(public.submit_quiz_attempt((select id from ctx where key = 'a2'), '{}'::jsonb), false,
  'unanswered questions count as wrong');
select is((select score_percent from public.quiz_attempts where id = (select id from ctx where key = 'a2')), 0,
  'an empty attempt scores 0%');
select results_eq(
  $$ select is_correct, explanation from public.quiz_attempt_review((select id from ctx where key = 'a1')) $$,
  $$ values (true, 'Because one.'::text), (false, ''::text) $$,
  'once every attempt is used, the answers and explanations are shown'
);
select throws_ok(
  $$ select public.start_quiz_attempt((select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey')) $$,
  'P0001', 'no_attempts_left', 'no attempts beyond the limit (SRS-QUIZ-002)'
);
select throws_ok(
  $$ select public.grant_quiz_attempt('80000000-0000-4000-8000-000000000001', (select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey'), 'Please') $$,
  '42501', 'not_authorized', 'learners cannot give themselves attempts'
);

-- Nobody writes attempts directly.
select throws_ok(
  $$ update public.quiz_attempts set passed = true, score_percent = 100 $$,
  '42501', null, 'attempts cannot be changed directly'
);
select throws_ok(
  $$ insert into public.quiz_attempts (user_id, quiz_id, quiz_key, course_id, course_version_id, department_id,
       attempt_number, question_ids, question_count, pass_percent)
     values ('80000000-0000-4000-8000-000000000001', (select id from ctx where key = 'quiz1'),
       (select id from ctx where key = 'quizkey'), (select id from ctx where key = 'course'),
       (select id from ctx where key = 'v1'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 9,
       array[(select id from ctx where key = 'q1')], 1, 1) $$,
  '42501', null, 'attempts cannot be inserted directly'
);
reset role;

-- ---------------------------------------------------------------------------
-- Who else can see and act (SRS-QUIZ-007, SRS-RBAC-004)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('80000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.quiz_attempts $$,
  'a volunteer cannot read another volunteer''s attempts');
select throws_ok(
  $$ select * from public.quiz_attempt_review((select id from ctx where key = 'a1')) $$,
  '42501', 'not_authorized', 'a volunteer cannot review another volunteer''s attempt'
);
select throws_ok(
  $$ select public.submit_quiz_attempt((select id from ctx where key = 'a1'), '{}'::jsonb) $$,
  '42501', 'not_authorized', 'a volunteer cannot submit another volunteer''s attempt'
);
reset role;

select pg_temp.act_as('80000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.start_quiz_attempt((select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey')) $$,
  '42501', 'not_authorized', 'someone outside the department cannot take the quiz'
);
reset role;

select pg_temp.act_as('80000000-0000-4000-8000-000000000005');
select is_empty($$ select 1 from public.quiz_attempts $$,
  'another department''s leader cannot read camera attempts');
select throws_ok(
  $$ select public.grant_quiz_attempt('80000000-0000-4000-8000-000000000001', (select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey'), '') $$,
  '42501', 'not_authorized', 'another department''s leader cannot give attempts'
);
reset role;

select pg_temp.act_as('80000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.quiz_attempts), 2,
  'the department''s leader reads its members'' attempts (report.view)');
select is((select count(*)::int from public.quiz_attempt_review((select id from ctx where key = 'a1')) where is_correct is not null), 2,
  'the leader sees which answers were right');
select throws_ok(
  $$ select public.grant_quiz_attempt('80000000-0000-4000-8000-000000000002', (select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey'), '') $$,
  'P0001', 'no_attempts_yet', 'extra attempts are only for people who have taken the quiz'
);
select lives_ok(
  $$ select public.grant_quiz_attempt('80000000-0000-4000-8000-000000000001', (select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey'), 'Went through it together') $$,
  'the leader gives another attempt after coaching (SRS-QUIZ-004)'
);
reset role;
select is(
  (select count(*)::int from public.audit_events where action = 'quiz_attempt_allowance.created'
     and actor_id = '80000000-0000-4000-8000-000000000004'),
  1, 'giving an attempt is audited'
);

select pg_temp.act_as('80000000-0000-4000-8000-000000000001');
insert into ctx values ('a3', public.start_quiz_attempt((select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey')));
select is(
  public.submit_quiz_attempt((select id from ctx where key = 'a3'), jsonb_build_object(
    (select id from ctx where key = 'q1')::text, jsonb_build_array('a'),
    (select id from ctx where key = 'q2')::text, jsonb_build_array('c', 'a'))),
  true,
  'all right passes; multiple select needs exactly the correct options'
);
select results_eq(
  $$ select attempt_number, score_percent from public.quiz_attempts where id = (select id from ctx where key = 'a3') $$,
  $$ values (3, 100) $$,
  'the extra attempt is attempt 3 and scores 100%'
);
select throws_ok(
  $$ select public.start_quiz_attempt((select id from ctx where key = 'course'), (select id from ctx where key = 'quizkey')) $$,
  'P0001', 'quiz_already_passed', 'a passed quiz is not retaken'
);
reset role;

-- ---------------------------------------------------------------------------
-- Versions (SRS-CUR-008): published quizzes don't change; drafts copy them with the same keys
-- ---------------------------------------------------------------------------
select pg_temp.act_as('80000000-0000-4000-8000-000000000004');
update public.quizzes set pass_percent = 10 where id = (select id from ctx where key = 'quiz1');
update public.quiz_questions set prompt = 'Changed' where id = (select id from ctx where key = 'q1');
select throws_ok(
  $$ select public.delete_quiz_question((select id from ctx where key = 'q1')) $$,
  '42501', 'not_authorized', 'questions in a published version cannot be removed'
);
insert into ctx values ('v2', public.start_course_draft((select id from ctx where key = 'course')));
select results_eq(
  $$ select q.quiz_key, (select count(*)::int from public.quiz_questions qq where qq.quiz_id = q.id)
       from public.quizzes q where q.course_version_id = (select id from ctx where key = 'v2') $$,
  $$ values ((select id from ctx where key = 'quizkey'), 2) $$,
  'a new draft copies the quiz and its questions under the same key'
);
reset role;
select results_eq(
  $$ select q.pass_percent, qq.prompt from public.quizzes q join public.quiz_questions qq on qq.quiz_id = q.id
      where qq.id = (select id from ctx where key = 'q1') $$,
  $$ values (80, 'Fake question one'::text) $$,
  'the published quiz and its questions were not changed'
);

select * from finish();
rollback;
