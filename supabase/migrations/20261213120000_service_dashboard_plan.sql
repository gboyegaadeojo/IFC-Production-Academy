-- Service Dashboard, stage 2 (docs/decisions/2026-11-02-service-dashboard.md, ADD-DASH-05):
--
-- * The run of service: each plan's items, songs, and notes, read from Planning Center by the
--   same scheduled job as the rest of the sync, and applied here. Planning Center stays read-only.
-- * Shared producer notes for a service.
-- * Who's serving, with "Trained" or "Still learning" shown and never a gate.

create table public.service_plan_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  external_id text not null,
  position integer not null,
  item_type text not null,
  title text not null,
  length_seconds integer not null default 0 check (length_seconds >= 0),
  service_position text not null default 'during'
    check (service_position in ('pre', 'during', 'post')),
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, external_id)
);
create index service_plan_items_event_idx on public.service_plan_items (event_id, position);

alter table public.service_plan_items enable row level security;

create policy "Service Dashboard viewers read the run of service"
  on public.service_plan_items for select to authenticated
  using (private.can_view_service_dashboard());

grant select on public.service_plan_items to authenticated;

-- Applied only by the scheduled job. A plan's items are replaced by what Planning Center has now.
-- Plans outside the job's window are left alone, so past services keep their run of service.
create function public.sync_service_plan_items(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_organization_id();
  v_plan jsonb;
  v_event_id uuid;
  v_plans integer := 0;
  v_items integer := 0;
  v_count integer;
begin
  for v_plan in select * from jsonb_array_elements(coalesce(p -> 'plans', '[]'::jsonb)) loop
    select e.id into v_event_id
    from public.events e
    where e.organization_id = v_org
      and e.source = 'planning_center'
      and e.external_id = v_plan ->> 'plan_id';
    if v_event_id is null then
      continue;
    end if;
    v_plans := v_plans + 1;

    delete from public.service_plan_items i
     where i.event_id = v_event_id
       and i.external_id not in (
         select x ->> 'id' from jsonb_array_elements(v_plan -> 'items') x
       );

    insert into public.service_plan_items
      (event_id, external_id, position, item_type, title, length_seconds, service_position, notes)
    select v_event_id,
           x ->> 'id',
           (x ->> 'position')::integer,
           x ->> 'item_type',
           x ->> 'title',
           greatest(coalesce((x ->> 'length_seconds')::integer, 0), 0),
           x ->> 'service_position',
           coalesce(x -> 'notes', '[]'::jsonb)
    from jsonb_array_elements(v_plan -> 'items') x
    on conflict (event_id, external_id) do update
      set position = excluded.position,
          item_type = excluded.item_type,
          title = excluded.title,
          length_seconds = excluded.length_seconds,
          service_position = excluded.service_position,
          notes = excluded.notes,
          updated_at = now();
    get diagnostics v_count = row_count;
    v_items := v_items + v_count;
  end loop;
  return jsonb_build_object('plans', v_plans, 'items', v_items);
end;
$$;
revoke all on function public.sync_service_plan_items(jsonb) from public, anon, authenticated;
grant execute on function public.sync_service_plan_items(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Who's serving
-- ---------------------------------------------------------------------------

create function public.service_dashboard_team(p_event_id uuid)
returns table (
  position_id uuid,
  role_name text,
  display_name text,
  readiness public.assignment_readiness
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_view_service_dashboard() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select p.id, r.name, pr.display_name, a.readiness
    from public.event_positions p
    join public.serving_roles r on r.id = p.role_id
    join public.departments d on d.id = p.department_id
    left join public.event_assignments a
      on a.position_id = p.id and a.status in ('pending', 'confirmed')
    left join public.profiles pr on pr.id = a.user_id
    where p.event_id = p_event_id
    order by d.sort_order, p.sort_order;
end;
$$;
revoke all on function public.service_dashboard_team(uuid) from public, anon;
grant execute on function public.service_dashboard_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Producer notes
-- ---------------------------------------------------------------------------

create table public.service_notes (
  event_id uuid primary key references public.events (id) on delete cascade,
  body text not null default '' check (length(body) <= 4000),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_notes enable row level security;

create policy "Service Dashboard viewers read producer notes"
  on public.service_notes for select to authenticated
  using (private.can_view_service_dashboard());

grant select on public.service_notes to authenticated;

-- Working notes for the team, so the latest save wins. Saving the same text twice is harmless.
create function public.save_service_note(p_event_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_view_service_dashboard() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.service_notes as n (event_id, body, updated_by)
  values (p_event_id, p_body, (select auth.uid()))
  on conflict (event_id) do update
    set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
revoke all on function public.save_service_note(uuid, text) from public, anon;
grant execute on function public.save_service_note(uuid, text) to authenticated;
