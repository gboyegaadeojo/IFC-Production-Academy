-- Clearing notifications (G, 2026-11-06): "Clear all" and a clear button on each one, beside
-- "Mark all read". Clearing hides a notification from the bell and the list; the row stays, so
-- emails and alerts already sent, and the record, are untouched. Clearing also marks it read.

alter table public.notifications add column cleared_at timestamptz;

create index notifications_user_shown_idx
  on public.notifications (user_id, created_at desc)
  where cleared_at is null;

-- Clears your own notifications: the ones given, or every one when p_ids is null. Safe to retry.
create function public.clear_notifications(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set cleared_at = now(), read_at = coalesce(n.read_at, now())
   where n.user_id = (select auth.uid()) and n.cleared_at is null
     and private.is_active_user()
     and (p_ids is null or n.id = any (p_ids[1:500]));
$$;

revoke all on function public.clear_notifications(uuid[]) from public, anon;
grant execute on function public.clear_notifications(uuid[]) to authenticated;
