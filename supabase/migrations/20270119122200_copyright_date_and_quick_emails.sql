-- Video and graphics approvals, after G tried it (2026-11-13; decision 2026-11-12, update):
-- 1. The form asks for a date only. A request is linked to that day's Planning Center service, if
--    there is one, whenever it's saved, so a service published later is picked up when Quality
--    control opens the request.
-- 2. Late requests are refused by default (G: "They should also not be able to send it").
-- 3. Emails go within a minute or two: the app asks for the email job straight after a request or
--    decision, at most once a minute, instead of waiting for the 15-minute run.

-- 1. Link a request to its day's service.
create function private.copyright_link_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_id is null then
    select e.id into new.event_id
    from public.events e
    where e.organization_id = new.organization_id
      and e.cancelled_at is null
      and (e.starts_at at time zone 'Etc/GMT+5')::date = new.service_day
    order by e.starts_at
    limit 1;
  end if;
  return new;
end;
$$;

create trigger copyright_requests_link_service
  before insert or update on public.copyright_requests
  for each row execute function private.copyright_link_service();

-- 2. Refuse late requests by default, and for the organisation as it is now.
alter table public.copyright_settings alter column late_policy set default 'block';
update public.copyright_settings set late_policy = 'block' where late_policy = 'accept';

-- 3. Ask for the email job straight away, at most once a minute.
alter table public.copyright_settings add column email_kicked_at timestamptz;

-- True when emails are waiting and nobody asked for the job in the last minute; records the ask.
-- The public form calls this after sending, so it's limited, and reveals nothing.
create function public.copyright_kick_emails()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(private.current_organization_id(), private.copyright_public_org());
  v_kicked boolean;
begin
  update public.copyright_settings s
     set email_kicked_at = now()
   where s.organization_id = v_org
     and (s.email_kicked_at is null or s.email_kicked_at < now() - interval '1 minute')
     and exists (select 1 from public.copyright_outbox o
                 where o.organization_id = v_org and o.status = 'pending')
  returning true into v_kicked;
  return coalesce(v_kicked, false);
end;
$$;
revoke all on function public.copyright_kick_emails() from public;
grant execute on function public.copyright_kick_emails() to anon, authenticated;
revoke all on function private.copyright_link_service() from public, anon, authenticated;
