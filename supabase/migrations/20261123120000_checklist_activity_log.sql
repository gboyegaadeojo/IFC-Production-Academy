-- The checklist activity log, as in IFC's Sunday Pre-Service Checklist app (its US-07a, US-13b,
-- Q23, Q26):
--
-- * One permanent, append-only log of every tick, untick, reset, and undo that reaches the
--   server, including attempts that changed nothing or were refused, and every checklist edit
--   (add, rename, edit, hide, restore, move, reorder, position links) with its before and after
--   values. Each entry has who, when, the sign-in session, and (for check-offs) the browser tab.
-- * Entries are written in the same transaction as the change they describe, and can never be
--   edited or deleted, by anyone, through the app or directly in the database.
-- * Only checklist managers (the app's Admins) can read it.
-- * Ticking, resetting, and undoing now go through checklist_tick, checklist_reset, and
--   checklist_undo_reset, which log every attempt. The functions they wrap can't be called
--   directly any more, so nothing reaches the check-offs without being logged.

create table public.checklist_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  -- The real clock, so entries in one transaction keep their order.
  happened_at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('checkoff', 'edit')),
  action text not null check (length(action) between 1 and 40),
  outcome text not null check (outcome in ('ok', 'unchanged', 'refused')),
  reason text check (reason is null or length(reason) <= 60),
  event_id uuid,
  target_table text,
  target_id uuid,
  -- What the entry is about, as it read at the time (a task, a section, a list).
  subject text not null default '' check (length(subject) <= 400),
  before jsonb,
  after jsonb,
  -- People, by the Academy's internal id, with their name as it was.
  actor_id uuid,
  actor_name text not null default '',
  session_id text check (session_id is null or length(session_id) <= 80),
  tab_id text check (tab_id is null or length(tab_id) <= 80)
);
create index checklist_log_event_idx on public.checklist_log (event_id, happened_at desc);
create index checklist_log_kind_idx on public.checklist_log (kind, happened_at desc);

alter table public.checklist_log enable row level security;
create policy "Checklist managers read the activity log"
  on public.checklist_log for select to authenticated
  using (private.has_capability_anywhere('checklist.manage'));
grant select on public.checklist_log to authenticated;

create function private.checklist_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'checklist_log is append-only' using errcode = '42501';
end;
$$;
create trigger checklist_log_no_update before update or delete on public.checklist_log
  for each row execute function private.checklist_log_is_append_only();
create trigger checklist_log_no_truncate before truncate on public.checklist_log
  for each statement execute function private.checklist_log_is_append_only();

-- Writes one entry for the signed-in person (or the system, with no actor).
create function private.write_checklist_log(
  p_kind text, p_action text, p_outcome text, p_reason text, p_event_id uuid,
  p_target_table text, p_target_id uuid, p_subject text, p_before jsonb, p_after jsonb,
  p_tab_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  insert into public.checklist_log
    (organization_id, kind, action, outcome, reason, event_id, target_table, target_id, subject,
     before, after, actor_id, actor_name, session_id, tab_id)
  values (
    coalesce(private.current_organization_id(),
             (select o.id from public.organizations o order by o.created_at limit 1)),
    p_kind, p_action, p_outcome, left(p_reason, 60), p_event_id, p_target_table, p_target_id,
    left(coalesce(p_subject, ''), 400), p_before, p_after, v_actor,
    coalesce((select pr.display_name from public.profiles pr where pr.id = v_actor), ''),
    left(v_claims ->> 'session_id', 80),
    left(nullif(trim(coalesce(p_tab_id, '')), ''), 80)
  );
end;
$$;
revoke all on function private.write_checklist_log(text, text, text, text, uuid, text, uuid, text, jsonb, jsonb, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Check-offs: every attempt is logged
-- ---------------------------------------------------------------------------

-- Only these wrappers may be called from now on.
revoke execute on function public.set_checklist_item(uuid, uuid, boolean) from authenticated;
revoke execute on function public.reset_service_checklists(uuid) from authenticated;
revoke execute on function public.undo_checklist_reset(uuid) from authenticated;

-- The reasons the app explains; anything else is logged and shown as "unknown".
create function private.checklist_reason(p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_message in ('not_authorized', 'checklist_closed', 'item_not_found',
                                 'nothing_to_reset', 'nothing_to_undo')
              then p_message else 'unknown' end;
$$;

-- Ticks or unticks an item. Returns 'ok', or why it was refused.
create function public.checklist_tick(
  p_event_id uuid, p_item_id uuid, p_checked boolean, p_tab_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
  v_before boolean;
  v_after boolean;
  v_reason text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select c.name || ' › ' || s.name || ' › ' || i.text into v_subject
  from public.checklist_items i
  join public.checklist_sections s on s.id = i.section_id
  join public.checklists c on c.id = i.checklist_id
  where i.id = p_item_id;
  v_before := exists (
    select 1 from public.checklist_checkoffs k
    where k.event_id = p_event_id and k.item_id = p_item_id
      and k.unchecked_at is null and k.reset_id is null
  );
  begin
    perform public.set_checklist_item(p_event_id, p_item_id, p_checked);
  exception when others then
    v_reason := private.checklist_reason(sqlerrm);
    perform private.write_checklist_log('checkoff', case when p_checked then 'check' else 'uncheck' end,
      'refused', v_reason, p_event_id, 'checklist_items', p_item_id, coalesce(v_subject, ''),
      null, null, p_tab_id);
    return v_reason;
  end;
  v_after := exists (
    select 1 from public.checklist_checkoffs k
    where k.event_id = p_event_id and k.item_id = p_item_id
      and k.unchecked_at is null and k.reset_id is null
  );
  perform private.write_checklist_log('checkoff', case when p_checked then 'check' else 'uncheck' end,
    case when v_before = v_after then 'unchanged' else 'ok' end, null, p_event_id,
    'checklist_items', p_item_id, coalesce(v_subject, ''),
    jsonb_build_object('checked', v_before), jsonb_build_object('checked', v_after), p_tab_id);
  return 'ok';
end;
$$;

-- Resets a service's ticks. Returns {ok, count} or {ok: false, reason}.
create function public.checklist_reset(p_event_id uuid, p_tab_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_reason text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  begin
    v_count := public.reset_service_checklists(p_event_id);
  exception when others then
    v_reason := private.checklist_reason(sqlerrm);
    perform private.write_checklist_log('checkoff', 'reset', 'refused', v_reason, p_event_id,
      'events', p_event_id, '', null, null, p_tab_id);
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end;
  perform private.write_checklist_log('checkoff', 'reset', 'ok', null, p_event_id, 'events',
    p_event_id, '', null, jsonb_build_object('cleared', v_count), p_tab_id);
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

create function public.checklist_undo_reset(p_event_id uuid, p_tab_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_reason text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  begin
    v_count := public.undo_checklist_reset(p_event_id);
  exception when others then
    v_reason := private.checklist_reason(sqlerrm);
    perform private.write_checklist_log('checkoff', 'undo_reset', 'refused', v_reason, p_event_id,
      'events', p_event_id, '', null, null, p_tab_id);
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end;
  perform private.write_checklist_log('checkoff', 'undo_reset', 'ok', null, p_event_id, 'events',
    p_event_id, '', null, jsonb_build_object('restored', v_count), p_tab_id);
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

revoke all on function public.checklist_tick(uuid, uuid, boolean, text) from public, anon;
revoke all on function public.checklist_reset(uuid, text) from public, anon;
revoke all on function public.checklist_undo_reset(uuid, text) from public, anon;
grant execute on function public.checklist_tick(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.checklist_reset(uuid, text) to authenticated;
grant execute on function public.checklist_undo_reset(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Checklist edits
-- ---------------------------------------------------------------------------

-- Logs an add, rename, edit, hide, restore, move, or reorder, with before and after values.
create function private.log_checklist_edit()
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
    when 'checklists' then array['name', 'department_id', 'archived_at']
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
    if v_after = '{}'::jsonb then
      return null;
    end if;
    v_action := case
      when v_after ? 'archived_at' and v_after ->> 'archived_at' is not null then 'hide'
      when v_after ? 'archived_at' then 'restore'
      when v_after ? 'section_id' or v_after ? 'checklist_id' or v_after ? 'department_id' then 'move'
      when v_after ? 'text' then 'edit'
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

create trigger checklists_log after insert or update on public.checklists
  for each row execute function private.log_checklist_edit();
create trigger checklist_sections_log after insert or update on public.checklist_sections
  for each row execute function private.log_checklist_edit();
create trigger checklist_items_log after insert or update on public.checklist_items
  for each row execute function private.log_checklist_edit();
create trigger checklist_positions_log after insert or delete on public.checklist_positions
  for each row execute function private.log_checklist_edit();
