-- Sends onboarding pathway emails (decision 2026-11-01-onboarding-pathways). Only the notifications
-- job calls these, with the service role, and only for an organisation that has turned onboarding
-- emails on. Emails held while they were off stay held: nobody gets a welcome written for last month.

alter table public.onboarding_outbox add column attempts integer not null default 0;

alter table public.onboarding_outbox drop constraint onboarding_outbox_status_check;
alter table public.onboarding_outbox add constraint onboarding_outbox_status_check
  check (status in ('held', 'pending', 'sent', 'failed', 'skipped'));

create function public.claim_onboarding_emails(p_limit integer default 50)
returns table (id uuid, email text, subject text, body text, has_account boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Someone whose account was suspended or deactivated isn't emailed.
  update public.onboarding_outbox o set status = 'skipped'
    from public.onboarding_contacts c
    join public.profiles p on p.id = c.user_id
   where c.id = o.contact_id and o.status = 'pending' and p.status <> 'active';

  return query
    with claimed as (
      select o.id
      from public.onboarding_outbox o
      join public.onboarding_contacts c on c.id = o.contact_id
      join public.organizations org on org.id = c.organization_id
      where o.status = 'pending' and o.attempts < 3 and org.onboarding_emails_enabled
      order by o.created_at
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
      for update of o skip locked
    )
    update public.onboarding_outbox o
       set attempts = o.attempts + 1
      from claimed cl, public.onboarding_contacts c
     where o.id = cl.id and c.id = o.contact_id
    returning o.id, c.email, o.subject, o.body, c.user_id is not null;
end;
$$;

create function public.complete_onboarding_email(p_id uuid, p_sent boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.onboarding_outbox o
     set status = case when p_sent then 'sent'
                       when o.attempts >= 3 then 'failed'
                       else 'pending' end,
         sent_at = case when p_sent then now() else o.sent_at end
   where o.id = p_id and o.status = 'pending';
$$;

revoke all on function public.claim_onboarding_emails(integer) from public, anon, authenticated;
revoke all on function public.complete_onboarding_email(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_onboarding_emails(integer) to service_role;
grant execute on function public.complete_onboarding_email(uuid, boolean) to service_role;
