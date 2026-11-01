-- "Last synced" on the Schedule page (redesign approved 2026-11-01): when Planning Center was
-- last read, for any active user. Only the time: the sync log itself stays with the people who
-- manage Planning Center.
create function public.pco_last_synced()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select r.finished_at from public.pco_sync_runs r
  where private.is_active_user() and r.organization_id = private.church_id()
  order by r.finished_at desc
  limit 1;
$$;
revoke all on function public.pco_last_synced() from public, anon;
grant execute on function public.pco_last_synced() to authenticated;
