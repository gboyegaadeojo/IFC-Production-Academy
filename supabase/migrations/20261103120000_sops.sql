-- SOP library and lesson attachments: SRS-SOP-001..006, SPEC §3 workflow E, SRS-LESSON-005.
--
-- * An SOP is a stable identity in one department, with an owner, a category, and a review
--   interval. Its content lives in versions: a draft is edited, publishing makes it current and the
--   previous current version superseded. Published versions never change (SRS-SOP-002).
-- * Each version holds one file (PDF, PNG, or JPEG, up to 10 MB) in the private "sops" Storage
--   bucket at <department id>/<sop id>/<file id>.<ext>. Files are never public: the app hands out a
--   short-lived signed link after these policies allow it (SRS-SOP-006). Members open the current
--   version; curriculum staff can open any version.
-- * Publishing or confirming a review sets last_reviewed_at; the review is due after the SOP's
--   interval (SRS-SOP-003). Reminders come in Phase 3.
-- * Lessons link SOPs as resources. The link is to the SOP, so a lesson always shows the current
--   version. Drafts copy the links like the rest of the lesson.
-- * Drafting needs course.draft for the department ("Draft curriculum and SOPs"); publishing,
--   review, and archiving need course.publish. Leaders publish their own (decided 2026-10-30).

create type public.sop_version_status as enum ('draft', 'published', 'superseded');

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  category text not null default '' check (length(category) <= 60),
  owner_id uuid references public.profiles (id),
  review_interval_months integer not null default 12 check (review_interval_months between 1 and 36),
  last_reviewed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sops_department_idx on public.sops (department_id);

create table public.sop_versions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops (id) on delete restrict,
  -- Denormalised from the SOP so policies and the audit log stay simple.
  department_id uuid not null references public.departments (id) on delete restrict,
  version_number integer check (version_number > 0),
  status public.sop_version_status not null default 'draft',
  title text not null check (length(trim(title)) between 1 and 120),
  summary text not null default '' check (length(summary) <= 1000),
  file_path text check (
    file_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$'
  ),
  file_name text check (length(trim(file_name)) between 1 and 200),
  file_size integer check (file_size between 1 and 10485760),
  file_type text check (file_type in ('application/pdf', 'image/png', 'image/jpeg')),
  change_note text check (change_note is null or length(change_note) <= 500),
  based_on_version_id uuid references public.sop_versions (id),
  created_by uuid references public.profiles (id),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sop_id, version_number),
  constraint sop_versions_file_complete check (
    (file_path is null) = (file_name is null)
    and (file_path is null) = (file_size is null)
    and (file_path is null) = (file_type is null)
  ),
  constraint sop_versions_published check (
    status = 'draft'
    or (version_number is not null and published_at is not null and file_path is not null)
  )
);
create unique index sop_versions_one_draft_idx on public.sop_versions (sop_id) where status = 'draft';
create unique index sop_versions_one_published_idx on public.sop_versions (sop_id) where status = 'published';

create table public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  sop_id uuid not null references public.sops (id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (lesson_id, sop_id)
);
create index lesson_resources_sop_idx on public.lesson_resources (sop_id);

alter table public.sops enable row level security;
alter table public.sop_versions enable row level security;
alter table public.lesson_resources enable row level security;

create trigger sops_set_updated_at before update on public.sops
  for each row execute function private.set_updated_at();
create trigger sop_versions_set_updated_at before update on public.sop_versions
  for each row execute function private.set_updated_at();

-- Lifecycle changes are audited (SRS-AUDIT-001); routine draft edits are not.
create trigger sops_audit after insert or update on public.sops
  for each row execute function private.audit_change('sop');
create trigger sop_versions_audit_insert after insert on public.sop_versions
  for each row execute function private.audit_change('sop_version');
create trigger sop_versions_audit_status after update of status on public.sop_versions
  for each row execute function private.audit_change('sop_version');

-- A version's file must live under its own department and SOP.
create function private.check_sop_file_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.file_path is not null
     and not starts_with(new.file_path, new.department_id::text || '/' || new.sop_id::text || '/') then
    raise exception 'invalid_file_path' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger sop_versions_file_path before insert or update of file_path on public.sop_versions
  for each row execute function private.check_sop_file_path();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.can_read_sop(p_sop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sops s
    where s.id = p_sop_id
      and (
        private.can_manage_curriculum(s.department_id)
        or (s.archived_at is null and private.is_department_member(s.department_id))
      )
  );
$$;

create function private.can_edit_sop_version(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sop_versions v
    join public.sops s on s.id = v.sop_id
    where v.id = p_version_id
      and v.status = 'draft'
      and s.archived_at is null
      and private.has_capability('course.draft', s.department_id)
  );
$$;

create function private.lesson_version(p_lesson_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.course_version_id from public.lessons l where l.id = p_lesson_id;
$$;

-- Storage object names are <department id>/<sop id>/<file id>.<ext>. Malformed names read as null.
create function private.sop_id_from_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;

-- Who may open a stored file: curriculum staff for any version of their department's SOPs;
-- members only the current version of a live SOP.
create function private.can_read_sop_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sops s
    where s.id = private.sop_id_from_path(p_name)
      and starts_with(p_name, s.department_id::text || '/')
      and (
        private.can_manage_curriculum(s.department_id)
        or (
          s.archived_at is null
          and private.is_department_member(s.department_id)
          and exists (
            select 1 from public.sop_versions v
            where v.sop_id = s.id and v.status = 'published' and v.file_path = p_name
          )
        )
      )
  );
$$;

-- Who may upload: people with course.draft for the department, into an SOP with an open draft.
create function private.can_upload_sop_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sops s
    join public.sop_versions v on v.sop_id = s.id and v.status = 'draft'
    where s.id = private.sop_id_from_path(p_name)
      and starts_with(p_name, s.department_id::text || '/')
      and s.archived_at is null
      and private.has_capability('course.draft', s.department_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy "Members and curriculum staff read SOPs"
  on public.sops for select to authenticated
  using (
    private.can_manage_curriculum(department_id)
    or (archived_at is null and private.is_department_member(department_id))
  );
create policy "Curriculum staff edit SOP settings"
  on public.sops for update to authenticated
  using (archived_at is null and private.has_capability('course.draft', department_id))
  with check (archived_at is null and private.has_capability('course.draft', department_id));

-- Members see published and superseded versions, so the current one is clearly marked against
-- older ones (SPEC §3 workflow E). Drafts are for curriculum staff.
create policy "Read published SOP versions, or any version as curriculum staff"
  on public.sop_versions for select to authenticated
  using (
    private.can_manage_curriculum(department_id)
    or (status in ('published', 'superseded') and private.can_read_sop(sop_id))
  );
create policy "Curriculum staff edit SOP drafts"
  on public.sop_versions for update to authenticated
  using (private.can_edit_sop_version(id))
  with check (private.can_edit_sop_version(id));

create policy "Read resources of readable lessons"
  on public.lesson_resources for select to authenticated
  using (private.can_read_course_content(private.lesson_version(lesson_id)));
create policy "Curriculum staff attach their department's SOPs to draft lessons"
  on public.lesson_resources for insert to authenticated
  with check (
    private.can_edit_course_version(private.lesson_version(lesson_id))
    and exists (
      select 1 from public.sops s
      where s.id = sop_id
        and s.archived_at is null
        and s.department_id = private.course_version_department(private.lesson_version(lesson_id))
    )
  );

grant select on public.sops, public.sop_versions, public.lesson_resources to authenticated;
grant update (category, review_interval_months) on public.sops to authenticated;
grant update (title, summary, file_path, file_name, file_size, file_type)
  on public.sop_versions to authenticated;
grant insert (lesson_id, sop_id, sort_order) on public.lesson_resources to authenticated;

-- Storage: a private bucket, readable and writable only as the policies above allow. Files are
-- never updated or deleted through the API; a new version gets a new file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sops', 'sops', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "SOP files: read as allowed"
  on storage.objects for select to authenticated
  using (bucket_id = 'sops' and private.can_read_sop_file(name));
create policy "SOP files: upload into a draft"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sops' and private.can_upload_sop_file(name));

-- ---------------------------------------------------------------------------
-- Drafts copy lesson resources along with the rest of the course
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
end;
$$;
revoke all on function private.copy_course_content(uuid, uuid) from public, anon, authenticated;

create function public.remove_lesson_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
begin
  select private.lesson_version(r.lesson_id) into v_version
    from public.lesson_resources r where r.id = p_resource_id;
  if v_version is null or not private.can_edit_course_version(v_version) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.lesson_resources r where r.id = p_resource_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- SOP lifecycle
-- ---------------------------------------------------------------------------

-- Creates an SOP with an empty draft; the creator is its owner. Returns the SOP id.
create function public.create_sop(p_department_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sop uuid;
begin
  if not exists (
    select 1 from public.departments d
    where d.id = p_department_id and d.organization_id = private.current_organization_id()
  ) or not private.has_capability('course.draft', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  insert into public.sops (department_id, owner_id, created_by)
  values (p_department_id, (select auth.uid()), (select auth.uid()))
  returning id into v_sop;
  insert into public.sop_versions (sop_id, department_id, title, created_by)
  values (v_sop, p_department_id, trim(p_title), (select auth.uid()));
  return v_sop;
end;
$$;

-- Returns the open draft, creating one from the current version if needed. Idempotent. The draft
-- starts with the current file, so a text-only change doesn't need a new upload.
create function public.start_sop_draft(p_sop_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sop public.sops;
  v_draft uuid;
  v_source public.sop_versions;
begin
  select * into v_sop from public.sops s where s.id = p_sop_id for update;
  if v_sop.id is null or v_sop.archived_at is not null
     or not private.has_capability('course.draft', v_sop.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select v.id into v_draft from public.sop_versions v where v.sop_id = p_sop_id and v.status = 'draft';
  if v_draft is not null then
    return v_draft;
  end if;
  select * into v_source from public.sop_versions v
   where v.sop_id = p_sop_id
   order by v.version_number desc nulls last, v.created_at desc
   limit 1;
  insert into public.sop_versions
    (sop_id, department_id, title, summary, file_path, file_name, file_size, file_type,
     based_on_version_id, created_by)
  values (p_sop_id, v_sop.department_id, v_source.title, v_source.summary, v_source.file_path,
          v_source.file_name, v_source.file_size, v_source.file_type, v_source.id,
          (select auth.uid()))
  returning id into v_draft;
  return v_draft;
end;
$$;

-- Publishes a draft: it becomes current, the previous current version is superseded, and the SOP
-- counts as reviewed today. Needs a file and a change note.
create function public.publish_sop_version(p_version_id uuid, p_change_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.sop_versions;
  v_number integer;
begin
  select * into v_version from public.sop_versions v where v.id = p_version_id;
  if v_version.id is null or not private.has_capability('course.publish', v_version.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from public.sops s where s.id = v_version.sop_id and s.archived_at is null for update;
  if not found then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'version_not_publishable' using errcode = 'P0001';
  end if;
  if v_version.file_path is null then
    raise exception 'sop_has_no_file' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_change_note, ''))) not between 1 and 500 then
    raise exception 'change_note_required' using errcode = '22023';
  end if;

  update public.sop_versions v set status = 'superseded'
   where v.sop_id = v_version.sop_id and v.status = 'published';
  select coalesce(max(v.version_number), 0) + 1 into v_number
    from public.sop_versions v where v.sop_id = v_version.sop_id;
  update public.sop_versions v
     set status = 'published', version_number = v_number, change_note = trim(p_change_note),
         published_at = now(), published_by = (select auth.uid())
   where v.id = p_version_id;
  update public.sops s set last_reviewed_at = now() where s.id = v_version.sop_id;
  return v_number;
end;
$$;

-- Confirms the current version is still right, without changing it (SRS-SOP-003).
create function public.mark_sop_reviewed(p_sop_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sop public.sops;
  v_at timestamptz := now();
begin
  select * into v_sop from public.sops s where s.id = p_sop_id for update;
  if v_sop.id is null or v_sop.archived_at is not null
     or not private.has_capability('course.publish', v_sop.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.sop_versions v where v.sop_id = p_sop_id and v.status = 'published'
  ) then
    raise exception 'sop_not_published' using errcode = 'P0001';
  end if;
  update public.sops s set last_reviewed_at = v_at where s.id = p_sop_id;
  return v_at;
end;
$$;

-- Takes an SOP out of the library. Its versions and files are kept. Lessons stop showing it.
create function public.archive_sop(p_sop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sop public.sops;
begin
  select * into v_sop from public.sops s where s.id = p_sop_id for update;
  if v_sop.id is null or not private.has_capability('course.publish', v_sop.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.sops s set archived_at = now() where s.id = p_sop_id and s.archived_at is null;
end;
$$;

-- The owner's display name for SOPs the caller can read, so members know who looks after each one
-- (SRS-SOP-001). Only the name: profiles stay otherwise private.
create function public.sop_owner_names(p_sop_ids uuid[])
returns table (sop_id uuid, owner_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, p.display_name
  from public.sops s
  join public.profiles p on p.id = s.owner_id
  where s.id = any (p_sop_ids[1:500])
    and private.is_active_user()
    and private.can_read_sop(s.id);
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.sop_owner_names(uuid[])',
    'public.remove_lesson_resource(uuid)',
    'public.create_sop(uuid, text)',
    'public.start_sop_draft(uuid)',
    'public.publish_sop_version(uuid, text)',
    'public.mark_sop_reviewed(uuid)',
    'public.archive_sop(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;

revoke all on function private.can_read_sop(uuid) from public, anon;
revoke all on function private.can_edit_sop_version(uuid) from public, anon;
revoke all on function private.lesson_version(uuid) from public, anon;
revoke all on function private.sop_id_from_path(text) from public, anon;
revoke all on function private.can_read_sop_file(text) from public, anon;
revoke all on function private.can_upload_sop_file(text) from public, anon;
revoke all on function private.check_sop_file_path() from public, anon, authenticated;
grant execute on function private.can_read_sop(uuid) to authenticated;
grant execute on function private.can_edit_sop_version(uuid) to authenticated;
grant execute on function private.lesson_version(uuid) to authenticated;
grant execute on function private.sop_id_from_path(text) to authenticated;
grant execute on function private.can_read_sop_file(text) to authenticated;
grant execute on function private.can_upload_sop_file(text) to authenticated;
