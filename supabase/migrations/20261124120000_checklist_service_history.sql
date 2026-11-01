-- Service history for pre-service checklists, as in IFC's checklist app (its US-07b):
--
-- * Each service keeps a record of its checklists: every task that was on them, where it was and
--   what it said when the service ended, ticked or not. Tasks hidden during the service are
--   listed separately and not counted. A ticked task whose text changed shows the text it was
--   ticked under too.
-- * The record is frozen when the service's day ends (midnight, Winnipeg time), by the scheduled
--   job, so later checklist edits never change it. Until then it's worked out live.
-- * Services from before this feature have no record: history shows their ticked tasks only.
-- * For checklist managers only, as the checklist app limits it to Admins.

create table public.service_checklist_records (
  event_id uuid not null references public.events (id) on delete restrict,
  item_id uuid not null references public.checklist_items (id) on delete restrict,
  checklist_id uuid not null,
  checklist_name text not null,
  department_order integer not null,
  section_name text not null,
  section_order integer not null,
  item_order integer not null,
  item_text text not null,
  -- Hidden during the service: listed separately, not counted.
  removed_at timestamptz,
  primary key (event_id, item_id)
);
alter table public.service_checklist_records enable row level security;
-- Read only through service_checklist_record(); written only when a record is frozen.

alter table public.events add column checklist_recorded_at timestamptz;

-- Services from this moment on keep a record; earlier ones show their ticks only.
alter table public.organizations add column checklist_records_since timestamptz not null default now();

create function private.checklist_records_since()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(min(o.checklist_records_since), now()) from public.organizations o;
$$;
revoke all on function private.checklist_records_since() from public, anon, authenticated;

-- The Winnipeg day a service belongs to, as an interval of instants.
create function private.service_day_bounds(p_event_id uuid, out day_start timestamptz, out day_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select ((e.starts_at at time zone 'America/Winnipeg')::date::timestamp at time zone 'America/Winnipeg'),
         (((e.starts_at at time zone 'America/Winnipeg')::date + 1)::timestamp at time zone 'America/Winnipeg')
  from public.events e where e.id = p_event_id;
$$;
revoke all on function private.service_day_bounds(uuid) from public, anon, authenticated;

-- The checklists as they stand for a service, worked out live: tasks on them at the end of the
-- service's day, plus tasks hidden during that day (marked removed).
create function private.live_service_record(p_event_id uuid)
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
  where (i.archived_at is null or i.archived_at >= b.day_start)
    and (s.archived_at is null or s.archived_at >= b.day_start)
    and (c.archived_at is null or c.archived_at >= b.day_start);
$$;
revoke all on function private.live_service_record(uuid) from public, anon, authenticated;

-- Freezes the records of services whose day has ended (scheduled job, service role). Services
-- before this feature arrived keep no record. Returns how many were frozen.
create function public.freeze_service_checklist_records()
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
revoke all on function public.freeze_service_checklist_records() from public, anon, authenticated;
grant execute on function public.freeze_service_checklist_records() to service_role;

-- The record a service shows: frozen once its day has ended, live until then, and for services
-- before this feature, only the tasks that were ticked.
create function private.service_record(p_event_id uuid)
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events e where e.id = p_event_id;
  if v_event.checklist_recorded_at is not null then
    return query
      select r.item_id, r.checklist_id, r.checklist_name, r.department_order, r.section_name,
             r.section_order, r.item_order, r.item_text, r.removed_at
      from public.service_checklist_records r where r.event_id = p_event_id;
  elsif v_event.starts_at >= private.checklist_records_since() then
    return query select * from private.live_service_record(p_event_id);
  else
    return query
      select distinct on (k.item_id) k.item_id, k.checklist_id, k.checklist_name, 0, k.section_name,
             0, 0, k.item_text, null::timestamptz
      from public.checklist_checkoffs k
      where k.event_id = p_event_id and k.unchecked_at is null and k.reset_id is null
      order by k.item_id;
  end if;
end;
$$;
revoke all on function private.service_record(uuid) from public, anon, authenticated;

-- Past and current services, newest first, with "X of Y done".
create function public.checklist_history(p_limit integer default 30)
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  has_record boolean,
  done integer,
  total integer
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
    select e.id, e.title, e.starts_at,
           e.starts_at >= private.checklist_records_since(),
           (select count(*)::integer from private.service_record(e.id) r
             where r.removed_at is null and exists (
               select 1 from public.checklist_checkoffs k
               where k.event_id = e.id and k.item_id = r.item_id
                 and k.unchecked_at is null and k.reset_id is null)),
           (select count(*)::integer from private.service_record(e.id) r where r.removed_at is null)
    from public.events e
    where e.organization_id = private.current_organization_id()
      and e.cancelled_at is null
      and e.starts_at <= now() + interval '2 days'
    order by e.starts_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;
revoke all on function public.checklist_history(integer) from public, anon;
grant execute on function public.checklist_history(integer) to authenticated;

-- One service's record, task by task.
create function public.service_checklist_record(p_event_id uuid)
returns table (
  checklist_id uuid,
  checklist_name text,
  section_name text,
  item_id uuid,
  item_text text,
  checked_text text,
  checked_by_name text,
  checked_at timestamptz,
  removed_at timestamptz
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
    select r.checklist_id, r.checklist_name, r.section_name, r.item_id, r.item_text,
           k.item_text, pr.display_name, k.checked_at, r.removed_at
    from private.service_record(p_event_id) r
    left join public.checklist_checkoffs k
      on k.event_id = p_event_id and k.item_id = r.item_id
     and k.unchecked_at is null and k.reset_id is null
    left join public.profiles pr on pr.id = k.checked_by
    order by r.department_order, r.checklist_name, r.section_order, r.section_name, r.item_order;
end;
$$;
revoke all on function public.service_checklist_record(uuid) from public, anon;
grant execute on function public.service_checklist_record(uuid) to authenticated;
