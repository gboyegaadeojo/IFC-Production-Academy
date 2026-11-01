-- Restructuring checklists, as in IFC's Sunday Pre-Service Checklist app (its US-12, US-12a,
-- US-13, US-13a, C14, C19, Q20, Q21, Q25):
--
-- * Department checklists have their own order in a task list, which admins change with Move up
--   and Move down. Sections and tasks already do.
-- * "Move to…": a section moves, with its tasks, to another department checklist in the same
--   list; a task moves to any section in the same list. Both go to the end of where they land,
--   only to live (not hidden) places. Check-offs stay attached to the task and keep where it
--   was when ticked, so past services never change.
-- * Hiding a department checklist removes its position links, as the app removes a deleted
--   category's team mappings. Restoring doesn't bring them back.
-- * Hidden items: every hidden department checklist, section and task in a list, newest first,
--   with where it was. Restore brings back the same item, in its old place, with its history;
--   anything inside that wasn't hidden on its own comes back with it. Nothing is ever restored
--   into a hidden parent: restoring asks to bring the parent back in the same step.

-- ---------------------------------------------------------------------------
-- An order for department checklists
-- ---------------------------------------------------------------------------

alter table public.checklists add column sort_order integer;
update public.checklists c set sort_order = o.n * 10
  from (
    select c2.id, row_number() over (partition by c2.set_id order by d.sort_order, c2.name, c2.created_at) as n
    from public.checklists c2 join public.departments d on d.id = c2.department_id
  ) o
 where o.id = c.id;
alter table public.checklists alter column sort_order set not null;

-- New checklists go at the end of their list.
create function private.checklist_next_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sort_order is null then
    select coalesce(max(c.sort_order), 0) + 10 into new.sort_order
    from public.checklists c where c.set_id = new.set_id;
  end if;
  return new;
end;
$$;
create trigger checklists_next_order before insert on public.checklists
  for each row execute function private.checklist_next_order();

grant update (sort_order) on public.checklists to authenticated;
create index checklists_set_order_idx on public.checklists (set_id, sort_order);

-- A section's tasks follow it when it moves to another checklist.
alter table public.checklist_items drop constraint checklist_items_section_id_checklist_id_fkey;
alter table public.checklist_items add constraint checklist_items_section_id_checklist_id_fkey
  foreign key (section_id, checklist_id) references public.checklist_sections (id, checklist_id)
  on update cascade;

-- ---------------------------------------------------------------------------
-- Move to…
-- ---------------------------------------------------------------------------

create function public.move_checklist_section(p_section_id uuid, p_checklist_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from record;
  v_to record;
begin
  select s.id, s.checklist_id, c.department_id, c.set_id into v_from
  from public.checklist_sections s join public.checklists c on c.id = s.checklist_id
  where s.id = p_section_id and s.archived_at is null and c.archived_at is null;
  select c.id, c.department_id, c.set_id into v_to
  from public.checklists c where c.id = p_checklist_id and c.archived_at is null;
  if v_from.id is null or v_to.id is null or v_from.set_id <> v_to.set_id then
    raise exception 'move_not_allowed' using errcode = 'P0001';
  end if;
  if not private.is_active_user()
     or not private.has_capability('checklist.manage', v_from.department_id)
     or not private.has_capability('checklist.manage', v_to.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_from.checklist_id = p_checklist_id then
    return;
  end if;
  update public.checklist_sections s
     set checklist_id = p_checklist_id,
         sort_order = (select coalesce(max(x.sort_order), 0) + 10
                         from public.checklist_sections x where x.checklist_id = p_checklist_id)
   where s.id = p_section_id;
end;
$$;

create function public.move_checklist_item(p_item_id uuid, p_section_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from record;
  v_to record;
begin
  select i.id, i.section_id, c.department_id, c.set_id into v_from
  from public.checklist_items i
  join public.checklist_sections s on s.id = i.section_id
  join public.checklists c on c.id = i.checklist_id
  where i.id = p_item_id and i.archived_at is null and s.archived_at is null and c.archived_at is null;
  select s.id, c.department_id, c.set_id into v_to
  from public.checklist_sections s join public.checklists c on c.id = s.checklist_id
  where s.id = p_section_id and s.archived_at is null and c.archived_at is null;
  if v_from.id is null or v_to.id is null or v_from.set_id <> v_to.set_id then
    raise exception 'move_not_allowed' using errcode = 'P0001';
  end if;
  if not private.is_active_user()
     or not private.has_capability('checklist.manage', v_from.department_id)
     or not private.has_capability('checklist.manage', v_to.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_from.section_id = p_section_id then
    return;
  end if;
  update public.checklist_items i
     set section_id = p_section_id,
         sort_order = (select coalesce(max(x.sort_order), 0) + 10
                         from public.checklist_items x where x.section_id = p_section_id)
   where i.id = p_item_id;
end;
$$;

revoke all on function public.move_checklist_section(uuid, uuid) from public, anon;
revoke all on function public.move_checklist_item(uuid, uuid) from public, anon;
grant execute on function public.move_checklist_section(uuid, uuid) to authenticated;
grant execute on function public.move_checklist_item(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Hiding and restoring
-- ---------------------------------------------------------------------------

-- A hidden department checklist loses its position links.
create function private.unlink_hidden_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.checklist_positions cp where cp.checklist_id = new.id;
  return null;
end;
$$;
create trigger checklists_unlink_when_hidden
  after update of archived_at on public.checklists
  for each row when (old.archived_at is null and new.archived_at is not null)
  execute function private.unlink_hidden_checklist();

-- Nothing comes back into a hidden parent.
create function private.guard_restore_into_hidden_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.checklists c where c.id = new.checklist_id and c.archived_at is not null)
     or (tg_table_name = 'checklist_items' and exists (
           select 1 from public.checklist_sections s where s.id = new.section_id and s.archived_at is not null)) then
    raise exception 'parent_hidden' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger checklist_sections_restore_guard
  before update of archived_at on public.checklist_sections
  for each row when (old.archived_at is not null and new.archived_at is null)
  execute function private.guard_restore_into_hidden_parent();
create trigger checklist_items_restore_guard
  before update of archived_at on public.checklist_items
  for each row when (old.archived_at is not null and new.archived_at is null)
  execute function private.guard_restore_into_hidden_parent();

-- Restores a hidden department checklist, section or task. With p_with_parents, a hidden section
-- or checklist it sits in comes back first; without, that's refused with 'parent_hidden'.
create function public.restore_checklist_part(p_kind text, p_id uuid, p_with_parents boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checklist uuid;
  v_section uuid;
  v_department uuid;
begin
  if p_kind = 'checklist' then
    v_checklist := p_id;
  elsif p_kind = 'section' then
    select s.checklist_id, s.id into v_checklist, v_section from public.checklist_sections s where s.id = p_id;
  elsif p_kind = 'item' then
    select i.checklist_id, i.section_id into v_checklist, v_section from public.checklist_items i where i.id = p_id;
  end if;
  select c.department_id into v_department from public.checklists c where c.id = v_checklist;
  if v_department is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if not private.is_active_user() or not private.has_capability('checklist.manage', v_department) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_kind <> 'checklist' and not p_with_parents and (
       exists (select 1 from public.checklists c where c.id = v_checklist and c.archived_at is not null)
       or (p_kind = 'item' and exists (
             select 1 from public.checklist_sections s where s.id = v_section and s.archived_at is not null))) then
    raise exception 'parent_hidden' using errcode = 'P0001';
  end if;

  update public.checklists c set archived_at = null where c.id = v_checklist and c.archived_at is not null;
  if p_kind = 'checklist' then
    return;
  end if;
  update public.checklist_sections s set archived_at = null where s.id = v_section and s.archived_at is not null;
  if p_kind = 'item' then
    update public.checklist_items i set archived_at = null where i.id = p_id and i.archived_at is not null;
  end if;
end;
$$;
revoke all on function public.restore_checklist_part(text, uuid, boolean) from public, anon;
grant execute on function public.restore_checklist_part(text, uuid, boolean) to authenticated;

-- Everything hidden on its own in a list, newest first, with where it was.
create function public.checklist_hidden_items(p_set_id uuid)
returns table (
  kind text,
  id uuid,
  name text,
  place text,
  hidden_at timestamptz,
  parent_hidden boolean
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
    select x.kind, x.id, x.name, x.place, x.hidden_at, x.parent_hidden
    from (
      select 'checklist'::text as kind, c.id, c.name, d.name as place, c.archived_at as hidden_at,
             false as parent_hidden, c.department_id
      from public.checklists c join public.departments d on d.id = c.department_id
      where c.set_id = p_set_id and c.archived_at is not null
      union all
      select 'section', s.id, s.name, c.name, s.archived_at, c.archived_at is not null, c.department_id
      from public.checklist_sections s join public.checklists c on c.id = s.checklist_id
      where c.set_id = p_set_id and s.archived_at is not null
      union all
      select 'item', i.id, i.text, c.name || ' › ' || s.name, i.archived_at,
             s.archived_at is not null or c.archived_at is not null, c.department_id
      from public.checklist_items i
      join public.checklist_sections s on s.id = i.section_id
      join public.checklists c on c.id = i.checklist_id
      where c.set_id = p_set_id and i.archived_at is not null
    ) x
    where private.has_capability('checklist.manage', x.department_id)
    order by x.hidden_at desc, x.kind, x.name;
end;
$$;
revoke all on function public.checklist_hidden_items(uuid) from public, anon;
grant execute on function public.checklist_hidden_items(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The list's own order on service days, in records, and in copies
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
    order by (c.id in (select m.id from mine m)) desc, c.sort_order, c.name,
             s.sort_order, i.sort_order;
end;
$$;

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
  select i.id, c.id, c.name, c.sort_order, s.name, s.sort_order, i.sort_order, i.text,
         case when i.archived_at >= b.day_start and i.archived_at < b.day_end then i.archived_at
              when s.archived_at >= b.day_start and s.archived_at < b.day_end then s.archived_at
              when c.archived_at >= b.day_start and c.archived_at < b.day_end then c.archived_at
         end
  from bounds b
  join public.checklist_items i on i.created_at < b.day_end
  join public.checklist_sections s on s.id = i.section_id and s.created_at < b.day_end
  join public.checklists c on c.id = i.checklist_id and c.created_at < b.day_end
  where c.set_id = private.service_checklist_set(p_event_id)
    and (i.archived_at is null or i.archived_at >= b.day_start)
    and (s.archived_at is null or s.archived_at >= b.day_start)
    and (c.archived_at is null or c.archived_at >= b.day_start);
$$;

create or replace function public.create_checklist_set(
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
      select c.id, c.department_id, c.name, c.sort_order from public.checklists c
      where c.set_id = p_copy_from and c.archived_at is null
      order by c.sort_order, c.name
    loop
      insert into public.checklists (department_id, name, set_id, sort_order)
      values (v_list.department_id, v_list.name, v_set, v_list.sort_order) returning id into v_new_list;
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

-- Reordering department checklists is logged too.
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
    when 'checklists' then array['name', 'department_id', 'set_id', 'sort_order', 'archived_at']
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
