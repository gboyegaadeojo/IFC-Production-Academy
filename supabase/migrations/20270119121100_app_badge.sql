-- The number on the app's icon (badge A, G 2026-11-10): every unread notification and message
-- together, the same totals the bell and Messages show in the app. Alerts carry it, so the icon is
-- right as soon as one arrives, even with the app closed.

-- One person's total: notifications not yet read or cleared, plus unread messages in the chats
-- they can read and haven't muted (only while messaging is on), counted as Messages counts them.
create function private.app_badge_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with person as (
    select p.id, p.organization_id from public.profiles p where p.id = p_user_id and p.status = 'active'
  ),
  messaging as (
    select exists (
      select 1 from person join public.feature_flags f
        on f.organization_id = person.organization_id and f.key = 'messaging' and f.enabled) as enabled
  )
  select (
    -- Message notices are left out: their messages are counted below, once.
    (select count(*)::integer from public.notifications n
      where n.user_id = p_user_id and n.read_at is null and n.cleared_at is null
        and n.kind <> 'message')
    + coalesce((
      select sum((
        select count(*) from public.messages m
        where m.conversation_id = c.id and m.deleted_at is null
          and m.sender_id is distinct from p_user_id
          and m.created_at > coalesce(me.last_read_at, now() - interval '7 days')))::integer
      from person
      join public.conversations c on c.organization_id = person.organization_id
      left join public.conversation_members me on me.conversation_id = c.id and me.user_id = p_user_id
      where (select enabled from messaging)
        and not coalesce(me.muted, false)
        and exists (select 1 from private.conversation_readers(c.id) r where r.user_id = p_user_id)
    ), 0))
  from (select 1) one;
$$;
revoke all on function private.app_badge_count(uuid) from public, anon, authenticated;

-- The total for each device an alert is about to go to, by its push address. For the alert senders
-- only: the Worker's dispatch (with the database's own token, as claim_push) and the service role.
create function public.push_badges(p_endpoints text[], p_token text default null)
returns table (endpoint text, badge integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and (p_token is null or p_token is distinct from
          (select s.value from private.app_settings s where s.key = 'push_dispatch_token')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select s.endpoint, private.app_badge_count(s.user_id)
    from public.push_subscriptions s
    where s.endpoint = any (p_endpoints);
end;
$$;
revoke all on function public.push_badges(text[], text) from public;
grant execute on function public.push_badges(text[], text) to anon, authenticated, service_role;

-- The signed-in person's own total, for the app to set the icon while it's open.
create function public.my_app_badge()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.app_badge_count((select auth.uid()));
$$;
revoke all on function public.my_app_badge() from public, anon;
grant execute on function public.my_app_badge() to authenticated;
