-- The order of service and plan templates in the Academy (G, 2026-11-09; plan "Academy
-- scheduling", PR 6; decision 2026-11-09-academy-scheduling).
--
-- * A service's order of service is the run of service the Service Dashboard and the wall TV
--   already show (service_plan_items). Planning Center's sync fills it for Planning Center's
--   services; while the Academy schedules, schedulers write it for the Academy's own services.
--   Items, songs, and section headers, with lengths and notes for each department.
-- * Plan templates are saved orders of service. Each service type has a usual one, which services
--   made from it start with; any template can be chosen for any service.
-- * Extra times for a service: rehearsal, sound check, or anything else.
-- Everything here is refused while Planning Center schedules.

create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_organization_id()
    references public.organizations (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plan_templates_name_idx
  on public.plan_templates (organization_id, lower(trim(name))) where archived_at is null;

alter table public.plan_templates enable row level security;
create policy "Schedulers read plan templates"
  on public.plan_templates for select to authenticated
  using (organization_id = private.current_organization_id()
         and private.has_capability_anywhere('schedule.manage'));
grant select on public.plan_templates to authenticated;
create trigger plan_templates_planning_center_guard before insert or update on public.plan_templates
  for each row execute function private.guard_planning_center_writes();

alter table public.service_types
  add column default_template_id uuid references public.plan_templates (id) on delete set null;

create table public.event_times (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('rehearsal', 'sound_check', 'other')),
  label text not null default '' check (length(label) <= 60),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index event_times_event_idx on public.event_times (event_id, starts_at);

alter table public.event_times enable row level security;
create policy "Active users read service times"
  on public.event_times for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
grant select on public.event_times to authenticated;
create trigger event_times_planning_center_guard before insert or update or delete on public.event_times
  for each row execute function private.guard_planning_center_writes();

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- An order of service: up to 150 items, each an item, song, or header with a title, a length of
-- up to four hours, and up to 20 notes of a department (or other heading) and some text.
create function private.valid_plan_items(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 150 and not exists (
    select 1 from jsonb_array_elements(p) x
    where jsonb_typeof(x) <> 'object'
       or coalesce(x ->> 'kind', '') not in ('item', 'song', 'header')
       or length(trim(coalesce(x ->> 'title', ''))) not between 1 and 120
       or coalesce(x ->> 'length_seconds', '0') !~ '^[0-9]{1,5}$'
       or coalesce((x ->> 'length_seconds')::integer, 0) > 14400
       or jsonb_typeof(coalesce(x -> 'notes', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(x -> 'notes', '[]'::jsonb)) > 20
       or exists (
         select 1 from jsonb_array_elements(coalesce(x -> 'notes', '[]'::jsonb)) n
         where length(trim(coalesce(n ->> 'category', ''))) not between 1 and 60
            or length(trim(coalesce(n ->> 'content', ''))) not between 1 and 500
       )
  );
$$;

-- An Academy service a scheduler can plan: coming up, not cancelled, while the Academy schedules.
create function private.plannable_event(p_event_id uuid)
returns public.events
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_event from public.events e
  where e.id = p_event_id and e.organization_id = private.current_organization_id();
  if v_event.id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_event.source <> 'academy' or not exists (
    select 1 from public.organizations o
    where o.id = v_event.organization_id and o.scheduling_source = 'academy'
  ) then
    raise exception 'managed_in_planning_center' using errcode = 'P0001';
  end if;
  if v_event.cancelled_at is not null or v_event.ends_at <= now() then
    raise exception 'event_closed' using errcode = 'P0001';
  end if;
  return v_event;
end;
$$;
revoke all on function private.plannable_event(uuid) from public, anon, authenticated;

-- Replaces a service's order of service. Items keep their id when they have one, so anything kept
-- with them stays; items without one are new.
create function private.write_service_plan(p_event_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.service_plan_items i
   where i.event_id = p_event_id
     and i.external_id not in (
       select x ->> 'id' from jsonb_array_elements(p_items) x where nullif(x ->> 'id', '') is not null
     );
  insert into public.service_plan_items
    (event_id, external_id, position, item_type, title, length_seconds, service_position, notes)
  select p_event_id,
         coalesce(nullif(x ->> 'id', ''), gen_random_uuid()::text),
         t.ord::integer,
         x ->> 'kind',
         trim(x ->> 'title'),
         case when x ->> 'kind' = 'header' then 0
              else coalesce((x ->> 'length_seconds')::integer, 0) end,
         'during',
         coalesce((select jsonb_agg(jsonb_build_object('category', trim(n ->> 'category'),
                                                       'content', trim(n ->> 'content')))
                     from jsonb_array_elements(coalesce(x -> 'notes', '[]'::jsonb)) n),
                  '[]'::jsonb)
  from jsonb_array_elements(p_items) with ordinality t(x, ord)
  on conflict (event_id, external_id) do update
    set position = excluded.position, item_type = excluded.item_type, title = excluded.title,
        length_seconds = excluded.length_seconds, notes = excluded.notes, updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.write_service_plan(uuid, jsonb) from public, anon, authenticated;

-- A template's items, without ids, so they're new on the service they're put on.
create function private.template_items(p_template_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x - 'id' order by t.ord), '[]'::jsonb)
  from public.plan_templates pt
  cross join lateral jsonb_array_elements(pt.items) with ordinality t(x, ord)
  where pt.id = p_template_id and pt.archived_at is null;
$$;
revoke all on function private.template_items(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- For schedulers
-- ---------------------------------------------------------------------------

create function public.save_service_plan(p_event_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.plannable_event(p_event_id);
  if not private.valid_plan_items(p_items) then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  return private.write_service_plan(p_event_id, p_items);
end;
$$;
revoke all on function public.save_service_plan(uuid, jsonb) from public, anon;
grant execute on function public.save_service_plan(uuid, jsonb) to authenticated;

create function public.apply_plan_template(p_event_id uuid, p_template_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.plannable_event(p_event_id);
  if not exists (select 1 from public.plan_templates t
                 where t.id = p_template_id and t.archived_at is null
                   and t.organization_id = private.current_organization_id()) then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  return private.write_service_plan(p_event_id, private.template_items(p_template_id));
end;
$$;
revoke all on function public.apply_plan_template(uuid, uuid) from public, anon;
grant execute on function public.apply_plan_template(uuid, uuid) to authenticated;

-- Adds a template, or renames and replaces one.
create function public.save_plan_template(p_id uuid, p_name text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_items jsonb;
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not private.valid_plan_items(p_items) then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(x - 'id' order by t.ord), '[]'::jsonb) into v_items
  from jsonb_array_elements(p_items) with ordinality t(x, ord);
  begin
    if p_id is null then
      insert into public.plan_templates (name, items) values (trim(p_name), v_items)
      returning id into v_id;
    else
      update public.plan_templates t set name = trim(p_name), items = v_items, updated_at = now()
       where t.id = p_id and t.organization_id = private.current_organization_id()
         and t.archived_at is null
      returning t.id into v_id;
      if v_id is null then
        raise exception 'template_not_found' using errcode = 'P0001';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'name_taken' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;
revoke all on function public.save_plan_template(uuid, text, jsonb) from public, anon;
grant execute on function public.save_plan_template(uuid, text, jsonb) to authenticated;

create function public.archive_plan_template(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.plan_templates t set archived_at = now()
   where t.id = p_id and t.organization_id = private.current_organization_id()
     and t.archived_at is null;
  update public.service_types s set default_template_id = null where s.default_template_id = p_id;
end;
$$;
revoke all on function public.archive_plan_template(uuid) from public, anon;
grant execute on function public.archive_plan_template(uuid) to authenticated;

create function public.set_service_type_template(p_type_id uuid, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_template_id is not null and not exists (
    select 1 from public.plan_templates t
    where t.id = p_template_id and t.archived_at is null
      and t.organization_id = private.current_organization_id()
  ) then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  update public.service_types s set default_template_id = p_template_id
   where s.id = p_type_id and s.organization_id = private.current_organization_id();
end;
$$;
revoke all on function public.set_service_type_template(uuid, uuid) from public, anon;
grant execute on function public.set_service_type_template(uuid, uuid) to authenticated;

-- Services made from a type start with its usual plan.
create function private.event_plan_from_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template uuid;
begin
  if new.service_type_id is null or new.source <> 'academy' then
    return null;
  end if;
  select s.default_template_id into v_template
  from public.service_types s where s.id = new.service_type_id;
  if v_template is not null then
    perform private.write_service_plan(new.id, private.template_items(v_template));
  end if;
  return null;
end;
$$;
revoke all on function private.event_plan_from_type() from public, anon, authenticated;
create trigger events_plan_from_type after insert on public.events
  for each row execute function private.event_plan_from_type();

-- One service of a type on a day, with a chosen plan (the type's usual one when none is chosen).
create function public.create_service(p_type_id uuid, p_date date, p_template_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
begin
  perform public.create_services(p_type_id, array[p_date]);
  select e.id into v_event from public.events e
  where e.service_type_id = p_type_id and e.cancelled_at is null
    and (e.starts_at at time zone 'America/Winnipeg')::date = p_date
  order by e.created_at desc
  limit 1;
  if v_event is null then
    raise exception 'event_closed' using errcode = 'P0001';
  end if;
  if p_template_id is not null then
    perform public.apply_plan_template(v_event, p_template_id);
  end if;
  return v_event;
end;
$$;
revoke all on function public.create_service(uuid, date, uuid) from public, anon;
grant execute on function public.create_service(uuid, date, uuid) to authenticated;

-- Replaces a service's extra times.
create function public.save_event_times(p_event_id uuid, p_times jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.plannable_event(p_event_id);
  if jsonb_typeof(p_times) <> 'array' or jsonb_array_length(p_times) > 10 or exists (
    select 1 from jsonb_array_elements(p_times) x
    where coalesce(x ->> 'kind', '') not in ('rehearsal', 'sound_check', 'other')
       or length(coalesce(x ->> 'label', '')) > 60
       or (x ->> 'starts_at') is null or (x ->> 'ends_at') is null
       or (x ->> 'ends_at')::timestamptz <= (x ->> 'starts_at')::timestamptz
       or (x ->> 'ends_at')::timestamptz - (x ->> 'starts_at')::timestamptz > interval '12 hours'
  ) then
    raise exception 'invalid_times' using errcode = '22023';
  end if;
  delete from public.event_times t where t.event_id = p_event_id;
  insert into public.event_times (event_id, kind, label, starts_at, ends_at)
  select p_event_id, x ->> 'kind', trim(coalesce(x ->> 'label', '')),
         (x ->> 'starts_at')::timestamptz, (x ->> 'ends_at')::timestamptz
  from jsonb_array_elements(p_times) x;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.save_event_times(uuid, jsonb) from public, anon;
grant execute on function public.save_event_times(uuid, jsonb) to authenticated;
