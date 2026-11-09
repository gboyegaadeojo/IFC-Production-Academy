-- Instant phone alerts for messages (ADD-MSG-06, G 2026-11-09: "messages should feel like WhatsApp").
--
-- When a message is sent, the Worker calls claim_message_alerts() straight after replying, and
-- sends the alerts it returns with the Academy's VAPID keys. Only people who can read the chat, have
-- alerts on a device, haven't muted it, aren't looking at it now (read in the last 30 seconds, which
-- the open chat refreshes every 15), haven't had an alert for it in the last 20 seconds, and whose
-- Messages phone choice is on. Quiet hours (20:00 to 08:00), the launch switch (ADD-NOTIF-02:
-- named testers only until launch), and the messaging switch all still apply. Claiming records
-- alerted_at first, so a retry never buzzes twice.
--
-- The 15-minute job keeps message notices for the bell and for email, and never sends a phone
-- alert for them: those are now instant.

alter table public.conversation_members add column alerted_at timestamptz;

create function public.claim_message_alerts(p_message_id uuid)
returns table (
  conversation_id uuid, kind text, chat_name text, sender_name text, preview text,
  attachment_kind text, unread_count integer, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_message public.messages;
  v_conversation public.conversations;
  v_chat_name text;
  v_sender text;
  v_attachment text;
  v_live boolean;
begin
  select * into v_message from public.messages m
   where m.id = p_message_id and m.deleted_at is null and m.created_at > now() - interval '2 minutes';
  if not found or private.alerts_held_now() then
    return;
  end if;
  select * into v_conversation from public.conversations c where c.id = v_message.conversation_id;
  if not exists (
    select 1 from public.feature_flags f
    where f.organization_id = v_conversation.organization_id and f.key = 'messaging' and f.enabled) then
    return;
  end if;
  select o.notifications_live into v_live from public.organizations o where o.id = v_conversation.organization_id;
  select coalesce(v_conversation.title, d.name, 'a direct message') into v_chat_name
    from (select 1) one left join public.departments d on d.id = v_conversation.department_id;
  select p.display_name into v_sender from public.profiles p where p.id = v_message.sender_id;
  select min(a.kind) into v_attachment from public.message_attachments a where a.message_id = v_message.id;

  return query
  with due as (
    select r.user_id, me.last_read_at
    from private.conversation_readers(v_conversation.id) r
    left join public.conversation_members me
      on me.conversation_id = v_conversation.id and me.user_id = r.user_id
    where r.user_id is distinct from v_message.sender_id
      and not coalesce(me.muted, false)
      and (me.last_read_at is null or me.last_read_at < now() - interval '30 seconds')
      and (me.alerted_at is null or me.alerted_at < now() - interval '20 seconds')
      and (coalesce(v_live, false)
           or exists (select 1 from public.notification_testers t where t.user_id = r.user_id))
      and not exists (
        select 1 from public.notification_preferences np
        where np.user_id = r.user_id and np.kind = 'message' and not np.push)
      and exists (select 1 from public.push_subscriptions s where s.user_id = r.user_id)
  ),
  marked as (
    insert into public.conversation_members (conversation_id, user_id, alerted_at)
    select v_conversation.id, due.user_id, now() from due
    on conflict on constraint conversation_members_pkey do update set alerted_at = now()
    returning public.conversation_members.user_id
  )
  select v_conversation.id, v_conversation.kind, v_chat_name, v_sender,
    case when v_conversation.kind = 'direct' then null
         else left(regexp_replace(coalesce(v_message.body, ''), '\s+', ' ', 'g'), 140) end,
    v_attachment,
    (select count(*)::integer from public.messages m
      where m.conversation_id = v_conversation.id and m.deleted_at is null
        and m.sender_id is distinct from due.user_id
        and m.created_at > greatest(coalesce(due.last_read_at, '-infinity'), now() - interval '7 days')),
    s.endpoint, s.p256dh, s.auth
  from due
  join marked on marked.user_id = due.user_id
  join public.push_subscriptions s on s.user_id = due.user_id;
end;
$$;
revoke all on function public.claim_message_alerts(uuid) from public, anon, authenticated;
grant execute on function public.claim_message_alerts(uuid) to service_role;

-- A device the push service says has gone, for the Worker's service-role client.
create function public.message_alert_device_gone(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
revoke all on function public.message_alert_device_gone(text) from public, anon, authenticated;
grant execute on function public.message_alert_device_gone(text) to service_role;

-- As in 20270105150000_more_notifications.sql, plus: message notices never go to phones, because
-- phone alerts for messages are now instant. They still show under the bell and can be emailed.
create or replace function private.route_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('certificate_ready', 'new_course', 'sop_updated') then
    new.email_status := 'skipped';
    new.push_status := 'none';
    return new;
  end if;
  if new.kind = 'message' then
    new.push_status := 'none';
  end if;
  if exists (
    select 1 from public.notification_preferences p
    where p.user_id = new.user_id and p.kind = new.kind and not p.push
  ) then
    new.push_status := 'none';
  end if;
  if new.kind <> 'service_changed' and exists (
    select 1 from public.push_subscriptions s
    where s.user_id = new.user_id and private.is_phone_label(s.device_label)
  ) and not exists (
    select 1 from public.notification_preferences p
    where p.user_id = new.user_id and p.kind = new.kind and not p.push
  ) then
    new.email_status := 'skipped';
  end if;
  return new;
end;
$$;
