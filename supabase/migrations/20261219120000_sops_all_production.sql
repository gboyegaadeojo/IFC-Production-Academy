-- SOPs for all of production (decision 2026-11-03-sop-library), such as how to do a copyright review.
--
-- * An SOP with no department belongs to the organisation. Anyone active can read its current
--   version, like the rest of the training (decision 2026-11-01-open-training).
-- * Managing one needs an organisation-wide grant of course.draft or course.publish, which is what
--   private.has_capability already means when the department is null. Department leaders can read
--   these and attach them to lessons, but can't change them.
-- * Its files sit at <sop id>/<sop id>/<file id>.<ext>, the same shape as a department's.

alter table public.sops add column organization_id uuid references public.organizations (id);
alter table public.sops alter column department_id drop not null;
alter table public.sop_versions alter column department_id drop not null;
alter table public.sops add constraint sops_have_a_home
  check (department_id is not null or organization_id is not null);

create or replace function private.check_sop_file_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.file_path is not null
     and not starts_with(new.file_path, coalesce(new.department_id, new.sop_id)::text || '/' || new.sop_id::text || '/') then
    raise exception 'invalid_file_path' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Whether the person can read live SOPs in this department, or across the organisation.
create function private.can_read_live_sops(p_department_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_department_id is null
      then private.is_active_user() and p_organization_id = private.current_organization_id()
    else private.is_department_member(p_department_id)
  end;
$$;
revoke all on function private.can_read_live_sops(uuid, uuid) from public, anon;
grant execute on function private.can_read_live_sops(uuid, uuid) to authenticated;

create or replace function private.can_read_sop(p_sop_id uuid)
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
        or (s.archived_at is null and private.can_read_live_sops(s.department_id, s.organization_id))
      )
  );
$$;

create or replace function private.can_read_sop_file(p_name text)
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
      and starts_with(p_name, coalesce(s.department_id, s.id)::text || '/')
      and (
        private.can_manage_curriculum(s.department_id)
        or (
          s.archived_at is null
          and private.can_read_live_sops(s.department_id, s.organization_id)
          and exists (
            select 1 from public.sop_versions v
            where v.sop_id = s.id and v.status = 'published' and v.file_path = p_name
          )
        )
      )
  );
$$;

create or replace function private.can_upload_sop_file(p_name text)
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
      and starts_with(p_name, coalesce(s.department_id, s.id)::text || '/')
      and s.archived_at is null
      and private.has_capability('course.draft', s.department_id)
  );
$$;

drop policy "Members and curriculum staff read SOPs" on public.sops;
create policy "Members and curriculum staff read SOPs"
  on public.sops for select to authenticated
  using (
    private.can_manage_curriculum(department_id)
    or (archived_at is null and private.can_read_live_sops(department_id, organization_id))
  );

drop policy "Curriculum staff attach their department's SOPs to draft lessons" on public.lesson_resources;
create policy "Curriculum staff attach their department's SOPs to draft lessons"
  on public.lesson_resources for insert to authenticated
  with check (
    private.can_edit_course_version(private.lesson_version(lesson_id))
    and exists (
      select 1 from public.sops s
      where s.id = sop_id
        and s.archived_at is null
        and (
          s.department_id = private.course_version_department(private.lesson_version(lesson_id))
          or (s.department_id is null and private.can_read_sop(s.id))
        )
    )
  );

-- Creates an SOP with an empty draft; the creator is its owner. No department means all of
-- production. Returns the SOP id.
drop function public.create_sop(uuid, text);
create function public.create_sop(p_department_id uuid, p_title text, p_category text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sop uuid;
  v_category text := regexp_replace(trim(coalesce(p_category, '')), '\s+', ' ', 'g');
begin
  if p_department_id is not null and not exists (
    select 1 from public.departments d
    where d.id = p_department_id and d.organization_id = private.current_organization_id()
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not private.has_capability('course.draft', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  insert into public.sops (department_id, organization_id, category, owner_id, created_by)
  values (p_department_id, private.current_organization_id(), v_category, (select auth.uid()), (select auth.uid()))
  returning id into v_sop;
  insert into public.sop_versions (sop_id, department_id, title, created_by)
  values (v_sop, p_department_id, trim(p_title), (select auth.uid()));
  return v_sop;
end;
$$;
revoke all on function public.create_sop(uuid, text, text) from public, anon;
grant execute on function public.create_sop(uuid, text, text) to authenticated;
