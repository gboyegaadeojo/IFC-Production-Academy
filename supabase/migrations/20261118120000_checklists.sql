-- Pre-service checklists (decision record 9, stage 2), brought in from IFC's Sunday Pre-Service
-- Checklist app:
--
-- * A checklist ("Camera Operators") belongs to a department, has sections and items, and is
--   linked to the positions that use it (Camera 1 and Camera 2). Leaders with checklist.manage edit
--   it; items are archived, never deleted.
-- * Each service has its own check-offs, so every service starts fresh and past ones are kept.
--   A check-off copies the item's text, section, and checklist name, so history reads as it was.
-- * Everyone scheduled at a service sees every checklist for it, with their own first, and can
--   tick items from two days before until twelve hours after. Whoever is scheduled in a position
--   that leads the service (such as Technical Director), and organisation-wide checklist
--   managers, can reset the service's check-offs and undo the last reset.

insert into public.capabilities (key, description)
values ('checklist.manage', 'Edit a department''s pre-service checklists')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key in ('department_leader', 'production_director', 'scheduling_admin')
  and c.key = 'checklist.manage'
on conflict do nothing;

-- A position that leads the service: sees every checklist first-class and can reset.
alter table public.serving_roles add column leads_service boolean not null default false;

create function public.set_role_leads_service(p_role_id uuid, p_leads boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid;
begin
  select r.department_id into v_department_id from public.serving_roles r where r.id = p_role_id;
  if v_department_id is null or not private.has_capability('team.manage', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.serving_roles r set leads_service = p_leads where r.id = p_role_id;
end;
$$;
revoke all on function public.set_role_leads_service(uuid, boolean) from public, anon;
grant execute on function public.set_role_leads_service(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Checklists
-- ---------------------------------------------------------------------------

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, department_id)
);

create table public.checklist_positions (
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  role_id uuid not null references public.serving_roles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (checklist_id, role_id)
);

create table public.checklist_sections (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null,
  department_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  sort_order integer not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (checklist_id, department_id) references public.checklists (id, department_id),
  unique (id, checklist_id)
);
create index checklist_sections_checklist_idx on public.checklist_sections (checklist_id, sort_order);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null,
  checklist_id uuid not null,
  department_id uuid not null,
  text text not null check (length(trim(text)) between 1 and 300),
  sort_order integer not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (section_id, checklist_id) references public.checklist_sections (id, checklist_id)
);
create index checklist_items_section_idx on public.checklist_items (section_id, sort_order);
create index checklist_items_checklist_idx on public.checklist_items (checklist_id);

-- Keep the denormalised ids honest.
create function private.checklist_child_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'checklist_sections' then
    select c.department_id into new.department_id from public.checklists c where c.id = new.checklist_id;
  else
    select s.checklist_id, s.department_id into new.checklist_id, new.department_id
    from public.checklist_sections s where s.id = new.section_id;
  end if;
  return new;
end;
$$;
create trigger checklist_sections_ids before insert or update on public.checklist_sections
  for each row execute function private.checklist_child_ids();
create trigger checklist_items_ids before insert or update on public.checklist_items
  for each row execute function private.checklist_child_ids();

alter table public.checklists enable row level security;
alter table public.checklist_positions enable row level security;
alter table public.checklist_sections enable row level security;
alter table public.checklist_items enable row level security;

-- Checklists are working notes for the team, not private: any active user may read them.
create policy "Active users read checklists"
  on public.checklists for select to authenticated using (private.is_active_user());
create policy "Checklist managers add checklists"
  on public.checklists for insert to authenticated
  with check (private.has_capability('checklist.manage', department_id));
create policy "Checklist managers edit checklists"
  on public.checklists for update to authenticated
  using (private.has_capability('checklist.manage', department_id))
  with check (private.has_capability('checklist.manage', department_id));

create policy "Active users read checklist positions"
  on public.checklist_positions for select to authenticated using (private.is_active_user());

create policy "Active users read checklist sections"
  on public.checklist_sections for select to authenticated using (private.is_active_user());
create policy "Checklist managers add sections"
  on public.checklist_sections for insert to authenticated
  with check (private.has_capability('checklist.manage', department_id));
create policy "Checklist managers edit sections"
  on public.checklist_sections for update to authenticated
  using (private.has_capability('checklist.manage', department_id))
  with check (private.has_capability('checklist.manage', department_id));

create policy "Active users read checklist items"
  on public.checklist_items for select to authenticated using (private.is_active_user());
create policy "Checklist managers add items"
  on public.checklist_items for insert to authenticated
  with check (private.has_capability('checklist.manage', department_id));
create policy "Checklist managers edit items"
  on public.checklist_items for update to authenticated
  using (private.has_capability('checklist.manage', department_id))
  with check (private.has_capability('checklist.manage', department_id));

grant select on public.checklists, public.checklist_positions, public.checklist_sections,
  public.checklist_items to authenticated;
grant insert (department_id, name) on public.checklists to authenticated;
grant update (name, archived_at) on public.checklists to authenticated;
grant insert (checklist_id, name, sort_order) on public.checklist_sections to authenticated;
grant update (name, sort_order, archived_at) on public.checklist_sections to authenticated;
grant insert (section_id, text, sort_order) on public.checklist_items to authenticated;
grant update (text, sort_order, archived_at) on public.checklist_items to authenticated;

create trigger checklists_set_updated_at before update on public.checklists
  for each row execute function private.set_updated_at();
create trigger checklist_sections_set_updated_at before update on public.checklist_sections
  for each row execute function private.set_updated_at();
create trigger checklist_items_set_updated_at before update on public.checklist_items
  for each row execute function private.set_updated_at();
create trigger checklists_audit after insert or update on public.checklists
  for each row execute function private.audit_change('checklist');
create trigger checklist_sections_audit after insert or update on public.checklist_sections
  for each row execute function private.audit_change('checklist_section');
create trigger checklist_items_audit after insert or update on public.checklist_items
  for each row execute function private.audit_change('checklist_item');

-- Replaces the positions a checklist is for. Changed only here, so it's checked and audited.
create function public.set_checklist_positions(p_checklist_id uuid, p_role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid;
begin
  select c.department_id into v_department_id from public.checklists c where c.id = p_checklist_id;
  if v_department_id is null or not private.has_capability('checklist.manage', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.checklist_positions cp where cp.checklist_id = p_checklist_id;
  insert into public.checklist_positions (checklist_id, role_id)
  select p_checklist_id, r.id from public.serving_roles r
  where r.id = any (coalesce(p_role_ids, '{}')) and r.archived_at is null;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, department_id, metadata)
  values (private.current_organization_id(), (select auth.uid()), 'checklist.positions_set',
          'checklists', p_checklist_id, v_department_id,
          jsonb_build_object('positions', coalesce(array_length(p_role_ids, 1), 0)));
end;
$$;
revoke all on function public.set_checklist_positions(uuid, uuid[]) from public, anon;
grant execute on function public.set_checklist_positions(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Check-offs, per service
-- ---------------------------------------------------------------------------

create table public.checklist_resets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  reset_by uuid not null references public.profiles (id),
  reset_at timestamptz not null default now(),
  cleared integer not null default 0,
  undone_by uuid references public.profiles (id),
  undone_at timestamptz
);
create index checklist_resets_event_idx on public.checklist_resets (event_id, reset_at desc);

create table public.checklist_checkoffs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  item_id uuid not null references public.checklist_items (id) on delete restrict,
  checklist_id uuid not null references public.checklists (id) on delete restrict,
  -- As the item read when ticked, so history never changes (SRS-CUR-008's spirit).
  item_text text not null,
  section_name text not null,
  checklist_name text not null,
  checked_by uuid not null references public.profiles (id),
  checked_at timestamptz not null default now(),
  unchecked_by uuid references public.profiles (id),
  unchecked_at timestamptz,
  reset_id uuid references public.checklist_resets (id)
);
-- At most one live tick per item per service.
create unique index checklist_checkoffs_one_live_idx
  on public.checklist_checkoffs (event_id, item_id) where unchecked_at is null and reset_id is null;
create index checklist_checkoffs_event_idx on public.checklist_checkoffs (event_id);

alter table public.checklist_resets enable row level security;
alter table public.checklist_checkoffs enable row level security;
-- Read only through event_checklists(); written only through the functions below.

-- Scheduled at the service (asked or confirmed).
create function private.is_serving_at(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_assignments a
    where a.event_id = p_event_id and a.user_id = (select auth.uid())
      and a.status in ('pending', 'confirmed')
  );
$$;

-- Leads the service: scheduled in a leading position, or an organisation-wide checklist manager.
create function private.leads_service(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability('checklist.manage')
    or exists (
      select 1 from public.event_assignments a
      join public.serving_roles r on r.id = a.role_id and r.leads_service
      where a.event_id = p_event_id and a.user_id = (select auth.uid())
        and a.status in ('pending', 'confirmed')
    );
$$;

create function private.can_view_service_checklists(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    private.is_serving_at(p_event_id)
    or private.leads_service(p_event_id)
    or private.has_capability_anywhere('checklist.manage')
    or exists (
      select 1 from public.event_positions p
      where p.event_id = p_event_id and private.has_capability('schedule.manage', p.department_id)
    )
  );
$$;

-- Ticking is open from two days before a service until twelve hours after it ends.
create function private.checklist_open(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.cancelled_at is null
      and now() between e.starts_at - interval '2 days' and e.ends_at + interval '12 hours'
  );
$$;

revoke all on function private.is_serving_at(uuid) from public, anon, authenticated;
revoke all on function private.leads_service(uuid) from public, anon, authenticated;
revoke all on function private.can_view_service_checklists(uuid) from public, anon, authenticated;
revoke all on function private.checklist_open(uuid) from public, anon, authenticated;

-- The checklists that apply to a service: every live checklist with an item, linked to a position
-- at the service or not. Mine = linked to a position I'm scheduled in. Each item comes with its
-- live tick, if any. After the service, items ticked then are shown even if since archived.
create function public.event_checklists(p_event_id uuid)
returns table (
  checklist_id uuid,
  checklist_name text,
  department_name text,
  is_mine boolean,
  section_id uuid,
  section_name text,
  item_id uuid,
  item_text text,
  checked_by_name text,
  checked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_view_service_checklists(p_event_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    with mine as (
      select distinct cp.checklist_id
      from public.checklist_positions cp
      join public.event_assignments a
        on a.role_id = cp.role_id and a.event_id = p_event_id
       and a.user_id = (select auth.uid()) and a.status in ('pending', 'confirmed')
    ),
    live as (
      select k.item_id, k.checked_at, pr.display_name
      from public.checklist_checkoffs k
      join public.profiles pr on pr.id = k.checked_by
      where k.event_id = p_event_id and k.unchecked_at is null and k.reset_id is null
    )
    select c.id, c.name, d.name, c.id in (select m.checklist_id from mine m),
           s.id, s.name, i.id, i.text, live.display_name, live.checked_at
    from public.checklists c
    join public.departments d on d.id = c.department_id
    join public.checklist_sections s on s.checklist_id = c.id and s.archived_at is null
    join public.checklist_items i on i.section_id = s.id and i.archived_at is null
    left join live on live.item_id = i.id
    where c.archived_at is null
    order by (c.id in (select m.checklist_id from mine m)) desc, d.sort_order, c.name,
             s.sort_order, i.sort_order;
end;
$$;

-- Ticks or unticks an item for a service. Idempotent: ticking a ticked item changes nothing.
create function public.set_checklist_item(p_event_id uuid, p_item_id uuid, p_checked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if not (private.is_serving_at(p_event_id) or private.leads_service(p_event_id))
     or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not private.checklist_open(p_event_id) then
    raise exception 'checklist_closed' using errcode = 'P0001';
  end if;
  select i.id, i.text, s.name as section_name, c.id as checklist_id, c.name as checklist_name
    into v_item
  from public.checklist_items i
  join public.checklist_sections s on s.id = i.section_id
  join public.checklists c on c.id = i.checklist_id
  where i.id = p_item_id and i.archived_at is null and s.archived_at is null
    and c.archived_at is null;
  if v_item.id is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || p_item_id::text, 0));
  if p_checked then
    insert into public.checklist_checkoffs
      (event_id, item_id, checklist_id, item_text, section_name, checklist_name, checked_by)
    values (p_event_id, p_item_id, v_item.checklist_id, v_item.text, v_item.section_name,
            v_item.checklist_name, (select auth.uid()))
    on conflict (event_id, item_id) where unchecked_at is null and reset_id is null do nothing;
  else
    update public.checklist_checkoffs k
       set unchecked_at = now(), unchecked_by = (select auth.uid())
     where k.event_id = p_event_id and k.item_id = p_item_id
       and k.unchecked_at is null and k.reset_id is null;
  end if;
end;
$$;

-- Clears every tick for a service, keeping them for undo and history.
create function public.reset_service_checklists(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reset_id uuid;
  v_count integer;
begin
  if not private.leads_service(p_event_id) or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not private.checklist_open(p_event_id) then
    raise exception 'checklist_closed' using errcode = 'P0001';
  end if;
  insert into public.checklist_resets (event_id, reset_by) values (p_event_id, (select auth.uid()))
  returning id into v_reset_id;
  update public.checklist_checkoffs k set reset_id = v_reset_id
   where k.event_id = p_event_id and k.unchecked_at is null and k.reset_id is null;
  get diagnostics v_count = row_count;
  update public.checklist_resets r set cleared = v_count where r.id = v_reset_id;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (private.current_organization_id(), (select auth.uid()), 'checklist.reset',
          'events', p_event_id, jsonb_build_object('cleared', v_count));
  return v_count;
end;
$$;

-- Undoes the latest reset. Items ticked again since stay as they are.
create function public.undo_checklist_reset(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reset public.checklist_resets;
  v_count integer;
begin
  if not private.leads_service(p_event_id) or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not private.checklist_open(p_event_id) then
    raise exception 'checklist_closed' using errcode = 'P0001';
  end if;
  select * into v_reset from public.checklist_resets r
   where r.event_id = p_event_id order by r.reset_at desc limit 1 for update;
  if v_reset.id is null or v_reset.undone_at is not null then
    raise exception 'nothing_to_undo' using errcode = 'P0001';
  end if;
  update public.checklist_checkoffs k set reset_id = null
   where k.reset_id = v_reset.id
     and not exists (
       select 1 from public.checklist_checkoffs live
       where live.event_id = k.event_id and live.item_id = k.item_id
         and live.unchecked_at is null and live.reset_id is null
     );
  get diagnostics v_count = row_count;
  update public.checklist_resets r set undone_at = now(), undone_by = (select auth.uid())
   where r.id = v_reset.id;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (private.current_organization_id(), (select auth.uid()), 'checklist.reset_undone',
          'events', p_event_id, jsonb_build_object('restored', v_count));
  return v_count;
end;
$$;

-- Whether this person can reset, and whether there's a reset to undo.
create function public.service_checklist_state(p_event_id uuid)
returns table (can_lead boolean, can_tick boolean, open boolean, undo_available boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_view_service_checklists(p_event_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select private.leads_service(p_event_id),
           private.is_serving_at(p_event_id) or private.leads_service(p_event_id),
           private.checklist_open(p_event_id),
           exists (
             select 1 from public.checklist_resets r
             where r.event_id = p_event_id and r.undone_at is null
               and r.reset_at = (select max(r2.reset_at) from public.checklist_resets r2
                                 where r2.event_id = p_event_id)
           );
end;
$$;

revoke all on function public.event_checklists(uuid) from public, anon;
revoke all on function public.set_checklist_item(uuid, uuid, boolean) from public, anon;
revoke all on function public.reset_service_checklists(uuid) from public, anon;
revoke all on function public.undo_checklist_reset(uuid) from public, anon;
revoke all on function public.service_checklist_state(uuid) from public, anon;
grant execute on function public.event_checklists(uuid) to authenticated;
grant execute on function public.set_checklist_item(uuid, uuid, boolean) to authenticated;
grant execute on function public.reset_service_checklists(uuid) to authenticated;
grant execute on function public.undo_checklist_reset(uuid) to authenticated;
grant execute on function public.service_checklist_state(uuid) to authenticated;
