-- Quizzes: SRS-QUIZ-001..007, SRS-PROG-005, SRS-CUR-008.
--
-- * A quiz belongs to a course version, like a lesson, and is copied into each new draft. It sits
--   after a module (after_module_key) or at the end of the course (null). quiz_key and question_key
--   stay the same across versions, so attempts and passes follow the quiz through republishing.
-- * Leaders set the rules per quiz: pass mark (default 80%), attempts (default 3, or unlimited),
--   question order, when correct answers are shown, and whether it's required to finish the course.
-- * The system scores every attempt (decided 2026-10-30). Questions reach learners only through
--   functions that leave out which answers are correct; the scoring happens here, never in the
--   browser. A pass is a quiz result only: never a competency or Approved to Serve (SPEC §3).
-- * Attempts link to the exact quiz version they were taken on, with the answers given, the score,
--   the result, and the time (SRS-QUIZ-005). History is never rewritten.

create type public.quiz_question_kind as enum ('single', 'multiple', 'true_false', 'scenario');
-- When a learner may see the correct answers for their attempt (SRS-QUIZ-006).
create type public.quiz_answer_policy as enum
  ('after_each_attempt', 'after_pass', 'after_final_attempt', 'never');

-- Options are [{ "key": "a".."f", "label": text, "correct": boolean }]: 2 to 6 of them. Single
-- choice, true/false, and scenario questions have exactly one correct option; multiple select has
-- at least one. True/false has exactly two. lib/domain/quiz.ts applies the same rule.
create function private.quiz_options_valid(p_kind public.quiz_question_kind, p_options jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;
  v_keys integer;
  v_correct integer;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    return false;
  end if;
  v_count := jsonb_array_length(p_options);
  if v_count not between 2 and 6 then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_options) o
    where jsonb_typeof(o) <> 'object'
       or jsonb_typeof(o -> 'key') is distinct from 'string'
       or jsonb_typeof(o -> 'label') is distinct from 'string'
       or jsonb_typeof(o -> 'correct') is distinct from 'boolean'
  ) then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_options) o
    where (o ->> 'key') !~ '^[a-f]$' or length(trim(o ->> 'label')) not between 1 and 300
  ) then
    return false;
  end if;
  select count(distinct o ->> 'key'), count(*) filter (where (o ->> 'correct')::boolean)
    into v_keys, v_correct
    from jsonb_array_elements(p_options) o;
  if v_keys <> v_count then
    return false;
  end if;
  return case p_kind
    when 'multiple' then v_correct >= 1
    when 'true_false' then v_count = 2 and v_correct = 1
    else v_correct = 1
  end;
end;
$$;

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_version_id uuid not null references public.course_versions (id) on delete cascade,
  quiz_key uuid not null default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  intro text not null default '' check (length(intro) <= 1000),
  -- The module it follows, by stable key; null means the end of the course. A key that no longer
  -- matches a module in the version also reads as the end of the course.
  after_module_key uuid,
  pass_percent integer not null default 80 check (pass_percent between 1 and 100),
  -- Null means unlimited attempts.
  max_attempts integer default 3 check (max_attempts between 1 and 20),
  shuffle_questions boolean not null default false,
  answer_policy public.quiz_answer_policy not null default 'after_final_attempt',
  -- Required quizzes must be passed to finish the course.
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_version_id, quiz_key),
  unique (id, course_version_id)
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  course_version_id uuid not null,
  question_key uuid not null default gen_random_uuid(),
  kind public.quiz_question_kind not null,
  prompt text not null check (length(trim(prompt)) between 1 and 1000),
  -- The situation for a scenario question; empty for other kinds.
  scenario text not null default '' check (length(scenario) <= 2000),
  -- Why the answer is right, shown only when the quiz's answer policy allows.
  explanation text not null default '' check (length(explanation) <= 1000),
  options jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, question_key),
  -- A question's quiz must belong to the same version.
  foreign key (quiz_id, course_version_id)
    references public.quizzes (id, course_version_id) on delete cascade,
  constraint quiz_questions_options_valid check (private.quiz_options_valid(kind, options)),
  constraint quiz_questions_scenario check (kind = 'scenario' or scenario = '')
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, sort_order);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  -- The exact quiz version the attempt was taken on (SRS-QUIZ-005, SRS-CUR-008).
  quiz_id uuid not null references public.quizzes (id) on delete restrict,
  quiz_key uuid not null,
  course_id uuid not null references public.courses (id) on delete restrict,
  course_version_id uuid not null references public.course_versions (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  -- Counted per person and quiz across versions, so republishing doesn't reset attempts.
  attempt_number integer not null check (attempt_number > 0),
  -- The questions in the order this person saw them.
  question_ids uuid[] not null check (cardinality(question_ids) between 1 and 50),
  question_count integer not null check (question_count between 1 and 50),
  -- The pass mark in force when the attempt started.
  pass_percent integer not null check (pass_percent between 1 and 100),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  -- { "<question id>": ["a", "c"] }, only keys of that question's options.
  answers jsonb,
  correct_count integer check (correct_count >= 0),
  score_percent integer check (score_percent between 0 and 100),
  passed boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, quiz_key, attempt_number),
  constraint quiz_attempts_result check (
    (submitted_at is null and answers is null and correct_count is null and score_percent is null
       and passed is null)
    or (submitted_at is not null and answers is not null and correct_count is not null
       and score_percent is not null and passed is not null)
  )
);
-- One attempt in progress per person and quiz.
create unique index quiz_attempts_one_open_idx
  on public.quiz_attempts (user_id, course_id, quiz_key) where submitted_at is null;
create index quiz_attempts_user_course_idx on public.quiz_attempts (user_id, course_id);
create index quiz_attempts_department_idx on public.quiz_attempts (department_id);

-- Extra attempts a trainer or leader gives someone who used them all (SRS-QUIZ-004: after failed
-- attempts, coaching). Audited.
create table public.quiz_attempt_allowances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  quiz_key uuid not null,
  department_id uuid not null references public.departments (id) on delete restrict,
  extra_attempts integer not null default 1 check (extra_attempts between 1 and 10),
  reason text not null default '' check (length(reason) <= 300),
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index quiz_attempt_allowances_lookup_idx
  on public.quiz_attempt_allowances (user_id, course_id, quiz_key);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_allowances enable row level security;

create trigger quizzes_set_updated_at before update on public.quizzes
  for each row execute function private.set_updated_at();
create trigger quiz_questions_set_updated_at before update on public.quiz_questions
  for each row execute function private.set_updated_at();
create trigger quiz_attempts_set_updated_at before update on public.quiz_attempts
  for each row execute function private.set_updated_at();
create trigger quiz_attempt_allowances_audit after insert on public.quiz_attempt_allowances
  for each row execute function private.audit_change('quiz_attempt_allowance');

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- Quiz settings (title, pass mark, attempts) are readable with the course's content.
create policy "Read quizzes of readable content"
  on public.quizzes for select to authenticated
  using (private.can_read_course_content(course_version_id));
create policy "Curriculum staff add quizzes to drafts"
  on public.quizzes for insert to authenticated
  with check (private.can_edit_course_version(course_version_id));
create policy "Curriculum staff edit quizzes in drafts"
  on public.quizzes for update to authenticated
  using (private.can_edit_course_version(course_version_id))
  with check (private.can_edit_course_version(course_version_id));

-- Questions include the correct answers, so only curriculum staff read the table. Learners get
-- questions through quiz_attempt_questions and quiz_attempt_review.
create policy "Curriculum staff read questions"
  on public.quiz_questions for select to authenticated
  using (private.can_manage_curriculum(private.course_version_department(course_version_id)));
create policy "Curriculum staff add questions to drafts"
  on public.quiz_questions for insert to authenticated
  with check (private.can_edit_course_version(course_version_id));
create policy "Curriculum staff edit questions in drafts"
  on public.quiz_questions for update to authenticated
  using (private.can_edit_course_version(course_version_id))
  with check (private.can_edit_course_version(course_version_id));

-- People see their own attempts; trainers and leaders with report.view see their department's
-- (SRS-QUIZ-007). Nobody writes attempts directly.
create policy "People read their own attempts; report viewers read their department's"
  on public.quiz_attempts for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.has_capability('report.view', department_id)
  );

create policy "People read their own extra attempts; trainers and leaders read their department's"
  on public.quiz_attempt_allowances for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.has_capability('report.view', department_id)
    or private.has_capability('assessment.record', department_id)
  );

grant select on public.quizzes, public.quiz_questions, public.quiz_attempts,
  public.quiz_attempt_allowances to authenticated;
grant insert (course_version_id, title, intro, after_module_key, pass_percent, max_attempts,
  shuffle_questions, answer_policy, is_required, sort_order) on public.quizzes to authenticated;
grant update (title, intro, after_module_key, pass_percent, max_attempts, shuffle_questions,
  answer_policy, is_required, sort_order) on public.quizzes to authenticated;
grant insert (quiz_id, course_version_id, kind, prompt, scenario, explanation, options, sort_order)
  on public.quiz_questions to authenticated;
grant update (kind, prompt, scenario, explanation, options, sort_order)
  on public.quiz_questions to authenticated;

-- ---------------------------------------------------------------------------
-- Versions: drafts and restores copy quizzes; a quiz needs questions before it goes live
-- ---------------------------------------------------------------------------

create or replace function private.copy_course_content(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.course_modules (course_version_id, module_key, title, summary, sort_order)
  select p_to, m.module_key, m.title, m.summary, m.sort_order
  from public.course_modules m
  where m.course_version_id = p_from;

  -- module_key is unique within a version, so it maps each old module to its copy.
  insert into public.lessons
    (course_version_id, module_id, lesson_key, title, summary, objectives, estimated_minutes,
     is_required, body, sort_order, video_provider, video_ref)
  select p_to, new_module.id, l.lesson_key, l.title, l.summary, l.objectives, l.estimated_minutes,
         l.is_required, l.body, l.sort_order, l.video_provider, l.video_ref
  from public.lessons l
  join public.course_modules old_module on old_module.id = l.module_id
  join public.course_modules new_module
    on new_module.course_version_id = p_to and new_module.module_key = old_module.module_key
  where l.course_version_id = p_from;

  insert into public.quizzes
    (course_version_id, quiz_key, title, intro, after_module_key, pass_percent, max_attempts,
     shuffle_questions, answer_policy, is_required, sort_order)
  select p_to, q.quiz_key, q.title, q.intro, q.after_module_key, q.pass_percent, q.max_attempts,
         q.shuffle_questions, q.answer_policy, q.is_required, q.sort_order
  from public.quizzes q
  where q.course_version_id = p_from;

  -- quiz_key maps each old quiz to its copy, as module_key does for modules.
  insert into public.quiz_questions
    (quiz_id, course_version_id, question_key, kind, prompt, scenario, explanation, options,
     sort_order)
  select new_quiz.id, p_to, qq.question_key, qq.kind, qq.prompt, qq.scenario, qq.explanation,
         qq.options, qq.sort_order
  from public.quiz_questions qq
  join public.quizzes old_quiz on old_quiz.id = qq.quiz_id
  join public.quizzes new_quiz
    on new_quiz.course_version_id = p_to and new_quiz.quiz_key = old_quiz.quiz_key
  where qq.course_version_id = p_from;
end;
$$;
revoke all on function private.copy_course_content(uuid, uuid) from public, anon, authenticated;

-- An empty quiz can't be submitted for review or published.
create function private.check_quizzes_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pending_review', 'published') and old.status in ('draft', 'pending_review')
     and exists (
       select 1 from public.quizzes q
       where q.course_version_id = new.id
         and not exists (select 1 from public.quiz_questions qq where qq.quiz_id = q.id)
     ) then
    raise exception 'quiz_has_no_questions' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger course_versions_quizzes_ready before update of status on public.course_versions
  for each row execute function private.check_quizzes_ready();

-- Drafts aren't history, so their quizzes and questions can be removed. Nothing else can.
create function public.delete_quiz(p_quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
begin
  select q.course_version_id into v_version from public.quizzes q where q.id = p_quiz_id;
  if v_version is null or not private.can_edit_course_version(v_version) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.quizzes q where q.id = p_quiz_id;
end;
$$;

create function public.delete_quiz_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
begin
  select qq.course_version_id into v_version from public.quiz_questions qq where qq.id = p_question_id;
  if v_version is null or not private.can_edit_course_version(v_version) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.quiz_questions qq where qq.id = p_question_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Taking a quiz
-- ---------------------------------------------------------------------------

-- How many attempts the person has in total: the quiz's limit plus any extra attempts they were
-- given. Null means unlimited.
create function private.quiz_attempt_limit(
  p_user_id uuid,
  p_course_id uuid,
  p_quiz_key uuid,
  p_max_attempts integer
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_max_attempts is null then null else p_max_attempts + coalesce((
    select sum(a.extra_attempts)::integer from public.quiz_attempt_allowances a
    where a.user_id = p_user_id and a.course_id = p_course_id and a.quiz_key = p_quiz_key
  ), 0) end;
$$;

-- Starts an attempt on the live quiz, or returns the one in progress (idempotent). Members only;
-- not once the quiz is passed or the attempts are used up (SRS-QUIZ-002, -003).
create function public.start_quiz_attempt(p_course_id uuid, p_quiz_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_quiz public.quizzes;
  v_department_id uuid;
  v_attempt uuid;
  v_used integer;
  v_limit integer;
  v_questions uuid[];
begin
  select q.* into v_quiz
    from public.courses c
    join public.course_versions v on v.course_id = c.id and v.status = 'published'
    join public.quizzes q on q.course_version_id = v.id and q.quiz_key = p_quiz_key
   where c.id = p_course_id
     and c.archived_at is null
     and private.is_department_member(c.department_id);
  if v_quiz.id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_department_id := private.course_version_department(v_quiz.course_version_id);

  -- One start at a time per person and quiz; the unique indexes are the backstop.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_course_id::text || p_quiz_key::text, 0));

  select a.id into v_attempt
    from public.quiz_attempts a
   where a.user_id = v_user and a.course_id = p_course_id and a.quiz_key = p_quiz_key
     and a.submitted_at is null;
  if v_attempt is not null then
    return v_attempt;
  end if;

  if exists (
    select 1 from public.quiz_attempts a
    where a.user_id = v_user and a.course_id = p_course_id and a.quiz_key = p_quiz_key and a.passed
  ) then
    raise exception 'quiz_already_passed' using errcode = 'P0001';
  end if;

  select count(*) into v_used
    from public.quiz_attempts a
   where a.user_id = v_user and a.course_id = p_course_id and a.quiz_key = p_quiz_key;
  v_limit := private.quiz_attempt_limit(v_user, p_course_id, p_quiz_key, v_quiz.max_attempts);
  if v_limit is not null and v_used >= v_limit then
    raise exception 'no_attempts_left' using errcode = 'P0001';
  end if;

  select array_agg(qq.id order by
           case when v_quiz.shuffle_questions then random() else 0 end, qq.sort_order, qq.id)
    into v_questions
    from public.quiz_questions qq
   where qq.quiz_id = v_quiz.id;
  if v_questions is null then
    raise exception 'quiz_has_no_questions' using errcode = 'P0001';
  end if;

  insert into public.quiz_attempts
    (user_id, quiz_id, quiz_key, course_id, course_version_id, department_id, attempt_number,
     question_ids, question_count, pass_percent)
  values (v_user, v_quiz.id, p_quiz_key, p_course_id, v_quiz.course_version_id, v_department_id,
          v_used + 1, v_questions, cardinality(v_questions), v_quiz.pass_percent)
  returning id into v_attempt;
  return v_attempt;
end;
$$;

-- The questions of the caller's own attempt, in the order they see them, without which options
-- are correct (SRS-QUIZ-006).
create function public.quiz_attempt_questions(p_attempt_id uuid)
returns table (question_id uuid, kind public.quiz_question_kind, prompt text, scenario text,
               options jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_attempt public.quiz_attempts;
begin
  select * into v_attempt from public.quiz_attempts a
   where a.id = p_attempt_id and a.user_id = (select auth.uid());
  if v_attempt.id is null or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select qq.id, qq.kind, qq.prompt, qq.scenario,
           (select jsonb_agg(jsonb_build_object('key', e.o ->> 'key', 'label', e.o ->> 'label')
                             order by e.ord)
              from jsonb_array_elements(qq.options) with ordinality as e (o, ord))
      from unnest(v_attempt.question_ids) with ordinality as u (qid, pos)
      join public.quiz_questions qq on qq.id = u.qid
     order by u.pos;
end;
$$;

-- Scores and closes the caller's attempt (the system decides the result, decided 2026-10-30).
-- Idempotent: a second submit returns the first result and ignores the new answers. Unanswered
-- questions count as wrong; anything that isn't an option of the question is dropped.
-- A multiple-select question is right only when exactly the correct options are chosen.
create function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.quiz_attempts;
  v_answers jsonb;
  v_correct integer;
  v_passed boolean;
begin
  select * into v_attempt from public.quiz_attempts a
   where a.id = p_attempt_id and a.user_id = (select auth.uid())
   for update;
  if v_attempt.id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_attempt.submitted_at is not null then
    return v_attempt.passed;
  end if;
  if not private.is_department_member(v_attempt.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'invalid_answers' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(qq.id::text, chosen.keys), '{}'::jsonb),
         count(*) filter (where chosen.keys = chosen.correct_keys)
    into v_answers, v_correct
    from unnest(v_attempt.question_ids) as u (qid)
    join public.quiz_questions qq on qq.id = u.qid
    cross join lateral (
      select
        coalesce((
          select jsonb_agg(o ->> 'key' order by o ->> 'key')
            from jsonb_array_elements(qq.options) o
           where jsonb_typeof(p_answers -> qq.id::text) = 'array'
             and (p_answers -> qq.id::text) ? (o ->> 'key')
        ), '[]'::jsonb) as keys,
        coalesce((
          select jsonb_agg(o ->> 'key' order by o ->> 'key')
            from jsonb_array_elements(qq.options) o
           where (o ->> 'correct')::boolean
        ), '[]'::jsonb) as correct_keys
    ) chosen;

  v_passed := v_correct * 100 >= v_attempt.pass_percent * v_attempt.question_count;
  update public.quiz_attempts a
     set submitted_at = now(),
         answers = v_answers,
         correct_count = v_correct,
         score_percent = (v_correct * 100) / v_attempt.question_count,
         passed = v_passed
   where a.id = p_attempt_id;
  return v_passed;
end;
$$;

-- Whether the correct answers for an attempt may be shown to the person reading it. Report viewers
-- for the department always may; the learner only when the quiz's answer policy allows.
create function private.quiz_answers_visible(p_attempt public.quiz_attempts)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes;
  v_used integer;
  v_limit integer;
begin
  if private.has_capability('report.view', p_attempt.department_id) then
    return true;
  end if;
  if p_attempt.user_id is distinct from (select auth.uid()) or p_attempt.submitted_at is null then
    return false;
  end if;
  select * into v_quiz from public.quizzes q where q.id = p_attempt.quiz_id;
  if v_quiz.answer_policy = 'never' then
    return false;
  end if;
  if v_quiz.answer_policy = 'after_each_attempt' then
    return true;
  end if;
  if exists (
    select 1 from public.quiz_attempts a
    where a.user_id = p_attempt.user_id and a.course_id = p_attempt.course_id
      and a.quiz_key = p_attempt.quiz_key and a.passed
  ) then
    return true;
  end if;
  if v_quiz.answer_policy = 'after_pass' then
    return false;
  end if;
  -- after_final_attempt: also once every attempt is used.
  select count(*) into v_used from public.quiz_attempts a
   where a.user_id = p_attempt.user_id and a.course_id = p_attempt.course_id
     and a.quiz_key = p_attempt.quiz_key and a.submitted_at is not null;
  v_limit := private.quiz_attempt_limit(p_attempt.user_id, p_attempt.course_id, p_attempt.quiz_key,
                                        v_quiz.max_attempts);
  return v_limit is not null and v_used >= v_limit;
end;
$$;
revoke all on function private.quiz_answers_visible(public.quiz_attempts) from public, anon, authenticated;

-- A submitted attempt question by question: what was chosen and, when the answer policy allows,
-- which options were correct, whether each answer was right, and the explanation. For the learner
-- who took it and for report viewers in the department.
create function public.quiz_attempt_review(p_attempt_id uuid)
returns table (question_id uuid, kind public.quiz_question_kind, prompt text, scenario text,
               options jsonb, selected jsonb, is_correct boolean, explanation text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_attempt public.quiz_attempts;
  v_visible boolean;
begin
  select * into v_attempt from public.quiz_attempts a where a.id = p_attempt_id;
  if v_attempt.id is null or v_attempt.submitted_at is null
     or not private.is_active_user()
     or not (v_attempt.user_id = (select auth.uid())
             or private.has_capability('report.view', v_attempt.department_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_visible := private.quiz_answers_visible(v_attempt);
  return query
    select qq.id, qq.kind, qq.prompt, qq.scenario,
           (select jsonb_agg(
                     case when v_visible
                          then jsonb_build_object('key', e.o ->> 'key', 'label', e.o ->> 'label',
                                                  'correct', e.o -> 'correct')
                          else jsonb_build_object('key', e.o ->> 'key', 'label', e.o ->> 'label')
                     end order by e.ord)
              from jsonb_array_elements(qq.options) with ordinality as e (o, ord)),
           coalesce(v_attempt.answers -> qq.id::text, '[]'::jsonb),
           case when v_visible then
             coalesce(v_attempt.answers -> qq.id::text, '[]'::jsonb) = coalesce((
               select jsonb_agg(c.o ->> 'key' order by c.o ->> 'key')
                 from jsonb_array_elements(qq.options) c (o)
                where (c.o ->> 'correct')::boolean), '[]'::jsonb)
           end,
           case when v_visible then qq.explanation else '' end
      from unnest(v_attempt.question_ids) with ordinality as u (qid, pos)
      join public.quiz_questions qq on qq.id = u.qid
     order by u.pos;
end;
$$;

-- A trainer or leader gives someone another attempt after they used them all (SRS-QUIZ-004).
-- Needs assessment.record for the course's department. Audited by the table trigger.
create function public.grant_quiz_attempt(
  p_user_id uuid,
  p_course_id uuid,
  p_quiz_key uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid;
begin
  select c.department_id into v_department_id from public.courses c where c.id = p_course_id;
  if v_department_id is null or not private.has_capability('assessment.record', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.quiz_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id and a.quiz_key = p_quiz_key
  ) then
    raise exception 'no_attempts_yet' using errcode = 'P0001';
  end if;
  if length(coalesce(p_reason, '')) > 300 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  insert into public.quiz_attempt_allowances
    (user_id, course_id, quiz_key, department_id, reason, granted_by)
  values (p_user_id, p_course_id, p_quiz_key, v_department_id, trim(coalesce(p_reason, '')),
          (select auth.uid()));
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.delete_quiz(uuid)',
    'public.delete_quiz_question(uuid)',
    'public.start_quiz_attempt(uuid, uuid)',
    'public.quiz_attempt_questions(uuid)',
    'public.submit_quiz_attempt(uuid, jsonb)',
    'public.quiz_attempt_review(uuid)',
    'public.grant_quiz_attempt(uuid, uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;

revoke all on function private.quiz_options_valid(public.quiz_question_kind, jsonb) from public, anon;
grant execute on function private.quiz_options_valid(public.quiz_question_kind, jsonb) to authenticated;
revoke all on function private.quiz_attempt_limit(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.check_quizzes_ready() from public, anon, authenticated;
