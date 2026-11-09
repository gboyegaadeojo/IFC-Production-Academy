-- When someone declines, the scheduler is told and the Academy finds a replacement (G, 2026-11-09;
-- plan "Academy scheduling", PR 4; decision 2026-11-09-academy-scheduling).
--
-- Only while the Academy schedules, and only for services coming up. The replacement is the best
-- free person on the position's team: not blocked out, not serving that day, and not someone who
-- has already declined that place; trained first, then whoever served least recently. They're
-- added and asked straight away. If nobody is free, the place stays open. Either way, everyone
-- who schedules that department is told. The Academy never picks someone with a conflict, even
-- though a scheduler may add them by hand.

-- The best free person for a place, or null.
create function private.best_free_for(p_position_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from (
    select pr.id, pr.display_name,
           private.is_approved_for_role(pr.id, pos.role_id) as approved,
           (select max(e.starts_at)
              from public.event_assignments a
              join public.events e on e.id = a.event_id
             where a.user_id = pr.id and a.department_id = pos.department_id
               and a.status in ('pending', 'confirmed') and e.cancelled_at is null
               and e.starts_at < now()) as last_served
    from public.event_positions pos
    join public.serving_team_members t on t.role_id = pos.role_id and t.removed_at is null
    join public.department_memberships m
      on m.user_id = t.user_id and m.department_id = t.department_id and m.status = 'active'
    join public.profiles pr on pr.id = t.user_id and pr.status = 'active'
    where pos.id = p_position_id
      and not private.is_unavailable(pr.id, pos.event_id)
      and not private.is_serving_that_day(pr.id, pos.event_id)
      and not exists (select 1 from public.event_assignments a
                      where a.position_id = p_position_id and a.user_id = pr.id)
  ) c
  order by c.approved desc, c.last_served asc nulls first, c.display_name
  limit 1;
$$;
revoke all on function private.best_free_for(uuid) from public, anon, authenticated;

create function private.replace_declined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_role text;
  v_who text;
  v_new uuid;
  v_new_name text;
  v_new_id uuid;
  v_when text;
begin
  if new.status <> 'declined' or old.status = 'declined' then
    return null;
  end if;
  select * into v_event from public.events e where e.id = new.event_id;
  if v_event.source <> 'academy' or v_event.is_placeholder or v_event.cancelled_at is not null
     or v_event.ends_at <= now()
     or not exists (select 1 from public.organizations o
                    where o.id = v_event.organization_id and o.scheduling_source = 'academy') then
    return null;
  end if;

  select r.name into v_role from public.serving_roles r where r.id = new.role_id;
  select p.display_name into v_who from public.profiles p where p.id = new.user_id;
  v_when := to_char(v_event.starts_at at time zone 'America/Winnipeg', 'Dy Mon FMDD, FMHH12:MI AM');

  -- One replacement at a time for a place.
  perform pg_advisory_xact_lock(hashtextextended(new.position_id::text || 'replace', 0));
  if not exists (select 1 from public.event_assignments a
                 where a.position_id = new.position_id and a.status in ('pending', 'confirmed')) then
    v_new := private.best_free_for(new.position_id);
  end if;

  if v_new is not null then
    select p.display_name into v_new_name from public.profiles p where p.id = v_new;
    insert into public.event_assignments
      (position_id, event_id, department_id, role_id, user_id, readiness, override_reason,
       assigned_by, request_sent_at)
    values (new.position_id, new.event_id, new.department_id, new.role_id, v_new,
            private.readiness_for(v_new, new.role_id),
            'Added automatically after ' || coalesce(v_who, 'someone') || ' declined',
            new.assigned_by, now())
    returning id into v_new_id;
    -- Asked like anyone a scheduler sends a request to. Assignments copied from Planning Center
    -- have no scheduler, so the request is sent here instead.
    if new.assigned_by is null or new.assigned_by = v_new then
      perform private.notify(v_new, 'assignment_scheduled',
        'Please accept: ' || coalesce(v_role, 'a serving role'),
        v_event.title || ', ' || v_when || '. Please confirm or decline.',
        '/schedule', 'assignment:' || v_new_id);
    end if;
  end if;

  perform private.notify_schedulers(new.department_id,
    'Declined: ' || coalesce(v_role, 'a serving role'),
    coalesce(v_who, 'Someone') || ' can''t serve at ' || v_event.title || ', ' || v_when || '. ' ||
      case when v_new is not null
           then v_new_name || ' was free, so they were added and asked.'
           else 'No one else on the team is free, so the place is open.' end,
    '/admin/schedule/' || v_event.id,
    'declined:' || new.id);

  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (v_event.organization_id, (select auth.uid()),
    case when v_new is not null then 'schedule.declined_replaced' else 'schedule.declined_open' end,
    'event_assignments', new.id,
    jsonb_build_object('event_id', v_event.id, 'replacement_id', v_new_id));
  return null;
end;
$$;
revoke all on function private.replace_declined() from public, anon, authenticated;

create trigger event_assignments_replace_declined after update of status on public.event_assignments
  for each row execute function private.replace_declined();
