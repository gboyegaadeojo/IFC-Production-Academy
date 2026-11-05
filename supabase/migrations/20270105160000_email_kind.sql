-- The email job needs each notification's kind, so its button can say what it does (the Calm email
-- design, decision 2026-11-05). Otherwise as in 20261111120000_notifications.sql. A function's
-- result columns can't change in place, so it's dropped and made again.
drop function public.claim_email_notifications(integer);

create function public.claim_email_notifications(p_limit integer default 50)
returns table (id uuid, email text, kind text, title text, body text, link text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n set email_status = 'skipped'
   where n.email_status = 'pending'
     and (
       exists (select 1 from public.notification_preferences p
               where p.user_id = n.user_id and p.kind = n.kind and not p.email)
       or not exists (select 1 from public.profiles pr where pr.id = n.user_id and pr.status = 'active')
     );
  return query
    with claimed as (
      select n.id
      from public.notifications n
      where n.email_status = 'pending' and n.email_attempts < 3
      order by n.created_at
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
      for update skip locked
    )
    update public.notifications n
       set email_attempts = n.email_attempts + 1
      from claimed c, auth.users u
     where n.id = c.id and u.id = n.user_id
    returning n.id, u.email::text, n.kind::text, n.title, n.body, n.link;
end;
$$;
revoke all on function public.claim_email_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_email_notifications(integer) to service_role;
