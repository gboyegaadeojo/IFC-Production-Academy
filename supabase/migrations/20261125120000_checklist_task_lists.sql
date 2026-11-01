-- Task lists, as in IFC's Sunday Pre-Service Checklist app (its US-11, C23, C25, Q30):
--
-- * A task list holds the department checklists for a kind of service. One list is the default
--   for regular services; others (such as Christmas) start empty or as a copy of another list,
--   with its departments, sections and tasks in order. Hidden items and position links aren't
--   copied.
-- * New services use the default list, and a service keeps the list it started with: a service
--   is fixed to its list when something is first ticked, when its day begins and the default
--   changes, and when its record is frozen. When changing the default, the admin may also switch
--   the current service to it, but only before anything has been ticked for it.
-- * List names are unique among visible lists, ignoring capitals and extra spaces. A hidden
--   list's name is free to reuse, so restoring it is refused while a visible list has its name.
-- * Lists can be hidden and restored, but never the default or one a current or upcoming service
--   uses. A hidden list can't be edited or copied; past services that used it keep their records.
-- * Lists are church-wide, so only organisation-wide checklist managers (the app's Admins) manage
--   them. Every list change is logged with the other checklist edits (US-13b).
--
-- Which list a service uses is kept in its own table, because services are written only by the
-- Planning Center sync.

create table public.checklist_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 300),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_sets_default_visible check (not (is_default and archived_at is not null))
);
create unique index checklist_sets_name_idx
  on public.checklist_sets (organization_id, lower(regexp_replace(trim(name), '\s+', ' ', 'g')))
  where archived_at is null;
create unique index checklist_sets_one_default_idx
  on public.checklist_sets (organization_id) where is_default;

alter table public.checklist_sets enable row level security;
create policy "Active users read task lists"
  on public.checklist_sets for select to authenticated using (private.is_active_user());
grant select on public.checklist_sets to authenticated;
-- Written only through the functions below.

create trigger checklist_sets_set_updated_at before update on public.checklist_sets
  for each row execute function private.set_updated_at();
create trigger checklist_sets_audit after insert or update on public.checklist_sets
  for each row execute function private.audit_change('checklist_set');

-- The list the checklists so far belong to.
insert into public.checklist_sets (organization_id, name, is_default)
select o.id, 'Pre-Service Checklist', true from public.organizations o;

create function private.church_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_organization_id(),
                  (select o.id from public.organizations o order by o.created_at limit 1));
$$;
revoke all on function private.church_id() from public, anon, authenticated;

create function private.default_checklist_set()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.checklist_sets s
  where s.organization_id = private.church_id() and s.is_default;
$$;
revoke all on function private.default_checklist_set() from public, anon;
-- New checklists go in the default list unless another is given.
grant execute on function private.default_checklist_set() to authenticated;

alter table public.checklists add column set_id uuid references public.checklist_sets (id);
update public.checklists c set set_id = s.id
  from public.departments d, public.checklist_sets s
 where d.id = c.department_id and s.organization_id = d.organization_id and s.is_default;
alter table public.checklists alter column set_id set not null;
alter table public.checklists alter column set_id set default private.default_checklist_set();
create index checklists_set_idx on public.checklists (set_id);
grant insert (department_id, name, set_id) on public.checklists to authenticated;

-- A hidden list can't be edited.
create function private.guard_hidden_checklist_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set uuid;
begin
  if tg_table_name = 'checklists' then
    v_set := new.set_id;
  else
    select c.set_id into v_set from public.checklists c where c.id = new.checklist_id;
  end if;
  if exists (select 1 from public.checklist_sets s where s.id = v_set and s.archived_at is not null) then
    raise exception 'list_hidden' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
-- Named to run after the triggers that fill in checklist_id.
create trigger checklists_list_open before insert or update on public.checklists
  for each row execute function private.guard_hidden_checklist_set();
create trigger checklist_sections_list_open before insert or update on public.checklist_sections
  for each row execute function private.guard_hidden_checklist_set();
create trigger checklist_items_list_open before insert or update on public.checklist_items
  for each row execute function private.guard_hidden_checklist_set();

-- ---------------------------------------------------------------------------
-- Which list a service uses
-- ---------------------------------------------------------------------------

create table public.service_checklist_sets (
  event_id uuid primary key references public.events (id) on delete restrict,
  set_id uuid not null references public.checklist_sets (id),
  chosen_at timestamptz not null default now()
);
alter table public.service_checklist_sets enable row level security;
-- Read and written only through the functions below.

create function private.service_checklist_set(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select ss.set_id from public.service_checklist_sets ss where ss.event_id = p_event_id),
    (select s.id from public.checklist_sets s
       join public.events e on e.organization_id = s.organization_id
      where e.id = p_event_id and s.is_default)
  );
$$;
revoke all on function private.service_checklist_set(uuid) from public, anon, authenticated;

-- Fixes a service to the list it uses now.
create function private.pin_service_checklist_set(p_event_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.service_checklist_sets (event_id, set_id)
  select p_event_id, private.service_checklist_set(p_event_id)
  where private.service_checklist_set(p_event_id) is not null
  on conflict (event_id) do nothing;
$$;
revoke all on function private.pin_service_checklist_set(uuid) from public, anon, authenticated;

-- The church's current service: the earliest whose Winnipeg date is today or later.
create function private.church_current_service()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.events e
  where e.organization_id = private.church_id() and e.cancelled_at is null
    and (e.starts_at at time zone 'America/Winnipeg')::date >= (now() at time zone 'America/Winnipeg')::date
  order by e.starts_at
  limit 1;
$$;
revoke all on function private.church_current_service() from public, anon, authenticated;

-- Services so far keep the list they had: those whose day has begun, and any with a tick.
insert into public.service_checklist_sets (event_id, set_id)
select e.id, s.id
from public.events e
join public.checklist_sets s on s.organization_id = e.organization_id and s.is_default
where (e.starts_at at time zone 'America/Winnipeg')::date <= (now() at time zone 'America/Winnipeg')::date
   or exists (select 1 from public.checklist_checkoffs k where k.event_id = e.id);

-- ---------------------------------------------------------------------------
-- Managing lists
-- ---------------------------------------------------------------------------

create function private.tidy_list_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
$$;
revoke all on function private.tidy_list_name(text) from public, anon, authenticated;

create function private.require_list_manager()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() or not private.has_capability('checklist.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_list_manager() from public, anon, authenticated;

-- A new list, empty or as a copy of a visible list. Returns its id.
create function public.create_checklist_set(
  p_name text, p_description text default '', p_copy_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set uuid;
  v_list record;
  v_new_list uuid;
  v_section record;
  v_new_section uuid;
begin
  perform private.require_list_manager();
  if p_copy_from is not null and not exists (
    select 1 from public.checklist_sets s
    where s.id = p_copy_from and s.organization_id = private.church_id() and s.archived_at is null
  ) then
    raise exception 'list_not_found' using errcode = 'P0001';
  end if;
  begin
    insert into public.checklist_sets (organization_id, name, description)
    values (private.church_id(), private.tidy_list_name(p_name), trim(coalesce(p_description, '')))
    returning id into v_set;
  exception when unique_violation then
    raise exception 'name_taken' using errcode = 'P0001';
  end;
  if p_copy_from is not null then
    for v_list in
      select c.id, c.department_id, c.name from public.checklists c
      where c.set_id = p_copy_from and c.archived_at is null
      order by c.name, c.created_at
    loop
      insert into public.checklists (department_id, name, set_id)
      values (v_list.department_id, v_list.name, v_set) returning id into v_new_list;
      for v_section in
        select s.id, s.name, s.sort_order from public.checklist_sections s
        where s.checklist_id = v_list.id and s.archived_at is null
        order by s.sort_order
      loop
        insert into public.checklist_sections (checklist_id, name, sort_order)
        values (v_new_list, v_section.name, v_section.sort_order) returning id into v_new_section;
        insert into public.checklist_items (section_id, text, sort_order)
        select v_new_section, i.text, i.sort_order from public.checklist_items i
        where i.section_id = v_section.id and i.archived_at is null
        order by i.sort_order;
      end loop;
    end loop;
  end if;
  return v_set;
end;
$$;

create function public.update_checklist_set(p_set_id uuid, p_name text, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  perform private.require_list_manager();
  if exists (select 1 from public.checklist_sets s where s.id = p_set_id and s.archived_at is not null) then
    raise exception 'list_hidden' using errcode = 'P0001';
  end if;
  begin
    update public.checklist_sets s
       set name = private.tidy_list_name(p_name), description = trim(coalesce(p_description, ''))
     where s.id = p_set_id and s.organization_id = private.church_id();
    get diagnostics v_rows = row_count;
  exception when unique_violation then
    raise exception 'name_taken' using errcode = 'P0001';
  end;
  if v_rows = 0 then
    raise exception 'list_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- In use: the default, or the list of a service whose day hasn't ended.
create function private.checklist_set_in_use(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.checklist_sets s where s.id = p_set_id and s.is_default)
      or coalesce(private.service_checklist_set(private.church_current_service()) = p_set_id, false)
      or exists (
        select 1 from public.service_checklist_sets ss
        join public.events e on e.id = ss.event_id and e.cancelled_at is null
        where ss.set_id = p_set_id
          and (e.starts_at at time zone 'America/Winnipeg')::date >= (now() at time zone 'America/Winnipeg')::date
      );
$$;
revoke all on function private.checklist_set_in_use(uuid) from public, anon, authenticated;

create function public.set_checklist_set_hidden(p_set_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_list_manager();
  perform 1 from public.checklist_sets s
   where s.id = p_set_id and s.organization_id = private.church_id() for update;
  if not found then
    raise exception 'list_not_found' using errcode = 'P0001';
  end if;
  if p_hidden then
    if private.checklist_set_in_use(p_set_id) then
      raise exception 'list_in_use' using errcode = 'P0001';
    end if;
    update public.checklist_sets s set archived_at = now()
     where s.id = p_set_id and s.archived_at is null;
  else
    begin
      update public.checklist_sets s set archived_at = null
       where s.id = p_set_id and s.archived_at is not null;
    exception when unique_violation then
      raise exception 'name_taken' using errcode = 'P0001';
    end;
  end if;
end;
$$;

-- Makes a list the default. Services whose day has begun, and the current service, keep the list
-- they had, unless p_switch_current asks for the current service to use the new default too,
-- which is allowed only before anything has been ticked for it.
create function public.set_default_checklist_set(p_set_id uuid, p_switch_current boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
  v_current uuid;
  v_current_set uuid;
  v_name text;
begin
  perform private.require_list_manager();
  perform pg_advisory_xact_lock(hashtextextended('checklist-default-list', 0));
  select s.name into v_name from public.checklist_sets s
   where s.id = p_set_id and s.organization_id = private.church_id() and s.archived_at is null
   for update;
  if v_name is null then
    raise exception 'list_not_found' using errcode = 'P0001';
  end if;
  v_old := private.default_checklist_set();
  v_current := private.church_current_service();
  v_current_set := private.service_checklist_set(v_current);

  if p_switch_current and v_current is not null and v_current_set is distinct from p_set_id then
    if exists (select 1 from public.checklist_checkoffs k where k.event_id = v_current) then
      raise exception 'service_has_checkoffs' using errcode = 'P0001';
    end if;
    insert into public.service_checklist_sets (event_id, set_id) values (v_current, p_set_id)
    on conflict (event_id) do update set set_id = excluded.set_id, chosen_at = now();
    perform private.write_checklist_log('edit', 'switch_service_list', 'ok', null, v_current,
      'checklist_sets', p_set_id, v_name, jsonb_build_object('set_id', v_current_set),
      jsonb_build_object('set_id', p_set_id), null);
  end if;

  if v_old is distinct from p_set_id then
    insert into public.service_checklist_sets (event_id, set_id)
    select e.id, v_old from public.events e
    where v_old is not null and e.organization_id = private.church_id() and e.cancelled_at is null
      and (e.id = v_current
           or ((e.starts_at at time zone 'America/Winnipeg')::date = (now() at time zone 'America/Winnipeg')::date))
    on conflict (event_id) do nothing;
    update public.checklist_sets s set is_default = false
     where s.organization_id = private.church_id() and s.is_default;
    update public.checklist_sets s set is_default = true where s.id = p_set_id;
  end if;
end;
$$;

-- The lists, for managers: how big each is and whether it's in use.
create function public.checklist_set_overview()
returns table (
  id uuid,
  name text,
  description text,
  is_default boolean,
  hidden_at timestamptz,
  checklists integer,
  items integer,
  in_use boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability_anywhere('checklist.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select s.id, s.name, s.description, s.is_default, s.archived_at,
           (select count(*)::integer from public.checklists c
             where c.set_id = s.id and c.archived_at is null),
           (select count(*)::integer from public.checklist_items i
              join public.checklist_sections cs on cs.id = i.section_id and cs.archived_at is null
              join public.checklists c on c.id = i.checklist_id and c.archived_at is null
             where c.set_id = s.id and i.archived_at is null),
           private.checklist_set_in_use(s.id)
    from public.checklist_sets s
    where s.organization_id = private.church_id()
    order by s.archived_at is not null, s.is_default desc, lower(s.name);
end;
$$;

-- The current service, the list it uses, and whether anything has been ticked for it.
create function public.current_service_checklist_set()
returns table (event_id uuid, title text, starts_at timestamptz, set_id uuid, has_checkoffs boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current uuid := private.church_current_service();
begin
  if not private.has_capability_anywhere('checklist.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select e.id, e.title, e.starts_at, private.service_checklist_set(e.id),
           exists (select 1 from public.checklist_checkoffs k where k.event_id = e.id)
    from public.events e where e.id = v_current;
end;
$$;

revoke all on function public.create_checklist_set(text, text, uuid) from public, anon;
revoke all on function public.update_checklist_set(uuid, text, text) from public, anon;
revoke all on function public.set_checklist_set_hidden(uuid, boolean) from public, anon;
revoke all on function public.set_default_checklist_set(uuid, boolean) from public, anon;
revoke all on function public.checklist_set_overview() from public, anon;
revoke all on function public.current_service_checklist_set() from public, anon;
grant execute on function public.create_checklist_set(text, text, uuid) to authenticated;
grant execute on function public.update_checklist_set(uuid, text, text) to authenticated;
grant execute on function public.set_checklist_set_hidden(uuid, boolean) to authenticated;
grant execute on function public.set_default_checklist_set(uuid, boolean) to authenticated;
grant execute on function public.checklist_set_overview() to authenticated;
grant execute on function public.current_service_checklist_set() to authenticated;

-- ---------------------------------------------------------------------------
-- A service shows, ticks, and records its own list
-- ---------------------------------------------------------------------------

create or replace function public.event_checklists(p_event_id uuid)
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
declare
  v_set uuid;
begin
  if not private.can_view_service_checklists(p_event_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_set := private.service_checklist_set(p_event_id);
  return query
    with mine as (
      select distinct c.id
      from public.checklists c
      join public.event_assignments a
        on a.event_id = p_event_id and a.user_id = (select auth.uid())
       and a.status in ('pending', 'confirmed')
      where c.archived_at is null and c.set_id = v_set
        and (
          exists (select 1 from public.checklist_positions cp
                  where cp.checklist_id = c.id and cp.role_id = a.role_id)
          or (c.department_id = a.department_id
              and not exists (select 1 from public.checklist_positions cp
                              where cp.checklist_id = c.id))
        )
    ),
    live as (
      select k.item_id, k.checked_at, pr.display_name
      from public.checklist_checkoffs k
      join public.profiles pr on pr.id = k.checked_by
      where k.event_id = p_event_id and k.unchecked_at is null and k.reset_id is null
    )
    select c.id, c.name, d.name, c.id in (select m.id from mine m),
           s.id, s.name, i.id, i.text, live.display_name, live.checked_at
    from public.checklists c
    join public.departments d on d.id = c.department_id
    join public.checklist_sections s on s.checklist_id = c.id and s.archived_at is null
    join public.checklist_items i on i.section_id = s.id and i.archived_at is null
    left join live on live.item_id = i.id
    where c.archived_at is null and c.set_id = v_set
    order by (c.id in (select m.id from mine m)) desc, d.sort_order, c.name,
             s.sort_order, i.sort_order;
end;
$$;

-- As before, but only tasks on the service's list, and the first tick fixes its list.
create or replace function public.set_checklist_item(p_event_id uuid, p_item_id uuid, p_checked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if not private.can_tick_service(p_event_id) then
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
    and c.archived_at is null and c.set_id = private.service_checklist_set(p_event_id);
  if v_item.id is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || p_item_id::text, 0));
  if p_checked then
    perform private.pin_service_checklist_set(p_event_id);
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

-- The record covers the service's own list. If the current service switched list before
-- anything was ticked, its record starts over from the new one.
create or replace function private.live_service_record(p_event_id uuid)
returns table (
  item_id uuid,
  checklist_id uuid,
  checklist_name text,
  department_order integer,
  section_name text,
  section_order integer,
  item_order integer,
  item_text text,
  removed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (select * from private.service_day_bounds(p_event_id))
  select i.id, c.id, c.name, d.sort_order, s.name, s.sort_order, i.sort_order, i.text,
         case when i.archived_at >= b.day_start and i.archived_at < b.day_end then i.archived_at
              when s.archived_at >= b.day_start and s.archived_at < b.day_end then s.archived_at
              when c.archived_at >= b.day_start and c.archived_at < b.day_end then c.archived_at
         end
  from bounds b
  join public.checklist_items i on i.created_at < b.day_end
  join public.checklist_sections s on s.id = i.section_id and s.created_at < b.day_end
  join public.checklists c on c.id = i.checklist_id and c.created_at < b.day_end
  join public.departments d on d.id = c.department_id
  where c.set_id = private.service_checklist_set(p_event_id)
    and (i.archived_at is null or i.archived_at >= b.day_start)
    and (s.archived_at is null or s.archived_at >= b.day_start)
    and (c.archived_at is null or c.archived_at >= b.day_start);
$$;

create or replace function public.freeze_service_checklist_records()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_count integer := 0;
begin
  for v_event in
    select e.id from public.events e
    where e.checklist_recorded_at is null and e.cancelled_at is null
      and e.starts_at >= private.checklist_records_since()
      and (select b.day_end from private.service_day_bounds(e.id) b) <= now()
  loop
    perform private.pin_service_checklist_set(v_event.id);
    insert into public.service_checklist_records
      (event_id, item_id, checklist_id, checklist_name, department_order, section_name,
       section_order, item_order, item_text, removed_at)
    select v_event.id, r.item_id, r.checklist_id, r.checklist_name, r.department_order,
           r.section_name, r.section_order, r.item_order, r.item_text, r.removed_at
    from private.live_service_record(v_event.id) r
    on conflict do nothing;
    update public.events e set checklist_recorded_at = now() where e.id = v_event.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- List changes are logged with the other checklist edits
-- ---------------------------------------------------------------------------

create or replace function private.log_checklist_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_fields text[];
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_field text;
  v_action text;
  v_subject text;
begin
  v_fields := case tg_table_name
    when 'checklist_sets' then array['name', 'description', 'is_default', 'archived_at']
    when 'checklists' then array['name', 'department_id', 'set_id', 'archived_at']
    when 'checklist_sections' then array['name', 'checklist_id', 'sort_order', 'archived_at']
    when 'checklist_items' then array['text', 'section_id', 'checklist_id', 'sort_order', 'archived_at']
    else array['checklist_id', 'role_id'] end;

  if tg_op = 'UPDATE' then
    foreach v_field in array v_fields loop
      if (v_new -> v_field) is distinct from (v_old -> v_field) then
        v_before := v_before || jsonb_build_object(v_field, v_old -> v_field);
        v_after := v_after || jsonb_build_object(v_field, v_new -> v_field);
      end if;
    end loop;
    -- Unsetting the old default is part of setting the new one, which is logged.
    if v_after = '{}'::jsonb or v_after = '{"is_default": false}'::jsonb then
      return null;
    end if;
    v_action := case
      when v_after ? 'archived_at' and v_after ->> 'archived_at' is not null then 'hide'
      when v_after ? 'archived_at' then 'restore'
      when v_after ? 'is_default' then 'set_default'
      when v_after ? 'section_id' or v_after ? 'checklist_id' or v_after ? 'department_id'
        or v_after ? 'set_id' then 'move'
      when v_after ? 'text' or v_after ? 'description' then 'edit'
      when v_after ? 'name' then 'rename'
      else 'reorder' end;
  elsif tg_op = 'INSERT' then
    v_action := case when tg_table_name = 'checklist_positions' then 'link_position' else 'add' end;
    foreach v_field in array v_fields loop
      v_after := v_after || jsonb_build_object(v_field, v_new -> v_field);
    end loop;
    v_before := null;
  else
    v_action := case when tg_table_name = 'checklist_positions' then 'unlink_position' else 'remove' end;
    foreach v_field in array v_fields loop
      v_before := v_before || jsonb_build_object(v_field, v_old -> v_field);
    end loop;
    v_after := null;
  end if;

  v_subject := case tg_table_name
    when 'checklist_sets' then 'Task list › ' || (v_row ->> 'name')
    when 'checklists' then v_row ->> 'name'
    when 'checklist_sections' then
      coalesce((select c.name from public.checklists c where c.id = (v_row ->> 'checklist_id')::uuid), '')
        || ' › ' || (v_row ->> 'name')
    when 'checklist_items' then
      coalesce((select c.name || ' › ' || s.name
                  from public.checklist_sections s join public.checklists c on c.id = s.checklist_id
                 where s.id = (v_row ->> 'section_id')::uuid), '')
        || ' › ' || (v_row ->> 'text')
    else
      coalesce((select c.name from public.checklists c where c.id = (v_row ->> 'checklist_id')::uuid), '')
        || ' › ' || coalesce((select r.name from public.serving_roles r where r.id = (v_row ->> 'role_id')::uuid), '')
    end;

  perform private.write_checklist_log('edit', v_action, 'ok', null, null, tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid else (v_row ->> 'checklist_id')::uuid end,
    v_subject, v_before, v_after, null);
  return null;
end;
$$;

create trigger checklist_sets_log after insert or update on public.checklist_sets
  for each row execute function private.log_checklist_edit();
