-- Lesson video and progress: SRS-LESSON-002, -003, -006, -007; SRS-PROG-001..005, -007.
--
-- * A lesson may reference one video by provider and reference (VideoSource abstraction):
--     youtube  an unlisted video id (11 characters), never a full URL;
--     nas      a file path relative to the church video library's training folder, streamed through
--              the app with a per-person access check (decided 2026-10-30).
--   The reference is validated here and in lib/domain/video.ts with the same rules.
-- * lesson_progress is one row per person and lesson version. It records that a lesson was opened,
--   where the video was paused (to resume on another device), and when the learner marked it
--   complete. Watch position is an informal signal only: nothing here verifies viewing.
-- * Progress is written only through the functions below, which are idempotent. Completion is a
--   separate record from competency and Approved to Serve (SPEC §3).

create type public.video_provider as enum ('youtube', 'nas');
create type public.lesson_progress_status as enum ('in_progress', 'completed');

alter table public.lessons
  add column video_provider public.video_provider,
  add column video_ref text,
  add constraint lessons_video_pair check ((video_provider is null) = (video_ref is null)),
  add constraint lessons_video_ref_format check (
    case video_provider
      when 'youtube' then video_ref ~ '^[A-Za-z0-9_-]{11}$'
      -- Relative path: safe segments only, no "..", a web video extension.
      when 'nas' then length(video_ref) <= 300
        and video_ref ~* '^[A-Za-z0-9._ -]+(/[A-Za-z0-9._ -]+)*\.(mp4|m4v|webm)$'
        and video_ref !~ '(^|/)\.\.?(/|$)'
        and video_ref !~ '(^|/) | (/|$)'
      else true
    end
  );

-- Drafts and restores copy the video along with the rest of the lesson.
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
end;
$$;
revoke all on function private.copy_course_content(uuid, uuid) from public, anon, authenticated;

grant update (video_provider, video_ref) on public.lessons to authenticated;

-- ---------------------------------------------------------------------------
-- Progress
-- ---------------------------------------------------------------------------

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  -- The exact lesson version the progress was made on (SRS-PROG-001, SRS-CUR-008).
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  -- Denormalised from the lesson so policies and course summaries stay cheap.
  lesson_key uuid not null,
  course_id uuid not null references public.courses (id) on delete restrict,
  course_version_id uuid not null references public.course_versions (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  status public.lesson_progress_status not null default 'in_progress',
  -- Where the video was last paused, for resuming. Informal; never proof of viewing.
  position_seconds integer not null default 0 check (position_seconds between 0 and 86400),
  started_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id),
  constraint lesson_progress_completed_at check ((status = 'completed') = (completed_at is not null))
);
create index lesson_progress_user_course_idx on public.lesson_progress (user_id, course_id);
create index lesson_progress_department_idx on public.lesson_progress (department_id);

alter table public.lesson_progress enable row level security;

create trigger lesson_progress_set_updated_at before update on public.lesson_progress
  for each row execute function private.set_updated_at();

-- People see their own progress. Trainers and leaders with report.view for the department see it
-- for their department. Nobody writes rows directly.
create policy "People read their own progress; report viewers read their department's"
  on public.lesson_progress for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.has_capability('report.view', department_id)
  );

grant select on public.lesson_progress to authenticated;

-- The live (published) lesson for a course and lesson key, if the caller is a member of the
-- department. Raises not_authorized otherwise, so drafts and other departments can't be recorded.
create function private.live_lesson_for_member(p_course_id uuid, p_lesson_key uuid)
returns table (lesson_id uuid, course_version_id uuid, department_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select l.id, v.id, c.department_id
    from public.courses c
    join public.course_versions v on v.course_id = c.id and v.status = 'published'
    join public.lessons l on l.course_version_id = v.id and l.lesson_key = p_lesson_key
    where c.id = p_course_id
      and c.archived_at is null
      and private.is_department_member(c.department_id);
  if not found then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.live_lesson_for_member(uuid, uuid) from public, anon, authenticated;

-- Records that the learner opened the lesson and, optionally, where the video is. Idempotent: the
-- same call twice leaves the same row. Never changes a completed lesson back to in progress.
create function public.record_lesson_view(
  p_course_id uuid,
  p_lesson_key uuid,
  p_position_seconds integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson record;
  v_position integer := least(greatest(coalesce(p_position_seconds, 0), 0), 86400);
begin
  select * into v_lesson from private.live_lesson_for_member(p_course_id, p_lesson_key);
  insert into public.lesson_progress as p
    (user_id, lesson_id, lesson_key, course_id, course_version_id, department_id, position_seconds)
  values ((select auth.uid()), v_lesson.lesson_id, p_lesson_key, p_course_id,
          v_lesson.course_version_id, v_lesson.department_id, v_position)
  on conflict (user_id, lesson_id) do update
    set position_seconds = case when p_position_seconds is null
                                then p.position_seconds
                                else excluded.position_seconds end,
        last_viewed_at = now();
end;
$$;

-- The learner marks the lesson complete (SRS-LESSON-006: a learner action, not a watch check).
-- Idempotent: completing twice keeps the first completion time. Returns that time.
create function public.complete_lesson(p_course_id uuid, p_lesson_key uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson record;
  v_completed_at timestamptz;
begin
  select * into v_lesson from private.live_lesson_for_member(p_course_id, p_lesson_key);
  insert into public.lesson_progress as p
    (user_id, lesson_id, lesson_key, course_id, course_version_id, department_id, status,
     completed_at)
  values ((select auth.uid()), v_lesson.lesson_id, p_lesson_key, p_course_id,
          v_lesson.course_version_id, v_lesson.department_id, 'completed', now())
  on conflict (user_id, lesson_id) do update
    set status = 'completed',
        completed_at = coalesce(p.completed_at, now()),
        last_viewed_at = now()
  returning completed_at into v_completed_at;
  return v_completed_at;
end;
$$;

-- The learner undoes a completion they made by mistake. Their own record only; the row stays so
-- the start time is kept.
create function public.reopen_lesson(p_course_id uuid, p_lesson_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson record;
begin
  select * into v_lesson from private.live_lesson_for_member(p_course_id, p_lesson_key);
  update public.lesson_progress p
     set status = 'in_progress', completed_at = null, last_viewed_at = now()
   where p.user_id = (select auth.uid()) and p.lesson_id = v_lesson.lesson_id;
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.record_lesson_view(uuid, uuid, integer)',
    'public.complete_lesson(uuid, uuid)',
    'public.reopen_lesson(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;
