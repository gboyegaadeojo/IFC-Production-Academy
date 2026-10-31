-- Practical assessments: SRS-ASSESS-001..008, SRS-COMP-001..002, ADD-ASSESS-01, SRS-PROG-006.
--
-- * A practical belongs to a course version, like a quiz: a checklist of observable criteria, each
--   required or optional, and a pass rule the leader sets (every required item, and at least a
--   share of all items; default 80%). It names the competency a pass grants. practical_key and
--   criterion_key stay the same across versions.
-- * An observer with assessment.record ticks what they saw and writes feedback. The system works
--   out the outcome, Pass or Further Practice Required, from the ticks and the pass rule; the
--   observer never chooses it (decided 2026-10-30). A pass grants the competency, and Approved to
--   Serve follows (competencies migration).
-- * Assessments are never edited. A leader with competency.approve can void one with a reason;
--   if it granted a competency, that competency is suspended with the same reason. Audited.
-- * Learners can ask to be assessed (ADD-ASSESS-01); requests close when an assessment is recorded.

create type public.practical_outcome as enum ('pass', 'further_practice');

create table public.practicals (
  id uuid primary key default gen_random_uuid(),
  course_version_id uuid not null references public.course_versions (id) on delete cascade,
  practical_key uuid not null default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  intro text not null default '' check (length(intro) <= 1000),
  after_module_key uuid,
  -- The competency a pass grants. Null: the practical counts towards the course only.
  competency_id uuid references public.competencies (id),
  is_required boolean not null default true,
  -- Pass rule: every required criterion observed (when set), and at least this share of all.
  require_all_required boolean not null default true,
  pass_min_percent integer not null default 80 check (pass_min_percent between 0 and 100),
  -- Days to wait after Further Practice Required before the next assessment (SRS-ASSESS-005).
  retry_wait_days integer not null default 0 check (retry_wait_days between 0 and 90),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_version_id, practical_key),
  unique (id, course_version_id)
);

create table public.practical_criteria (
  id uuid primary key default gen_random_uuid(),
  practical_id uuid not null,
  course_version_id uuid not null,
  criterion_key uuid not null default gen_random_uuid(),
  label text not null check (length(trim(label)) between 1 and 200),
  description text not null default '' check (length(description) <= 500),
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practical_id, criterion_key),
  foreign key (practical_id, course_version_id)
    references public.practicals (id, course_version_id) on delete cascade
);
create index practical_criteria_practical_idx on public.practical_criteria (practical_id, sort_order);

create table public.practical_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  observer_id uuid not null references public.profiles (id) on delete restrict,
  -- The observer's name when they assessed, so the learner sees who gave the feedback.
  observer_name text not null,
  -- The exact checklist version used (SRS-ASSESS-004, SRS-CUR-008).
  practical_id uuid not null references public.practicals (id) on delete restrict,
  practical_key uuid not null,
  course_id uuid not null references public.courses (id) on delete restrict,
  course_version_id uuid not null references public.course_versions (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  competency_id uuid references public.competencies (id),
  observed_criterion_ids uuid[] not null,
  criteria_count integer not null check (criteria_count > 0),
  required_count integer not null check (required_count >= 0),
  required_observed integer not null check (required_observed >= 0),
  observed_count integer not null check (observed_count >= 0),
  -- The rule in force when assessed.
  require_all_required boolean not null,
  pass_min_percent integer not null,
  outcome public.practical_outcome not null,
  -- Shared with the learner (SRS-ASSESS-007).
  feedback text not null default '' check (length(feedback) <= 2000),
  assessed_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text check (void_reason is null or length(void_reason) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practical_assessments_not_self check (user_id <> observer_id),
  constraint practical_assessments_void check ((voided_at is null) = (void_reason is null))
);
create index practical_assessments_learner_idx
  on public.practical_assessments (user_id, course_id, practical_key);
create index practical_assessments_department_idx on public.practical_assessments (department_id, assessed_at);

alter table public.competency_records
  add constraint competency_records_granted_by_assessment
  foreign key (granted_by_assessment_id) references public.practical_assessments (id);

create table public.assessment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  practical_key uuid not null,
  department_id uuid not null references public.departments (id) on delete restrict,
  requested_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_assessment_id uuid references public.practical_assessments (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index assessment_requests_one_open_idx
  on public.assessment_requests (user_id, course_id, practical_key) where closed_at is null;
create index assessment_requests_department_idx on public.assessment_requests (department_id) where closed_at is null;

alter table public.practicals enable row level security;
alter table public.practical_criteria enable row level security;
alter table public.practical_assessments enable row level security;
alter table public.assessment_requests enable row level security;

create trigger practicals_set_updated_at before update on public.practicals
  for each row execute function private.set_updated_at();
create trigger practical_criteria_set_updated_at before update on public.practical_criteria
  for each row execute function private.set_updated_at();
create trigger practical_assessments_set_updated_at before update on public.practical_assessments
  for each row execute function private.set_updated_at();
create trigger assessment_requests_set_updated_at before update on public.assessment_requests
  for each row execute function private.set_updated_at();

-- Decisions and corrections are audited (SRS-ASSESS-006).
create trigger practical_assessments_audit after insert or update on public.practical_assessments
  for each row execute function private.audit_change('practical_assessment');

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- Checklists are readable with the course: learners should know what will be observed.
create policy "Read practicals of readable content"
  on public.practicals for select to authenticated
  using (private.can_read_course_content(course_version_id)
         or private.has_capability('assessment.record', private.course_version_department(course_version_id)));
create policy "Curriculum staff add practicals to drafts"
  on public.practicals for insert to authenticated
  with check (
    private.can_edit_course_version(course_version_id)
    and (competency_id is null or exists (
      select 1 from public.competencies c
      where c.id = competency_id and c.archived_at is null
        and c.department_id = private.course_version_department(course_version_id)))
  );
create policy "Curriculum staff edit practicals in drafts"
  on public.practicals for update to authenticated
  using (private.can_edit_course_version(course_version_id))
  with check (
    private.can_edit_course_version(course_version_id)
    and (competency_id is null or exists (
      select 1 from public.competencies c
      where c.id = competency_id and c.archived_at is null
        and c.department_id = private.course_version_department(course_version_id)))
  );

create policy "Read criteria of readable practicals"
  on public.practical_criteria for select to authenticated
  using (private.can_read_course_content(course_version_id)
         or private.has_capability('assessment.record', private.course_version_department(course_version_id)));
create policy "Curriculum staff add criteria to drafts"
  on public.practical_criteria for insert to authenticated
  with check (private.can_edit_course_version(course_version_id));
create policy "Curriculum staff edit criteria in drafts"
  on public.practical_criteria for update to authenticated
  using (private.can_edit_course_version(course_version_id))
  with check (private.can_edit_course_version(course_version_id));

create policy "People read their own assessments; trainers and leaders read their department's"
  on public.practical_assessments for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.can_view_readiness(department_id)
  );

create policy "People read their own requests; trainers and leaders read their department's"
  on public.assessment_requests for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.can_view_readiness(department_id)
  );

grant select on public.practicals, public.practical_criteria, public.practical_assessments,
  public.assessment_requests to authenticated;
grant insert (course_version_id, title, intro, after_module_key, competency_id, is_required,
  require_all_required, pass_min_percent, retry_wait_days, sort_order) on public.practicals to authenticated;
grant update (title, intro, after_module_key, competency_id, is_required, require_all_required,
  pass_min_percent, retry_wait_days, sort_order) on public.practicals to authenticated;
grant insert (practical_id, course_version_id, label, description, is_required, sort_order)
  on public.practical_criteria to authenticated;
grant update (label, description, is_required, sort_order) on public.practical_criteria to authenticated;

-- ---------------------------------------------------------------------------
-- Versions: drafts copy practicals; a practical needs criteria to go live
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

  -- lesson_key maps each old lesson to its copy.
  insert into public.lesson_resources (lesson_id, sop_id, sort_order)
  select new_lesson.id, r.sop_id, r.sort_order
  from public.lesson_resources r
  join public.lessons old_lesson on old_lesson.id = r.lesson_id
  join public.lessons new_lesson
    on new_lesson.course_version_id = p_to and new_lesson.lesson_key = old_lesson.lesson_key
  where old_lesson.course_version_id = p_from;

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

  -- An archived competency is dropped from the copy; the leader picks another.
  insert into public.practicals
    (course_version_id, practical_key, title, intro, after_module_key, competency_id, is_required,
     require_all_required, pass_min_percent, retry_wait_days, sort_order)
  select p_to, p.practical_key, p.title, p.intro, p.after_module_key,
         (select c.id from public.competencies c where c.id = p.competency_id and c.archived_at is null),
         p.is_required, p.require_all_required, p.pass_min_percent, p.retry_wait_days, p.sort_order
  from public.practicals p
  where p.course_version_id = p_from;

  insert into public.practical_criteria
    (practical_id, course_version_id, criterion_key, label, description, is_required, sort_order)
  select new_practical.id, p_to, pc.criterion_key, pc.label, pc.description, pc.is_required,
         pc.sort_order
  from public.practical_criteria pc
  join public.practicals old_practical on old_practical.id = pc.practical_id
  join public.practicals new_practical
    on new_practical.course_version_id = p_to and new_practical.practical_key = old_practical.practical_key
  where pc.course_version_id = p_from;
end;
$$;
revoke all on function private.copy_course_content(uuid, uuid) from public, anon, authenticated;

create function private.check_practicals_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pending_review', 'published') and old.status in ('draft', 'pending_review')
     and exists (
       select 1 from public.practicals p
       where p.course_version_id = new.id
         and not exists (select 1 from public.practical_criteria pc where pc.practical_id = p.id)
     ) then
    raise exception 'practical_has_no_criteria' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger course_versions_practicals_ready before update of status on public.course_versions
  for each row execute function private.check_practicals_ready();

create function public.delete_practical(p_practical_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
begin
  select p.course_version_id into v_version from public.practicals p where p.id = p_practical_id;
  if v_version is null or not private.can_edit_course_version(v_version) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.practicals p where p.id = p_practical_id;
end;
$$;

create function public.delete_practical_criterion(p_criterion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
begin
  select pc.course_version_id into v_version from public.practical_criteria pc where pc.id = p_criterion_id;
  if v_version is null or not private.can_edit_course_version(v_version) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.practical_criteria pc where pc.id = p_criterion_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assessing
-- ---------------------------------------------------------------------------

-- The live practical for a course and key. Null when the course isn't published.
create function private.live_practical(p_course_id uuid, p_practical_key uuid)
returns public.practicals
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.courses c
  join public.course_versions v on v.course_id = c.id and v.status = 'published'
  join public.practicals p on p.course_version_id = v.id and p.practical_key = p_practical_key
  where c.id = p_course_id and c.archived_at is null;
$$;

-- A member asks to be assessed (ADD-ASSESS-01). Idempotent; returns the open request.
create function public.request_assessment(p_course_id uuid, p_practical_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_practical public.practicals;
  v_department_id uuid;
  v_request uuid;
begin
  v_practical := private.live_practical(p_course_id, p_practical_key);
  v_department_id := private.course_version_department(v_practical.course_version_id);
  if v_practical.id is null or not private.is_department_member(v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.practical_assessments a
    where a.user_id = (select auth.uid()) and a.course_id = p_course_id
      and a.practical_key = p_practical_key and a.outcome = 'pass' and a.voided_at is null
  ) then
    raise exception 'already_passed' using errcode = 'P0001';
  end if;
  insert into public.assessment_requests (user_id, course_id, practical_key, department_id)
  values ((select auth.uid()), p_course_id, p_practical_key, v_department_id)
  on conflict (user_id, course_id, practical_key) where closed_at is null do nothing
  returning id into v_request;
  if v_request is null then
    select r.id into v_request from public.assessment_requests r
     where r.user_id = (select auth.uid()) and r.course_id = p_course_id
       and r.practical_key = p_practical_key and r.closed_at is null;
  end if;
  return v_request;
end;
$$;

-- The learner withdraws their request.
create function public.cancel_assessment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessment_requests r set closed_at = now()
   where r.id = p_request_id and r.user_id = (select auth.uid()) and r.closed_at is null;
end;
$$;

-- Active members of a department, for the observer's "who are you assessing" list. Names only.
create function public.assessable_members(p_department_id uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.department_memberships m
  join public.profiles p on p.id = m.user_id
  where m.department_id = p_department_id
    and m.status = 'active'
    and p.status = 'active'
    and private.has_capability('assessment.record', p_department_id)
  order by p.display_name;
$$;

-- The observer records what they saw. The system works out the outcome and, on a pass, grants the
-- competency (decided 2026-10-30). Returns the assessment and its outcome.
create function public.record_practical_assessment(
  p_course_id uuid,
  p_practical_key uuid,
  p_learner_id uuid,
  p_observed_criterion_ids uuid[],
  p_feedback text default ''
)
returns table (assessment_id uuid, outcome public.practical_outcome)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observer uuid := (select auth.uid());
  v_practical public.practicals;
  v_department_id uuid;
  v_observed uuid[];
  v_count integer;
  v_required integer;
  v_required_observed integer;
  v_observed_count integer;
  v_outcome public.practical_outcome;
  v_last public.practical_assessments;
  v_id uuid;
  v_name text;
begin
  v_practical := private.live_practical(p_course_id, p_practical_key);
  v_department_id := private.course_version_department(v_practical.course_version_id);
  if v_practical.id is null or not private.has_capability('assessment.record', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_learner_id = v_observer then
    raise exception 'cannot_assess_self' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.department_memberships m join public.profiles p on p.id = m.user_id
    where m.user_id = p_learner_id and m.department_id = v_department_id
      and m.status = 'active' and p.status = 'active'
  ) then
    raise exception 'learner_not_member' using errcode = 'P0001';
  end if;
  if length(coalesce(p_feedback, '')) > 2000 then
    raise exception 'invalid_feedback' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_learner_id::text || p_course_id::text || p_practical_key::text, 0));

  select * into v_last from public.practical_assessments a
   where a.user_id = p_learner_id and a.course_id = p_course_id and a.practical_key = p_practical_key
     and a.voided_at is null
   order by a.assessed_at desc limit 1;
  if v_last.id is not null and v_last.outcome = 'pass' then
    raise exception 'already_passed' using errcode = 'P0001';
  end if;
  if v_last.id is not null and v_practical.retry_wait_days > 0
     and v_last.assessed_at > now() - make_interval(days => v_practical.retry_wait_days) then
    raise exception 'reassessment_too_soon' using errcode = 'P0001';
  end if;

  select count(*), count(*) filter (where pc.is_required),
         count(*) filter (where pc.is_required and pc.id = any (coalesce(p_observed_criterion_ids, '{}'))),
         count(*) filter (where pc.id = any (coalesce(p_observed_criterion_ids, '{}'))),
         coalesce(array_agg(pc.id order by pc.sort_order, pc.id)
                  filter (where pc.id = any (coalesce(p_observed_criterion_ids, '{}'))), '{}')
    into v_count, v_required, v_required_observed, v_observed_count, v_observed
    from public.practical_criteria pc
   where pc.practical_id = v_practical.id;
  if v_count = 0 then
    raise exception 'practical_has_no_criteria' using errcode = 'P0001';
  end if;

  v_outcome := case
    when (not v_practical.require_all_required or v_required_observed = v_required)
         and v_observed_count * 100 >= v_practical.pass_min_percent * v_count
    then 'pass'::public.practical_outcome
    else 'further_practice'::public.practical_outcome
  end;

  select p.display_name into v_name from public.profiles p where p.id = v_observer;
  insert into public.practical_assessments
    (user_id, observer_id, observer_name, practical_id, practical_key, course_id, course_version_id,
     department_id, competency_id, observed_criterion_ids, criteria_count, required_count,
     required_observed, observed_count, require_all_required, pass_min_percent, outcome, feedback)
  values (p_learner_id, v_observer, coalesce(v_name, 'Observer'), v_practical.id, p_practical_key,
          p_course_id, v_practical.course_version_id, v_department_id, v_practical.competency_id,
          v_observed, v_count, v_required, v_required_observed, v_observed_count,
          v_practical.require_all_required, v_practical.pass_min_percent, v_outcome,
          trim(coalesce(p_feedback, '')))
  returning id into v_id;

  update public.assessment_requests r
     set closed_at = now(), closed_by_assessment_id = v_id
   where r.user_id = p_learner_id and r.course_id = p_course_id
     and r.practical_key = p_practical_key and r.closed_at is null;

  if v_outcome = 'pass' and v_practical.competency_id is not null then
    perform private.grant_competency(p_learner_id, v_practical.competency_id, v_id);
  end if;

  return query select v_id, v_outcome;
end;
$$;

-- Corrects a mistaken assessment (SRS-ASSESS-006). The record stays, marked void with a reason; a
-- competency it granted is suspended with the same reason, which withdraws Approved to Serve.
create function public.void_practical_assessment(p_assessment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.practical_assessments;
begin
  select * into v_assessment from public.practical_assessments a where a.id = p_assessment_id for update;
  if v_assessment.id is null or not private.has_capability('competency.approve', v_assessment.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 1 and 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if v_assessment.voided_at is not null then
    return;
  end if;
  update public.practical_assessments a
     set voided_at = now(), voided_by = (select auth.uid()), void_reason = trim(p_reason)
   where a.id = p_assessment_id;
  update public.competency_records r
     set status = 'suspended', suspended_at = now(), suspended_by = (select auth.uid()),
         suspend_reason = left('Assessment voided: ' || trim(p_reason), 300)
   where r.granted_by_assessment_id = p_assessment_id and r.status = 'approved';
  perform private.refresh_serving_approvals(v_assessment.user_id, v_assessment.department_id);
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.delete_practical(uuid)',
    'public.delete_practical_criterion(uuid)',
    'public.request_assessment(uuid, uuid)',
    'public.cancel_assessment_request(uuid)',
    'public.assessable_members(uuid)',
    'public.record_practical_assessment(uuid, uuid, uuid, uuid[], text)',
    'public.void_practical_assessment(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;

revoke all on function private.live_practical(uuid, uuid) from public, anon, authenticated;
revoke all on function private.check_practicals_ready() from public, anon, authenticated;
