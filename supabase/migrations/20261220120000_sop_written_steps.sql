-- SOPs can be written in the app (decision 2026-11-03-sop-library). A version holds written steps, a
-- file, or both, and needs at least one to be published. The steps are versioned with the rest, so a
-- published version's words never change (SRS-SOP-002).

alter table public.sop_versions
  add column body text not null default '' check (length(body) <= 50000);
grant update (body) on public.sop_versions to authenticated;

alter table public.sop_versions drop constraint sop_versions_published;
alter table public.sop_versions add constraint sop_versions_published check (
  status = 'draft'
  or (
    version_number is not null
    and published_at is not null
    and (file_path is not null or length(trim(body)) > 0)
  )
);

-- As in 20261103120000_sops.sql, except that a new draft starts with the current steps too.
create or replace function public.start_sop_draft(p_sop_id uuid)
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
    (sop_id, department_id, title, summary, body, file_path, file_name, file_size, file_type,
     based_on_version_id, created_by)
  values (p_sop_id, v_sop.department_id, v_source.title, v_source.summary, v_source.body,
          v_source.file_path, v_source.file_name, v_source.file_size, v_source.file_type,
          v_source.id, (select auth.uid()))
  returning id into v_draft;
  return v_draft;
end;
$$;

-- As in 20261103120000_sops.sql, except that written steps count as well as a file.
create or replace function public.publish_sop_version(p_version_id uuid, p_change_note text)
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
  if v_version.file_path is null and length(trim(v_version.body)) = 0 then
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
