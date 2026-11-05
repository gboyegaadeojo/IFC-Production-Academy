-- A moved or cancelled service's details were skipped: whether it was cancelled went into a number,
-- which failed, and the safety net dropped the details. Otherwise as in
-- 20270105170000_notification_details.sql.

create or replace function private.add_notification_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := split_part(coalesce(new.dedupe_key, ''), ':', 1);
  v_id uuid := private.uuid_or_null(split_part(coalesce(new.dedupe_key, ''), ':', 2));
  v_when text;
  v_title text;
  v_role text;
  v_minutes integer;
  v_at timestamptz;
  v_cancelled boolean;
begin
  if v_id is null then
    return new;
  end if;

  if v_kind in ('assignment', 'confirm', 'serving_soon', 'serving_today', 'cover', 'cover_open', 'covered') then
    select e.title, e.starts_at, r.name into v_title, v_at, v_role
    from public.event_assignments a
    join public.events e on e.id = a.event_id
    join public.serving_roles r on r.id = a.role_id
    where a.id = case when v_kind in ('cover', 'cover_open', 'covered')
                      then (select cr.assignment_id from public.cover_requests cr where cr.id = v_id)
                      else v_id end;
    if v_title is not null then
      v_when := private.winnipeg_when(v_at);
      new.details := jsonb_build_array(
        jsonb_build_object('label', 'When', 'value', v_when),
        jsonb_build_object('label', 'Role', 'value', v_role),
        jsonb_build_object('label', 'Service', 'value', v_title));
      new.alert_body := v_when || '.' || case v_kind
        when 'assignment' then ' Tap to confirm.'
        when 'confirm' then ' Accept or decline.'
        when 'serving_soon' then ' Your SOPs are ready.'
        when 'cover' then ' Tap to take it.'
        else '' end;
    end if;

  elsif v_kind = 'service_changed' then
    select e.title, e.starts_at, e.cancelled_at is not null into v_title, v_at, v_cancelled
    from public.events e where e.id = v_id;
    if v_title is not null then
      new.details := jsonb_build_array(
        jsonb_build_object('label', 'Service', 'value', v_title),
        jsonb_build_object('label', case when v_cancelled then 'Was' else 'New time' end,
                           'value', private.winnipeg_when(v_at)));
      new.alert_body := case when v_cancelled
                             then 'It''s cancelled.'
                             else 'Now ' || private.winnipeg_when(v_at) || '.' end;
    end if;

  elsif v_kind in ('course_assigned', 'assigned_reminder') then
    select v.title, v.estimated_minutes into v_title, v_minutes
    from public.course_assignments ca
    join public.course_versions v on v.course_id = ca.course_id and v.status = 'published'
    where ca.id = v_id;
    if v_title is not null then
      new.details := jsonb_build_array(jsonb_build_object('label', 'Course', 'value', v_title))
        || case when v_minutes is not null
                then jsonb_build_array(jsonb_build_object('label', 'Time', 'value', 'About ' || v_minutes || ' min'))
                else '[]'::jsonb end;
      new.alert_body := v_title || case when v_minutes is not null then ', about ' || v_minutes || ' min.' else '.' end;
    end if;

  elsif v_kind = 'nudge' then
    select v.title into v_title
    from public.course_versions v
    where v.course_id = private.uuid_or_null(split_part(new.dedupe_key, ':', 4)) and v.status = 'published';
    if v_title is not null then
      new.details := jsonb_build_array(jsonb_build_object('label', 'Course', 'value', v_title));
    end if;

  elsif v_kind = 'competency_expiring' then
    select cr.expires_at into v_at from public.competency_records cr where cr.id = v_id;
    if v_at is not null then
      v_when := to_char(v_at at time zone 'America/Winnipeg', 'FMMon FMDD, YYYY');
      new.details := jsonb_build_array(jsonb_build_object('label', 'Expires', 'value', v_when));
      new.alert_body := 'Expires ' || v_when || '. Ask a trainer to reassess you.';
    end if;

  elsif v_kind in ('sop_review', 'sop_overdue') then
    select s.last_reviewed_at + make_interval(months => s.review_interval_months) into v_at
    from public.sops s where s.id = v_id;
    if v_at is not null then
      v_when := to_char(v_at at time zone 'America/Winnipeg', 'FMMon FMDD, YYYY');
      new.details := jsonb_build_array(jsonb_build_object('label', 'Due', 'value', v_when));
      new.alert_body := 'Due ' || v_when || '.';
    end if;
  end if;
  return new;
exception when others then
  -- Details are a nicety: never stop the notification being written.
  return new;
end;
$$;
revoke all on function private.add_notification_details() from public, anon, authenticated;
