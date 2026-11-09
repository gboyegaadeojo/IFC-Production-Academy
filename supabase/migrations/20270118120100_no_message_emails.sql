-- Messages are never emailed (G, 2026-11-09; ADD-MSG-06). A new message reaches a phone through the
-- instant alert, and shows under the bell; an email saying there's a new message isn't wanted.
-- As in 20270117120000_instant_message_alerts.sql, plus: message notices skip email too.
create or replace function private.route_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('certificate_ready', 'new_course', 'sop_updated', 'message') then
    new.email_status := 'skipped';
    new.push_status := 'none';
    return new;
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

-- Message emails still waiting aren't sent.
update public.notifications set email_status = 'skipped'
 where kind = 'message' and email_status = 'pending';
