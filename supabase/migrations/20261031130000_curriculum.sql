-- Curriculum structure and publishing (SPEC §1 "Three-level framework", §5; SRS-CUR-001..009).
-- Decided 2026-10-30: department leaders publish their own department's curriculum. Every publish is
-- a numbered version with a change note; earlier versions stay as history and can be restored.
-- A department can require review, so a second person publishes.
--
-- Rules this file enforces:
--   * A course is a stable identity; its content lives in versions. Published and superseded
--     versions are never edited (SRS-CUR-007, SRS-CUR-008). Only drafts change.
--   * module_key and lesson_key stay the same across versions, so progress can follow a lesson.
--   * At most one open draft (draft or pending review) and one published version per course.
--   * Drafting needs course.draft for the department; publishing needs course.publish.
--   * Learners read published content only, and lessons only in departments they belong to.

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------

create type public.course_version_status as enum
  ('draft', 'pending_review', 'published', 'superseded', 'archived');

alter table public.departments
  add column curriculum_requires_review boolean not null default false;

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  number integer not null check (number between 1 and 9),
  name text not null check (length(trim(name)) between 1 and 80),
  summary text not null default '' check (length(summary) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, number)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  level_id uuid not null references public.levels (id) on delete restrict,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_level_idx on public.courses (level_id, sort_order);

create table public.course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  -- Assigned when published: 1, 2, 3… Drafts have none.
  version_number integer check (version_number > 0),
  status public.course_version_status not null default 'draft',
  title text not null check (length(trim(title)) between 1 and 120),
  summary text not null default '' check (length(summary) <= 1000),
  objectives text[] not null default '{}' check (cardinality(objectives) <= 20),
  estimated_minutes integer check (estimated_minutes between 1 and 6000),
  change_note text check (change_note is null or length(change_note) <= 500),
  based_on_version_id uuid references public.course_versions (id),
  created_by uuid references public.profiles (id),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, version_number),
  constraint course_versions_published_numbered
    check (status in ('draft', 'pending_review') or (version_number is not null and published_at is not null))
);
create unique index course_versions_one_open_idx
  on public.course_versions (course_id) where status in ('draft', 'pending_review');
create unique index course_versions_one_published_idx
  on public.course_versions (course_id) where status = 'published';

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_version_id uuid not null references public.course_versions (id) on delete cascade,
  module_key uuid not null default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  summary text not null default '' check (length(summary) <= 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_version_id, module_key),
  unique (id, course_version_id)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_version_id uuid not null references public.course_versions (id) on delete cascade,
  module_id uuid not null,
  lesson_key uuid not null default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  summary text not null default '' check (length(summary) <= 1000),
  objectives text[] not null default '{}' check (cardinality(objectives) <= 20),
  estimated_minutes integer check (estimated_minutes between 1 and 600),
  is_required boolean not null default true,
  body text not null default '' check (length(body) <= 20000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_version_id, lesson_key),
  -- A lesson's module must belong to the same version.
  foreign key (module_id, course_version_id)
    references public.course_modules (id, course_version_id) on delete cascade
);
create index lessons_module_idx on public.lessons (module_id, sort_order);

alter table public.levels enable row level security;
alter table public.courses enable row level security;
alter table public.course_versions enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.is_department_member(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1 from public.department_memberships m
    where m.department_id = p_department_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.can_manage_curriculum(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability('course.draft', p_department_id)
      or private.has_capability('course.publish', p_department_id);
$$;

create function private.course_version_department(p_course_version_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.department_id
  from public.course_versions v
  join public.courses c on c.id = v.course_id
  where v.id = p_course_version_id;
$$;

-- Drafts are editable by people with course.draft for the department. Nothing else is.
create function private.can_edit_course_version(p_course_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_versions v
    join public.courses c on c.id = v.course_id
    where v.id = p_course_version_id
      and v.status = 'draft'
      and c.archived_at is null
      and private.has_capability('course.draft', c.department_id)
  );
$$;

-- Who may read a version's lessons: curriculum staff always; members only when it's published.
create function private.can_read_course_content(p_course_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_versions v
    join public.courses c on c.id = v.course_id
    where v.id = p_course_version_id
      and (
        private.can_manage_curriculum(c.department_id)
        or (v.status = 'published' and c.archived_at is null
            and private.is_department_member(c.department_id))
      )
  );
$$;

-- Copies a version's modules and lessons into another version, keeping module and lesson keys.
create function private.copy_course_content(p_from uuid, p_to uuid)
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
     is_required, body, sort_order)
  select p_to, new_module.id, l.lesson_key, l.title, l.summary, l.objectives, l.estimated_minutes,
         l.is_required, l.body, l.sort_order
  from public.lessons l
  join public.course_modules old_module on old_module.id = l.module_id
  join public.course_modules new_module
    on new_module.course_version_id = p_to and new_module.module_key = old_module.module_key
  where l.course_version_id = p_from;
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy "Active users read levels of departments they can browse"
  on public.levels for select to authenticated
  using (exists (select 1 from public.departments d where d.id = department_id));

create policy "Active users read courses; archived ones only for curriculum staff"
  on public.courses for select to authenticated
  using (
    exists (select 1 from public.departments d where d.id = department_id)
    and (archived_at is null or private.can_manage_curriculum(department_id))
  );

-- Published course details are a catalogue anyone signed in can browse (SRS-MEM-006).
-- Drafts and history are for curriculum staff.
create policy "Read published versions, or any version as curriculum staff"
  on public.course_versions for select to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id
        and (
          private.can_manage_curriculum(c.department_id)
          or (status = 'published' and c.archived_at is null and private.is_active_user())
        )
    )
  );

create policy "Curriculum staff edit drafts"
  on public.course_versions for update to authenticated
  using (private.can_edit_course_version(id))
  with check (private.can_edit_course_version(id));

create policy "Read modules of readable content"
  on public.course_modules for select to authenticated
  using (private.can_read_course_content(course_version_id));
create policy "Curriculum staff add modules to drafts"
  on public.course_modules for insert to authenticated
  with check (private.can_edit_course_version(course_version_id));
create policy "Curriculum staff edit modules in drafts"
  on public.course_modules for update to authenticated
  using (private.can_edit_course_version(course_version_id))
  with check (private.can_edit_course_version(course_version_id));

create policy "Read lessons of readable content"
  on public.lessons for select to authenticated
  using (private.can_read_course_content(course_version_id));
create policy "Curriculum staff add lessons to drafts"
  on public.lessons for insert to authenticated
  with check (private.can_edit_course_version(course_version_id));
create policy "Curriculum staff edit lessons in drafts"
  on public.lessons for update to authenticated
  using (private.can_edit_course_version(course_version_id))
  with check (private.can_edit_course_version(course_version_id));

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger levels_set_updated_at before update on public.levels
  for each row execute function private.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
  for each row execute function private.set_updated_at();
create trigger course_versions_set_updated_at before update on public.course_versions
  for each row execute function private.set_updated_at();
create trigger course_modules_set_updated_at before update on public.course_modules
  for each row execute function private.set_updated_at();
create trigger lessons_set_updated_at before update on public.lessons
  for each row execute function private.set_updated_at();

-- Lifecycle changes are audited; routine draft edits are not, to keep the log readable.
create trigger courses_audit after insert or update on public.courses
  for each row execute function private.audit_change('course');
create trigger course_versions_audit_insert after insert on public.course_versions
  for each row execute function private.audit_change('course_version');
create trigger course_versions_audit_status after update of status on public.course_versions
  for each row execute function private.audit_change('course_version');
create trigger levels_audit after update on public.levels
  for each row execute function private.audit_change('level');

-- Same audit writer as before, plus: rows with a course_id (course_versions) are attributed to the
-- course's department, and published version numbers are kept in the metadata.
create or replace function private.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed jsonb := '[]'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_department_id uuid;
  v_organization_id uuid;
  v_target_id uuid;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(n.key order by n.key), '[]'::jsonb)
      into v_changed
      from jsonb_each(v_new) n
     where n.value is distinct from (v_old -> n.key)
       and n.key <> 'updated_at';
    if jsonb_array_length(v_changed) = 0 then
      return null;
    end if;
    v_metadata := jsonb_build_object('changed', v_changed);
    if v_changed ? 'status' then
      v_metadata := v_metadata || jsonb_build_object(
        'status', jsonb_build_object('from', v_old -> 'status', 'to', v_new -> 'status'));
    end if;
    if v_changed ? 'revoked_at' then
      v_metadata := v_metadata || jsonb_build_object('revoked', v_new -> 'revoked_at' <> 'null'::jsonb);
    end if;
  elsif v_row ? 'status' then
    v_metadata := jsonb_build_object('status', v_row -> 'status');
  end if;

  if tg_table_name = 'departments' then
    v_department_id := (v_row ->> 'id')::uuid;
  elsif v_row ? 'department_id' then
    v_department_id := (v_row ->> 'department_id')::uuid;
  elsif v_row ? 'course_id' then
    select c.department_id into v_department_id
      from public.courses c where c.id = (v_row ->> 'course_id')::uuid;
    v_metadata := v_metadata || jsonb_build_object('course_id', v_row -> 'course_id');
  end if;
  if v_row ? 'version_number' and v_row -> 'version_number' <> 'null'::jsonb then
    v_metadata := v_metadata || jsonb_build_object('version_number', v_row -> 'version_number');
  end if;

  if v_row ? 'role_id' and v_row ? 'capability_id' then
    -- role_capabilities has a composite key; keep both ids in metadata.
    v_metadata := v_metadata || jsonb_build_object(
      'role_id', v_row -> 'role_id', 'capability_id', v_row -> 'capability_id');
  elsif v_row ? 'role_id' then
    v_metadata := v_metadata || jsonb_build_object('role_id', v_row -> 'role_id');
  end if;
  if v_row ? 'id' then
    v_target_id := (v_row ->> 'id')::uuid;
  end if;

  v_organization_id := coalesce(
    (v_row ->> 'organization_id')::uuid,
    (select d.organization_id from public.departments d where d.id = v_department_id),
    (select p.organization_id from public.profiles p where p.id = (v_row ->> 'user_id')::uuid),
    private.current_organization_id()
  );

  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, department_id, metadata)
  values (
    v_organization_id,
    (select auth.uid()),
    tg_argv[0] || '.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    tg_table_name,
    v_target_id,
    v_department_id,
    v_metadata
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Functions (lifecycle changes go through these)
-- ---------------------------------------------------------------------------

-- SRS-CUR-001. Creates a course with an empty draft. Returns the course id.
create function public.create_course(p_level_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid;
  v_course_id uuid;
  v_sort integer;
begin
  select l.department_id into v_department_id
    from public.levels l
    join public.departments d on d.id = l.department_id
   where l.id = p_level_id and d.organization_id = private.current_organization_id();
  if v_department_id is null or not private.has_capability('course.draft', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;

  select coalesce(max(c.sort_order), 0) + 10 into v_sort
    from public.courses c where c.level_id = p_level_id;
  insert into public.courses (department_id, level_id, sort_order, created_by)
  values (v_department_id, p_level_id, v_sort, (select auth.uid()))
  returning id into v_course_id;

  insert into public.course_versions (course_id, status, title, created_by)
  values (v_course_id, 'draft', trim(p_title), (select auth.uid()));
  return v_course_id;
end;
$$;

-- Returns the open draft, creating one from the latest version if needed. Idempotent.
create function public.start_course_draft(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses;
  v_open uuid;
  v_source public.course_versions;
  v_draft uuid;
begin
  select * into v_course from public.courses c where c.id = p_course_id for update;
  if not found or not private.has_capability('course.draft', v_course.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select v.id into v_open
    from public.course_versions v
   where v.course_id = p_course_id and v.status in ('draft', 'pending_review');
  if v_open is not null then
    return v_open;
  end if;

  select * into v_source
    from public.course_versions v
   where v.course_id = p_course_id
   order by v.version_number desc nulls last, v.created_at desc
   limit 1;

  insert into public.course_versions
    (course_id, status, title, summary, objectives, estimated_minutes, based_on_version_id, created_by)
  values (p_course_id, 'draft', v_source.title, v_source.summary, v_source.objectives,
          v_source.estimated_minutes, v_source.id, (select auth.uid()))
  returning id into v_draft;
  perform private.copy_course_content(v_source.id, v_draft);

  -- Editing an archived course brings it back once the new version is published.
  return v_draft;
end;
$$;

-- Restores an earlier version as a new draft (SRS-CUR-008: history is copied, never changed).
create function public.restore_course_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.course_versions;
  v_department_id uuid;
  v_draft uuid;
begin
  select * into v_source from public.course_versions v where v.id = p_version_id;
  v_department_id := private.course_version_department(p_version_id);
  if v_source.id is null or not private.has_capability('course.draft', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_source.status not in ('published', 'superseded', 'archived') then
    raise exception 'version_not_restorable' using errcode = 'P0001';
  end if;
  perform 1 from public.courses c where c.id = v_source.course_id for update;
  if exists (
    select 1 from public.course_versions v
    where v.course_id = v_source.course_id and v.status in ('draft', 'pending_review')
  ) then
    raise exception 'draft_exists' using errcode = 'P0001';
  end if;

  insert into public.course_versions
    (course_id, status, title, summary, objectives, estimated_minutes, based_on_version_id,
     change_note, created_by)
  values (v_source.course_id, 'draft', v_source.title, v_source.summary, v_source.objectives,
          v_source.estimated_minutes, v_source.id,
          'Restored version ' || v_source.version_number, (select auth.uid()))
  returning id into v_draft;
  perform private.copy_course_content(v_source.id, v_draft);
  return v_draft;
end;
$$;

-- Only for departments that require review: sends a draft to a second person.
create function public.submit_course_version(p_version_id uuid, p_change_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid := private.course_version_department(p_version_id);
begin
  if v_department_id is null or not private.can_edit_course_version(p_version_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_change_note, ''))) not between 1 and 500 then
    raise exception 'change_note_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lessons l where l.course_version_id = p_version_id) then
    raise exception 'course_has_no_lessons' using errcode = 'P0001';
  end if;
  update public.course_versions v
     set status = 'pending_review',
         change_note = trim(p_change_note),
         submitted_at = now(),
         submitted_by = (select auth.uid())
   where v.id = p_version_id;
end;
$$;

-- Sends a version under review back to draft, with a reason in the change note.
create function public.return_course_version(p_version_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid := private.course_version_department(p_version_id);
begin
  if v_department_id is null or not private.has_capability('course.publish', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.course_versions v
     set status = 'draft',
         change_note = left(coalesce(v.change_note, '') ||
           case when length(trim(coalesce(p_reason, ''))) > 0
                then E'\nReturned: ' || trim(p_reason) else '' end, 500),
         submitted_at = null,
         submitted_by = null
   where v.id = p_version_id and v.status = 'pending_review';
  if not found then
    raise exception 'version_not_in_review' using errcode = 'P0001';
  end if;
end;
$$;

-- SRS-CUR-005..007. Publishes a draft (or, where review is required, a submitted version that the
-- publisher didn't submit). The previous published version becomes superseded.
create function public.publish_course_version(p_version_id uuid, p_change_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_version public.course_versions;
  v_course public.courses;
  v_requires_review boolean;
  v_note text;
  v_number integer;
begin
  select * into v_version from public.course_versions v where v.id = p_version_id;
  if not found then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_course from public.courses c where c.id = v_version.course_id for update;
  if not private.has_capability('course.publish', v_course.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select d.curriculum_requires_review into v_requires_review
    from public.departments d where d.id = v_course.department_id;

  if v_requires_review then
    if v_version.status <> 'pending_review' then
      raise exception 'review_required' using errcode = 'P0001';
    end if;
    if v_version.submitted_by = v_actor then
      raise exception 'cannot_publish_own_submission' using errcode = '42501';
    end if;
  elsif v_version.status not in ('draft', 'pending_review') then
    raise exception 'version_not_publishable' using errcode = 'P0001';
  end if;

  v_note := trim(coalesce(nullif(trim(coalesce(p_change_note, '')), ''), v_version.change_note, ''));
  if length(v_note) not between 1 and 500 then
    raise exception 'change_note_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lessons l where l.course_version_id = p_version_id) then
    raise exception 'course_has_no_lessons' using errcode = 'P0001';
  end if;

  update public.course_versions v
     set status = 'superseded'
   where v.course_id = v_course.id and v.status in ('published', 'archived');

  select coalesce(max(v.version_number), 0) + 1 into v_number
    from public.course_versions v where v.course_id = v_course.id;

  update public.course_versions v
     set status = 'published',
         version_number = v_number,
         change_note = v_note,
         published_at = now(),
         published_by = v_actor
   where v.id = p_version_id;

  update public.courses c set archived_at = null where c.id = v_course.id and c.archived_at is not null;
  return v_number;
end;
$$;

-- Takes a course out of the catalogue. Its versions and everyone's history stay.
create function public.archive_course(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses;
begin
  select * into v_course from public.courses c where c.id = p_course_id for update;
  if not found or not private.has_capability('course.publish', v_course.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.course_versions v set status = 'archived'
   where v.course_id = p_course_id and v.status = 'published';
  update public.courses c set archived_at = now() where c.id = p_course_id and c.archived_at is null;
end;
$$;

-- Drafts aren't history, so their modules and lessons can be removed. Nothing else can.
create function public.delete_course_module(p_module_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
begin
  select m.course_version_id into v_version from public.course_modules m where m.id = p_module_id;
  if v_version is null or not private.can_edit_course_version(v_version) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.course_modules m where m.id = p_module_id;
end;
$$;

create function public.delete_lesson(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
begin
  select l.course_version_id into v_version from public.lessons l where l.id = p_lesson_id;
  if v_version is null or not private.can_edit_course_version(v_version) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.lessons l where l.id = p_lesson_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reference data: three levels per department (SPEC §1), and leaders publish their own department
-- ---------------------------------------------------------------------------

insert into public.levels (department_id, number, name, summary)
select d.id, l.number, l.name, l.summary
from public.departments d
cross join (values
  (1, 'Foundations', 'The department''s role in a service, equipment names, essential controls, and basic procedures.'),
  (2, 'Proficiency', 'Routine tasks done independently, standard techniques, and common troubleshooting.'),
  (3, 'Advanced and Leadership', 'Advanced techniques, complex troubleshooting, live-service judgement, and mentoring.')
) as l (number, name, summary);

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'department_leader' and c.key = 'course.publish'
on conflict do nothing;

-- New departments get the three levels too, so a department is ready the moment it's created.
create function private.create_default_levels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.levels (department_id, number, name)
  values (new.id, 1, 'Foundations'), (new.id, 2, 'Proficiency'), (new.id, 3, 'Advanced and Leadership');
  return null;
end;
$$;
create trigger departments_default_levels after insert on public.departments
  for each row execute function private.create_default_levels();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on public.levels, public.courses, public.course_versions, public.course_modules,
  public.lessons to authenticated;
grant update (title, summary, objectives, estimated_minutes) on public.course_versions to authenticated;
grant insert (course_version_id, title, summary, sort_order) on public.course_modules to authenticated;
grant update (title, summary, sort_order) on public.course_modules to authenticated;
grant insert (course_version_id, module_id, title, summary, objectives, estimated_minutes, is_required,
  body, sort_order) on public.lessons to authenticated;
grant update (module_id, title, summary, objectives, estimated_minutes, is_required, body, sort_order)
  on public.lessons to authenticated;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.create_course(uuid, text)',
    'public.start_course_draft(uuid)',
    'public.restore_course_version(uuid)',
    'public.submit_course_version(uuid, text)',
    'public.return_course_version(uuid, text)',
    'public.publish_course_version(uuid, text)',
    'public.archive_course(uuid)',
    'public.delete_course_module(uuid)',
    'public.delete_lesson(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;

revoke all on function private.is_department_member(uuid) from public, anon;
revoke all on function private.can_manage_curriculum(uuid) from public, anon;
revoke all on function private.course_version_department(uuid) from public, anon;
revoke all on function private.can_edit_course_version(uuid) from public, anon;
revoke all on function private.can_read_course_content(uuid) from public, anon;
revoke all on function private.copy_course_content(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_department_member(uuid) to authenticated;
grant execute on function private.can_manage_curriculum(uuid) to authenticated;
grant execute on function private.course_version_department(uuid) to authenticated;
grant execute on function private.can_edit_course_version(uuid) to authenticated;
grant execute on function private.can_read_course_content(uuid) to authenticated;
