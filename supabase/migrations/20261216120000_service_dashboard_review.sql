-- Service Dashboard, stage 5 (docs/decisions/2026-11-02-service-dashboard.md, ADD-DASH-10):
-- After the service. Actual times come from Planning Center when someone runs Services LIVE, and
-- viewers from what was recorded during the service. Nothing here is entered by hand.

alter table public.service_plan_items
  add column actual_seconds integer check (actual_seconds >= 0);

create or replace function public.sync_service_plan_items(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_plan jsonb;
  v_event_id uuid;
  v_plans integer := 0;
  v_items integer := 0;
  v_count integer;
begin
  select o.id into v_org from public.organizations o order by o.created_at limit 1;
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
      (event_id, external_id, position, item_type, title, length_seconds, service_position, notes,
       actual_seconds)
    select v_event_id,
           x ->> 'id',
           (x ->> 'position')::integer,
           x ->> 'item_type',
           x ->> 'title',
           greatest(coalesce((x ->> 'length_seconds')::integer, 0), 0),
           x ->> 'service_position',
           coalesce(x -> 'notes', '[]'::jsonb),
           (x ->> 'actual_seconds')::integer
    from jsonb_array_elements(v_plan -> 'items') x
    on conflict (event_id, external_id) do update
      set position = excluded.position,
          item_type = excluded.item_type,
          title = excluded.title,
          length_seconds = excluded.length_seconds,
          service_position = excluded.service_position,
          notes = excluded.notes,
          actual_seconds = excluded.actual_seconds,
          updated_at = now();
    get diagnostics v_count = row_count;
    v_items := v_items + v_count;
  end loop;
  return jsonb_build_object('plans', v_plans, 'items', v_items);
end;
$$;

create function public.service_viewer_history(p_event_id uuid)
returns table (platform text, viewers integer, sampled_at timestamptz)
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
    select v.platform, v.viewers, v.sampled_at
    from public.service_viewer_samples v
    where v.event_id = p_event_id
    order by v.sampled_at
    limit 2000;
end;
$$;
revoke all on function public.service_viewer_history(uuid) from public, anon;
grant execute on function public.service_viewer_history(uuid) to authenticated;
