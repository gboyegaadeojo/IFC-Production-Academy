-- Onboarding pathway version history (G, 2026-11-10; docs/decisions/2026-11-01-onboarding-pathways.md).
-- * A pathway is edited live, so every change is saved as a version automatically: one version per
--   sitting (the same person within 30 minutes), holding the pathway as it was after their changes.
-- * Restoring a version puts the pathway's name, stages and steps back as they were, and saves that
--   as a new version, so a restore can itself be undone. Nothing is deleted: stages and steps the
--   version didn't have are archived, exactly as removing them in the builder does, and people
--   already on them carry on as they would then.
-- * History is never rewritten (SRS-CUR-008): versions are only added, and only by these functions.

create table public.onboarding_pathway_versions (
  id uuid primary key default gen_random_uuid(),
  pathway_id uuid not null references public.onboarding_pathways (id),
  number integer not null check (number >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  saved_by uuid references public.profiles (id),
  restored_from integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pathway_id, number)
);
create index onboarding_pathway_versions_pathway_idx
  on public.onboarding_pathway_versions (pathway_id, number desc);

alter table public.onboarding_pathway_versions enable row level security;
grant select on public.onboarding_pathway_versions to authenticated;

-- Whoever looks after the pathway can read its history. Nobody writes it directly.
create policy onboarding_pathway_versions_select on public.onboarding_pathway_versions
  for select to authenticated using (private.can_manage_pathway(pathway_id));

-- The pathway as it stands: its name and summary, and its open stages and steps.
create function private.onboarding_pathway_snapshot(p_pathway_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', p.name,
    'summary', p.summary,
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'timing', s.timing, 'sort_order', s.sort_order)
                       order by s.sort_order, s.created_at)
        from public.onboarding_stages s
       where s.pathway_id = p.id and s.archived_at is null), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('id', st.id, 'stage_id', st.stage_id, 'kind', st.kind, 'title', st.title,
                                          'config', st.config, 'sort_order', st.sort_order)
                       order by st.sort_order, st.created_at)
        from public.onboarding_steps st
        join public.onboarding_stages s on s.id = st.stage_id and s.archived_at is null
       where st.pathway_id = p.id and st.archived_at is null), '[]'::jsonb))
  from public.onboarding_pathways p
  where p.id = p_pathway_id;
$$;
revoke all on function private.onboarding_pathway_snapshot(uuid) from public, anon, authenticated;

-- Saves the pathway as a version: into the latest one when it's the same person's sitting,
-- otherwise as the next number. During a restore, the whole restore is one new version.
create function private.onboarding_save_version(p_pathway_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb := private.onboarding_pathway_snapshot(p_pathway_id);
  v_restoring integer := nullif(current_setting('academy.restoring_version', true), '')::integer;
  v_latest public.onboarding_pathway_versions;
begin
  -- Signed in, only for a pathway they look after. (Signed out is the system itself.)
  if (select auth.uid()) is not null and not private.can_manage_pathway(p_pathway_id) then
    return;
  end if;
  if v_snapshot is null then
    return;
  end if;
  select * into v_latest
    from public.onboarding_pathway_versions
   where pathway_id = p_pathway_id
   order by number desc
   limit 1;

  if v_latest.id is not null and (
       -- the same restore, still under way
       (v_restoring is not null and v_latest.restored_from = v_restoring and v_latest.created_at = now())
       -- or the same person still editing, after an ordinary edit
       or (v_restoring is null and v_latest.restored_from is null
           and v_latest.saved_by is not distinct from (select auth.uid())
           and v_latest.updated_at > now() - interval '30 minutes')) then
    if v_latest.snapshot is distinct from v_snapshot then
      update public.onboarding_pathway_versions
         set snapshot = v_snapshot, updated_at = now()
       where id = v_latest.id;
    end if;
    return;
  end if;

  if v_latest.id is not null and v_latest.snapshot = v_snapshot and v_restoring is null then
    return;
  end if;

  insert into public.onboarding_pathway_versions (pathway_id, number, snapshot, saved_by, restored_from)
  values (p_pathway_id, coalesce(v_latest.number, 0) + 1, v_snapshot, (select auth.uid()), v_restoring);
end;
$$;
-- The restore below runs as the person restoring, so they need to be able to call this.
revoke all on function private.onboarding_save_version(uuid) from public, anon;
grant execute on function private.onboarding_save_version(uuid) to authenticated;

create function private.onboarding_version_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Separate branches: the pathways table has no pathway_id for NEW to read.
  if tg_table_name = 'onboarding_pathways' then
    perform private.onboarding_save_version(new.id);
  else
    perform private.onboarding_save_version(new.pathway_id);
  end if;
  return null;
end;
$$;

create trigger onboarding_pathways_version after insert or update of name, summary
  on public.onboarding_pathways for each row execute function private.onboarding_version_changed();
create trigger onboarding_stages_version after insert or update of name, timing, sort_order, archived_at
  on public.onboarding_stages for each row execute function private.onboarding_version_changed();
create trigger onboarding_steps_version after insert or update of stage_id, title, config, sort_order, archived_at
  on public.onboarding_steps for each row execute function private.onboarding_version_changed();

-- Every pathway starts its history with how it is today.
insert into public.onboarding_pathway_versions (pathway_id, number, snapshot)
select p.id, 1, private.onboarding_pathway_snapshot(p.id)
  from public.onboarding_pathways p
 where p.archived_at is null;

-- Versions saved from now on are audited. (Not the starting ones above: nobody is signed in here,
-- so the audit row would have no organisation.)
create trigger onboarding_pathway_versions_audit after insert on public.onboarding_pathway_versions
  for each row execute function private.audit_change('onboarding_pathway_version');

-- Puts a pathway back as a version had it. Runs as the caller, so row-level security decides
-- whether they may change this pathway; the audit triggers record each change.
create function public.restore_onboarding_pathway_version(p_version_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version public.onboarding_pathway_versions;
  v_snapshot jsonb;
  v_stage jsonb;
  v_step jsonb;
  v_number integer;
begin
  select * into v_version from public.onboarding_pathway_versions where id = p_version_id;
  if v_version.id is null or not private.can_manage_pathway(v_version.pathway_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_snapshot := v_version.snapshot;
  perform set_config('academy.restoring_version', v_version.number::text, true);

  update public.onboarding_pathways
     set name = v_snapshot ->> 'name', summary = v_snapshot ->> 'summary'
   where id = v_version.pathway_id;

  for v_stage in select * from jsonb_array_elements(v_snapshot -> 'stages') loop
    update public.onboarding_stages
       set name = v_stage ->> 'name', timing = v_stage ->> 'timing',
           sort_order = (v_stage ->> 'sort_order')::integer, archived_at = null
     where id = (v_stage ->> 'id')::uuid and pathway_id = v_version.pathway_id;
  end loop;

  for v_step in select * from jsonb_array_elements(v_snapshot -> 'steps') loop
    update public.onboarding_steps
       set stage_id = (v_step ->> 'stage_id')::uuid, title = v_step ->> 'title', config = v_step -> 'config',
           sort_order = (v_step ->> 'sort_order')::integer, archived_at = null
     where id = (v_step ->> 'id')::uuid and pathway_id = v_version.pathway_id;
  end loop;

  update public.onboarding_steps
     set archived_at = now()
   where pathway_id = v_version.pathway_id and archived_at is null
     and id not in (select (s ->> 'id')::uuid from jsonb_array_elements(v_snapshot -> 'steps') s);

  update public.onboarding_stages
     set archived_at = now()
   where pathway_id = v_version.pathway_id and archived_at is null
     and id not in (select (s ->> 'id')::uuid from jsonb_array_elements(v_snapshot -> 'stages') s);

  -- A restore that changed nothing still says so in the history.
  perform private.onboarding_save_version(v_version.pathway_id);
  perform set_config('academy.restoring_version', '', true);

  select max(number) into v_number
    from public.onboarding_pathway_versions where pathway_id = v_version.pathway_id;
  return v_number;
end;
$$;
revoke all on function public.restore_onboarding_pathway_version(uuid) from public, anon;
grant execute on function public.restore_onboarding_pathway_version(uuid) to authenticated;
