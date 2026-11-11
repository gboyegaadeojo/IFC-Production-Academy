-- Report a problem (health check follow-up, G 2026-11-11): anyone signed in sends a short note
-- from the account menu, with the page, device, and app version it was sent from. Platform admins
-- get a notification (and its email) for each one, and read them in Admin → Problem reports, where
-- they mark them sorted. Reached only through these functions; the table has no policies.

insert into public.capabilities (key, description)
values ('problem.review', 'Read problem reports and mark them sorted')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'platform_admin' and c.key = 'problem.review'
on conflict do nothing;

create table public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete set null,
  message text not null check (char_length(message) between 1 and 2000),
  page text not null default '' check (char_length(page) <= 300),
  device text not null default '' check (char_length(device) <= 200),
  app_version text not null default '' check (char_length(app_version) <= 40),
  status text not null default 'open' check (status in ('open', 'sorted')),
  sorted_by uuid references public.profiles (id) on delete set null,
  sorted_at timestamptz,
  created_at timestamptz not null default now()
);
create index problem_reports_org_created_idx on public.problem_reports (organization_id, created_at desc);
create index problem_reports_user_created_idx on public.problem_reports (user_id, created_at desc);
alter table public.problem_reports enable row level security;

-- Sends a report. At most 10 a day per person, so a stuck button can't flood the admins' email.
create function public.report_problem(
  p_message text, p_page text default '', p_device text default '', p_app_version text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_id uuid;
  v_name text;
  v_message text := trim(coalesce(p_message, ''));
  v_admin uuid;
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_message = '' then
    raise exception 'empty_report' using errcode = 'P0001';
  end if;
  if (select count(*) from public.problem_reports r
      where r.user_id = v_user and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_reports' using errcode = 'P0001';
  end if;
  v_org := private.current_organization_id();
  insert into public.problem_reports (organization_id, user_id, message, page, device, app_version)
  values (v_org, v_user, left(v_message, 2000), left(coalesce(p_page, ''), 300),
          left(coalesce(p_device, ''), 200), left(coalesce(p_app_version, ''), 40))
  returning id into v_id;

  select coalesce(nullif(trim(p.display_name), ''), 'Someone') into v_name
  from public.profiles p where p.id = v_user;
  for v_admin in
    select distinct ur.user_id
    from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    join public.capabilities c on c.id = rc.capability_id and c.key = 'problem.review'
    join public.profiles p on p.id = ur.user_id and p.status = 'active' and p.organization_id = v_org
    where ur.revoked_at is null
  loop
    perform private.notify(v_admin, 'problem_reported',
      v_name || ' reported a problem',
      left(v_message, 300) || case when coalesce(p_page, '') <> '' then ' (on ' || left(p_page, 100) || ')' else '' end,
      '/admin/problem-reports',
      'problem_reported:' || v_id || ':' || v_admin);
  end loop;
  return v_id;
end;
$$;
revoke all on function public.report_problem(text, text, text, text) from public, anon;
grant execute on function public.report_problem(text, text, text, text) to authenticated;

-- The reports, newest first: open ones only, or all of them.
create function public.problem_reports_list(p_include_sorted boolean default false)
returns table (
  id uuid, message text, page text, device text, app_version text, status text,
  created_at timestamptz, sorted_at timestamptz, reporter_name text, sorted_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_active_user() and private.has_capability('problem.review')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
  select r.id, r.message, r.page, r.device, r.app_version, r.status, r.created_at, r.sorted_at,
         coalesce(nullif(trim(p.display_name), ''), 'Someone'), s.display_name
  from public.problem_reports r
  left join public.profiles p on p.id = r.user_id
  left join public.profiles s on s.id = r.sorted_by
  where r.organization_id = private.current_organization_id()
    and (p_include_sorted or r.status = 'open')
  order by r.created_at desc
  limit 200;
end;
$$;
revoke all on function public.problem_reports_list(boolean) from public, anon;
grant execute on function public.problem_reports_list(boolean) to authenticated;

-- Marks a report sorted, or open again. In the audit log (SRS-AUDIT-001). Safe to retry.
create function public.set_problem_report_status(p_id uuid, p_sorted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (private.is_active_user() and private.has_capability('problem.review')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.problem_reports r
     set status = case when p_sorted then 'sorted' else 'open' end,
         sorted_by = case when p_sorted then (select auth.uid()) end,
         sorted_at = case when p_sorted then now() end
   where r.id = p_id
     and r.organization_id = private.current_organization_id()
     and r.status is distinct from case when p_sorted then 'sorted' else 'open' end
  returning r.id into v_id;
  if v_id is not null then
    insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
    values (private.current_organization_id(), (select auth.uid()),
      'problem_report.' || case when p_sorted then 'sorted' else 'reopened' end,
      'problem_reports', v_id, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.set_problem_report_status(uuid, boolean) from public, anon;
grant execute on function public.set_problem_report_status(uuid, boolean) to authenticated;
