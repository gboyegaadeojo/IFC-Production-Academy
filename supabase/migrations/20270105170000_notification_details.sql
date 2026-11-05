-- The rest of the Calm email design (G, 2026-11-05; docs/decisions/2026-11-05-alerts.md): a
-- details box in emails (when, role, service; course; due dates) and a shorter phone alert. Each
-- notification already names what it's about in its dedupe key, so one trigger looks the details
-- up as it's written, and none of the functions that write notifications change.

alter table public.notifications
  add column details jsonb not null default '[]'::jsonb,
  add column alert_body text;

create function private.uuid_or_null(p_text text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then p_text::uuid end;
$$;
revoke all on function private.uuid_or_null(text) from public, anon, authenticated;

create function private.add_notification_details()
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
    select e.title, e.starts_at, e.cancelled_at is not null into v_title, v_at, v_minutes
    from public.events e where e.id = v_id;
    if v_title is not null then
      new.details := jsonb_build_array(
        jsonb_build_object('label', 'Service', 'value', v_title),
        jsonb_build_object('label', case when v_minutes::int = 1 then 'Was' else 'New time' end,
                           'value', private.winnipeg_when(v_at)));
      new.alert_body := case when v_minutes::int = 1
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
create trigger notifications_add_details before insert on public.notifications
  for each row execute function private.add_notification_details();

-- The email job gets the details too. Otherwise as in 20270105160000_email_kind.sql.
drop function public.claim_email_notifications(integer);
create function public.claim_email_notifications(p_limit integer default 50)
returns table (id uuid, email text, kind text, title text, body text, link text, details jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n set email_status = 'skipped'
   where n.email_status = 'pending'
     and (
       exists (select 1 from public.notification_preferences p
               where p.user_id = n.user_id and p.kind = n.kind and not p.email)
       or not exists (select 1 from public.profiles pr where pr.id = n.user_id and pr.status = 'active')
     );
  return query
    with claimed as (
      select n.id
      from public.notifications n
      where n.email_status = 'pending' and n.email_attempts < 3
      order by n.created_at
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
      for update skip locked
    )
    update public.notifications n
       set email_attempts = n.email_attempts + 1
      from claimed c, auth.users u
     where n.id = c.id and u.id = n.user_id
    returning n.id, u.email::text, n.kind::text, n.title, n.body, n.link, n.details;
end;
$$;
revoke all on function public.claim_email_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_email_notifications(integer) to service_role;

-- Phone alerts use the shorter line when there is one. Otherwise as in
-- 20270105130000_serving_reminders_and_quiet_alerts.sql.
create or replace function public.claim_push(p_notification_id uuid, p_token text)
returns table (title text, body text, link text, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_title text;
  v_body text;
  v_link text;
begin
  if p_token is null or p_token is distinct from
     (select s.value from private.app_settings s where s.key = 'push_dispatch_token') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if private.alerts_held_now() then
    return;
  end if;
  update public.notifications n
     set push_status = 'sent'
   where n.id = p_notification_id and n.push_status = 'pending' and n.created_at > now() - interval '1 day'
  returning n.user_id, n.title, coalesce(nullif(n.alert_body, ''), n.body), n.link
    into v_user, v_title, v_body, v_link;
  if v_user is null then
    return;
  end if;
  return query
    select v_title, v_body, v_link, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id and p.status = 'active'
    where s.user_id = v_user;
end;
$$;

create or replace function public.claim_push_batch(p_limit integer)
returns table (notification_id uuid, title text, body text, link text, endpoint text, p256dh text, auth text, token text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications set push_status = 'none'
   where push_status = 'pending' and created_at <= now() - interval '1 day';
  if private.alerts_held_now() then
    return;
  end if;
  return query
    with claimed as (
      update public.notifications n set push_status = 'sent'
       where n.id in (
         select n2.id from public.notifications n2
          where n2.push_status = 'pending' and n2.created_at < now() - interval '1 minute'
          order by n2.created_at
          limit greatest(1, least(p_limit, 200))
          for update skip locked)
      returning n.id, n.user_id, n.title, coalesce(nullif(n.alert_body, ''), n.body) as body, n.link
    )
    select c.id, c.title, c.body, c.link, s.endpoint, s.p256dh, s.auth,
           (select a.value from private.app_settings a where a.key = 'push_dispatch_token')
    from claimed c
    join public.push_subscriptions s on s.user_id = c.user_id
    join public.profiles p on p.id = c.user_id and p.status = 'active';
end;
$$;
