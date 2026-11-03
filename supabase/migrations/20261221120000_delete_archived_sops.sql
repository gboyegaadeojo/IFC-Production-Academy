-- Archived SOPs can be deleted for good (decision 2026-11-03-sop-library). Only people who can publish
-- for that department, and never while a live or draft course still lists the SOP. An old course
-- version's link goes with it, as nobody can open that lesson any more. The audit log keeps the title.

create function private.sop_in_use(p_sop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lesson_resources r
    join public.lessons l on l.id = r.lesson_id
    join public.course_versions v on v.id = l.course_version_id
    where r.sop_id = p_sop_id and v.status <> 'superseded'
  );
$$;
revoke all on function private.sop_in_use(uuid) from public, anon;
grant execute on function private.sop_in_use(uuid) to authenticated;

-- Who may delete a stored file: the same people, for an archived SOP nothing is using.
create function private.can_delete_sop_file(p_name text)
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
      and s.archived_at is not null
      and private.has_capability('course.publish', s.department_id)
      and not private.sop_in_use(s.id)
  );
$$;
revoke all on function private.can_delete_sop_file(text) from public, anon;
grant execute on function private.can_delete_sop_file(text) to authenticated;

create policy "SOP files: delete with an archived SOP"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sops' and private.can_delete_sop_file(name));

create function public.delete_archived_sop(p_sop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sop public.sops;
  v_title text;
  v_versions integer;
begin
  select * into v_sop from public.sops s where s.id = p_sop_id for update;
  if v_sop.id is null or not private.has_capability('course.publish', v_sop.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_sop.archived_at is null then
    raise exception 'sop_not_archived' using errcode = 'P0001';
  end if;
  if private.sop_in_use(p_sop_id) then
    raise exception 'sop_in_lesson' using errcode = 'P0001';
  end if;

  select v.title into v_title
    from public.sop_versions v
   where v.sop_id = p_sop_id
   order by v.version_number desc nulls first
   limit 1;
  select count(*)::integer into v_versions from public.sop_versions v where v.sop_id = p_sop_id;

  insert into public.audit_events
    (organization_id, actor_id, action, target_table, target_id, department_id, metadata)
  values (
    coalesce(v_sop.organization_id, private.current_organization_id()), (select auth.uid()),
    'sop.deleted', 'sops', p_sop_id, v_sop.department_id,
    jsonb_build_object('title', v_title, 'versions', v_versions));

  delete from public.lesson_resources r where r.sop_id = p_sop_id;
  delete from public.sop_versions v where v.sop_id = p_sop_id;
  delete from public.sops s where s.id = p_sop_id;
end;
$$;
revoke all on function public.delete_archived_sop(uuid) from public, anon;
grant execute on function public.delete_archived_sop(uuid) to authenticated;
