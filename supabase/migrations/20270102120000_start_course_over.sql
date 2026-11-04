-- Starting a course over (G, 2026-11-04; SRS-PROG-009). A learner can clear their own progress and
-- quiz results for a course and begin again. History is never lost (SRS-CUR-008): what's cleared is
-- kept in course_restarts, for the person and for anyone who may read their progress. Certificates,
-- practical assessments, competencies, and Approved to Serve aren't touched: they're separate records.

create table public.course_restarts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  restarted_at timestamptz not null default now(),
  -- The rows as they were, exactly.
  lesson_progress jsonb not null,
  quiz_attempts jsonb not null,
  created_at timestamptz not null default now()
);
create index course_restarts_user_course_idx on public.course_restarts (user_id, course_id);

alter table public.course_restarts enable row level security;
create policy "People read their own restarts"
  on public.course_restarts for select to authenticated
  using (user_id = (select auth.uid()) and private.is_active_user());
grant select on public.course_restarts to authenticated;

create trigger course_restarts_audit after insert on public.course_restarts
  for each row execute function private.audit_change('course_restart');

-- Safe to retry: with nothing to clear, it does nothing and records nothing.
create function public.restart_course(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_department uuid;
  v_lessons jsonb;
  v_attempts jsonb;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select c.department_id into v_department from public.courses c where c.id = p_course_id;
  if v_department is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- The same lock as issuing a certificate, so the two can't cross.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_course_id::text, 0));

  select coalesce(jsonb_agg(to_jsonb(lp)), '[]'::jsonb) into v_lessons
    from public.lesson_progress lp where lp.user_id = v_user and lp.course_id = p_course_id;
  select coalesce(jsonb_agg(to_jsonb(qa)), '[]'::jsonb) into v_attempts
    from public.quiz_attempts qa where qa.user_id = v_user and qa.course_id = p_course_id;
  if jsonb_array_length(v_lessons) = 0 and jsonb_array_length(v_attempts) = 0 then
    return;
  end if;

  insert into public.course_restarts (user_id, course_id, department_id, lesson_progress, quiz_attempts)
  values (v_user, p_course_id, v_department, v_lessons, v_attempts);
  delete from public.lesson_progress lp where lp.user_id = v_user and lp.course_id = p_course_id;
  delete from public.quiz_attempts qa where qa.user_id = v_user and qa.course_id = p_course_id;
end;
$$;
revoke all on function public.restart_course(uuid) from public, anon;
grant execute on function public.restart_course(uuid) to authenticated;
