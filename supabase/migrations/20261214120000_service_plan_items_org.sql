-- The run of service sync runs as the scheduled job, with nobody signed in, so it can't find the
-- church through the signed-in person (ADD-DASH-05). It looks it up as sync_planning_center does.
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
