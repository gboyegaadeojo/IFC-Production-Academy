-- Alerts on phones and computers: web push (SRS-NOTIF-005; G chose the Home Screen app and alerts
-- within seconds, 2026-11-01). Every notification already shows in the app; on devices where
-- someone turned alerts on, it also drops down as a system alert.
--
-- Flow: a notification is written, then a trigger asks the app (/api/push/dispatch) through
-- pg_net, passing a token the database made itself. The app claims the notification once with
-- that token, gets the person's devices, and sends the encrypted alerts. Anything the app couldn't
-- send is picked up by the 15-minute job. The app never needs the service-role key for this.

create extension if not exists pg_net with schema extensions;

-- Settings only the database and the deploy step touch: the dispatch address and the token.
create table private.app_settings (
  key text primary key,
  value text not null
);
alter table private.app_settings enable row level security;
revoke all on private.app_settings from public, anon, authenticated;
insert into private.app_settings (key, value)
values ('push_dispatch_token', translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_'))
on conflict (key) do nothing;

-- Run by the deploy workflow with the site's public address.
create function private.set_push_dispatch_url(p_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.app_settings (key, value) values ('push_dispatch_url', p_url)
  on conflict (key) do update set value = excluded.value;
$$;
revoke all on function private.set_push_dispatch_url(text) from public, anon, authenticated;

-- One row per device (browser) with alerts on. The keys are the browser's public encryption
-- keys; the endpoint is the push service address for that device.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  device_label text not null default '' check (length(device_label) <= 80),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "People see their own devices"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) and private.is_active_user());
grant select on public.push_subscriptions to authenticated;

-- Turn alerts on for this device. A device that signs in as someone else moves to them.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(coalesce(p_label, ''), 80))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        device_label = excluded.device_label, created_at = now();
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Turn alerts off for one of your devices.
create function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = (select auth.uid());
$$;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- Whether each notification still needs an alert. Earlier ones are old news.
alter table public.notifications
  add column push_status text not null default 'pending' check (push_status in ('pending', 'sent', 'none'));
update public.notifications set push_status = 'none';
create index notifications_push_pending_idx on public.notifications (created_at) where push_status = 'pending';

-- No devices with alerts on: nothing to send.
create function private.push_status_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then
    new.push_status := 'none';
  end if;
  return new;
end;
$$;
revoke all on function private.push_status_on_insert() from public, anon, authenticated;
create trigger notifications_push_status before insert on public.notifications
for each row execute function private.push_status_on_insert();

-- Ask the app to send it now. pg_net sends after the transaction commits; if that fails, the
-- 15-minute job sends it instead. Never stops the notification being written.
create function private.push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select s.value from private.app_settings s where s.key = 'push_dispatch_url');
  v_token text := (select s.value from private.app_settings s where s.key = 'push_dispatch_token');
begin
  if v_url is not null and v_token is not null then
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
revoke all on function private.push_dispatch() from public, anon, authenticated;
create trigger notifications_push_dispatch after insert on public.notifications
for each row when (new.push_status = 'pending') execute function private.push_dispatch();

-- The app claims one notification, once, with the database's token, and gets what to send and
-- where. Only recent notifications for active people; a second claim returns nothing.
create function public.claim_push(p_notification_id uuid, p_token text)
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
revoke all on function public.claim_push(uuid, text) from public;
grant execute on function public.claim_push(uuid, text) to anon, authenticated, service_role;

-- The push service says this device has gone (uninstalled, or alerts turned off in settings).
create function public.push_subscription_gone(p_endpoint text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token is distinct from
     (select s.value from private.app_settings s where s.key = 'push_dispatch_token') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;
revoke all on function public.push_subscription_gone(text, text) from public;
grant execute on function public.push_subscription_gone(text, text) to anon, authenticated, service_role;

-- For the 15-minute job (service role only): claim what the app didn't send, with the token so the
-- job can report gone devices the same way. Anything older than a day is no longer worth an alert.
create function public.claim_push_batch(p_limit integer)
returns table (notification_id uuid, title text, body text, link text, endpoint text, p256dh text, auth text, token text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications set push_status = 'none'
   where push_status = 'pending' and created_at <= now() - interval '1 day';
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
revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
