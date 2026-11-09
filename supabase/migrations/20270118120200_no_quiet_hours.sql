-- No quiet hours, and onboarding emails on (G, 2026-11-09).
-- * Emails and phone alerts go out at any time of day, not held from 20:00 to 08:00 Winnipeg time.
--   Every hold went through private.alerts_held_now(), so it now never holds. Phones have their own
--   Do Not Disturb. The email job's own check is gone too (scripts/send-notifications.ts).
-- * Onboarding pathway emails are switched on, as the first volunteers start. Emails written while
--   they were off stay 'held' and aren't sent, as the runbook says.

create or replace function private.alerts_held_now()
returns boolean
language sql
stable
set search_path = ''
as $$
  select false;
$$;
revoke all on function private.alerts_held_now() from public, anon, authenticated;

drop function private.is_quiet_hour(timestamptz);
delete from private.app_settings where key = 'quiet_hours_off';

update public.organizations set onboarding_emails_enabled = true;
