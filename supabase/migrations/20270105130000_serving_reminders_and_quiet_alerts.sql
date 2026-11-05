-- Reminders (G, 2026-11-05; docs/decisions/2026-11-05-alerts.md).
-- * Serving reminders now cover Planning Center's services too. G chose to have both the Academy and
--   Planning Center send them, so some people get both. This replaces the choice recorded in
--   20261122120000_planning_center.sql.
-- * A reminder on the morning of a service, and one for an assigned course not started after 7 days.
-- * Phones keep quiet hours as email does, 20:00 to 08:00 Winnipeg time. What's written overnight
--   goes out at 08:00.
-- * No more than one learning reminder a day per person. Serving reminders aren't limited.
-- All of it still waits behind the launch switch, like every other notification.

-- ---------------------------------------------------------------------------
-- Quiet hours for phones
-- ---------------------------------------------------------------------------

create function private.is_quiet_hour(p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(hour from p_at at time zone 'America/Winnipeg') not between 8 and 19;
$$;
revoke all on function private.is_quiet_hour(timestamptz) from public, anon, authenticated;

-- A setting, so tests of sending don't depend on the time of day they run.
create function private.alerts_held_now()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_quiet_hour(now())
    and not exists (select 1 from private.app_settings s where s.key = 'quiet_hours_off');
$$;
revoke all on function private.alerts_held_now() from public, anon, authenticated;

-- As in 20261210120000_push_alerts.sql, leaving it for the job during quiet hours.
create or replace function private.push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select s.value from private.app_settings s where s.key = 'push_dispatch_url');
  v_token text := (select s.value from private.app_settings s where s.key = 'push_dispatch_token');
begin
  if v_url is not null and v_token is not null and not private.alerts_held_now() then
    begin
      perform net.http_post(
        url := v_url,
        body := jsonb_build_object('id', new.id, 'token', v_token),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 5000
      );
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

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
  returning n.user_id, n.title, n.body, n.link into v_user, v_title, v_body, v_link;
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
      returning n.id, n.user_id, n.title, n.body, n.link
    )
    select c.id, c.title, c.body, c.link, s.endpoint, s.p256dh, s.auth,
           (select a.value from private.app_settings a where a.key = 'push_dispatch_token')
    from claimed c
    join public.push_subscriptions s on s.user_id = c.user_id
    join public.profiles p on p.id = c.user_id and p.status = 'active';
end;
$$;

-- ---------------------------------------------------------------------------
-- One learning reminder a day
-- ---------------------------------------------------------------------------

create function private.is_learning_reminder(p_kind public.notification_kind, p_dedupe_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind = 'learning_nudge'
    or (p_kind = 'course_assigned' and p_dedupe_key like 'assigned_reminder:%');
$$;
revoke all on function private.is_learning_reminder(public.notification_kind, text)
  from public, anon, authenticated;

-- Skipped, not lost: nothing is recorded, so the next day's run writes it.
create function private.one_learning_reminder_a_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_learning_reminder(new.kind, new.dedupe_key) and exists (
    select 1 from public.notifications n
    where n.user_id = new.user_id
      and private.is_learning_reminder(n.kind, n.dedupe_key)
      and (n.created_at at time zone 'America/Winnipeg')::date =
          (now() at time zone 'America/Winnipeg')::date
  ) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function private.one_learning_reminder_a_day() from public, anon, authenticated;
create trigger notifications_one_learning_reminder before insert on public.notifications
  for each row execute function private.one_learning_reminder_a_day();

-- ---------------------------------------------------------------------------
-- The new reminders
-- ---------------------------------------------------------------------------

-- From 08:00 Winnipeg time on the day of the service, until it starts.
create function private.serving_today_due(p_starts_at timestamptz, p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_at < p_starts_at
    and (p_at at time zone 'America/Winnipeg')::date =
        (p_starts_at at time zone 'America/Winnipeg')::date
    and extract(hour from p_at at time zone 'America/Winnipeg') >= 8;
$$;
revoke all on function private.serving_today_due(timestamptz, timestamptz)
  from public, anon, authenticated;

-- Run by the scheduled job, with queue_reminders. Safe to run any number of times.
create function public.queue_serving_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  -- Please confirm, for Planning Center's services (queue_reminders covers the Academy's own).
  for v_row in
    select a.id, a.user_id, e.title, e.starts_at, r.name as role_name
    from public.event_assignments a
    join public.events e on e.id = a.event_id and e.cancelled_at is null
      and e.source <> 'academy'
    join public.serving_roles r on r.id = a.role_id
    join public.profiles p on p.id = a.user_id and p.status = 'active'
    where a.status = 'pending'
      and a.assigned_at <= now() - interval '48 hours'
      and e.starts_at > now() + interval '1 day'
  loop
    perform private.notify(v_row.user_id, 'serving_reminder',
      'Please confirm: ' || v_row.role_name,
      v_row.title || ', ' || private.winnipeg_when(v_row.starts_at) ||
        '. Accept or decline in Planning Center.',
      '/schedule', 'confirm:' || v_row.id);
    v_count := v_count + 1;
  end loop;

  -- Serving soon: from 10:00 two days before, for Planning Center's services.
  for v_row in
    select a.id, a.user_id, e.title, e.starts_at, r.name as role_name
    from public.event_assignments a
    join public.events e on e.id = a.event_id and e.cancelled_at is null
      and e.source <> 'academy'
    join public.serving_roles r on r.id = a.role_id
    join public.profiles p on p.id = a.user_id and p.status = 'active'
    cross join lateral (
      select ((((e.starts_at at time zone 'America/Winnipeg')::date - 2) + time '10:00')
                at time zone 'America/Winnipeg') as remind_at
    ) t
    where a.status = 'confirmed'
      and e.starts_at > now()
      and now() >= t.remind_at
      and a.assigned_at < t.remind_at
  loop
    perform private.notify(v_row.user_id, 'serving_reminder',
      'Serving soon: ' || v_row.role_name,
      v_row.title || ', ' || private.winnipeg_when(v_row.starts_at) ||
        '. Review the SOPs for your role before you arrive.',
      '/schedule', 'serving_soon:' || v_row.id);
    v_count := v_count + 1;
  end loop;

  -- The morning of, for every service.
  for v_row in
    select a.id, a.user_id, e.title, e.starts_at, r.name as role_name
    from public.event_assignments a
    join public.events e on e.id = a.event_id and e.cancelled_at is null
    join public.serving_roles r on r.id = a.role_id
    join public.profiles p on p.id = a.user_id and p.status = 'active'
    where a.status = 'confirmed'
      and private.serving_today_due(e.starts_at, now())
  loop
    perform private.notify(v_row.user_id, 'serving_reminder',
      'Serving today: ' || v_row.role_name,
      v_row.title || ', ' || private.winnipeg_when(v_row.starts_at) || '.',
      '/schedule', 'serving_today:' || v_row.id);
    v_count := v_count + 1;
  end loop;

  -- An assigned course not started after 7 days, once. Started courses get the usual nudges.
  for v_row in
    select ca.id, ca.user_id, ca.course_id, v.title
    from public.course_assignments ca
    join public.courses c on c.id = ca.course_id and c.archived_at is null
    join public.course_versions v on v.course_id = c.id and v.status = 'published'
    join public.profiles p on p.id = ca.user_id and p.status = 'active'
    where ca.removed_at is null
      and ca.assigned_at <= now() - interval '7 days'
      and not exists (
        select 1 from public.lesson_progress lp
        where lp.user_id = ca.user_id and lp.course_id = ca.course_id
      )
  loop
    perform private.notify(v_row.user_id, 'course_assigned',
      'Still to start: ' || v_row.title,
      'A leader asked you to take this course. Go at your own pace.',
      '/courses/' || v_row.course_id, 'assigned_reminder:' || v_row.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke all on function public.queue_serving_reminders() from public, anon, authenticated;
grant execute on function public.queue_serving_reminders() to service_role;
