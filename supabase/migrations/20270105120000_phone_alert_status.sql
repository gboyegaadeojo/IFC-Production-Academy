-- Who has phone alerts on (G, 2026-11-05; docs/decisions/2026-11-05-alerts.md). A browser only lets
-- each person turn alerts on themselves, so "must" means asking everyone on a team until it's done,
-- and showing leaders who hasn't. Someone whose phone can't do it can say so.
--
-- Department Leaders see their own departments' teams; Production Directors and Platform Admins see
-- everyone. Devices stay private: only people with alerts.view see this summary, through a function.

insert into public.capabilities (key, description)
values ('alerts.view', 'See who on a team has phone alerts on')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key in ('department_leader', 'production_director', 'platform_admin')
  and c.key = 'alerts.view'
on conflict do nothing;

-- "My phone can't do this": said by the person, changed only through set_alerts_unavailable.
create table public.alert_exceptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  noted_at timestamptz not null default now()
);
alter table public.alert_exceptions enable row level security;
create policy "People see their own alert exception"
  on public.alert_exceptions for select to authenticated
  using (user_id = (select auth.uid()) and private.is_active_user());
grant select on public.alert_exceptions to authenticated;

create function public.set_alerts_unavailable(p_unavailable boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_unavailable then
    insert into public.alert_exceptions (user_id) values ((select auth.uid()))
    on conflict (user_id) do nothing;
  else
    delete from public.alert_exceptions where user_id = (select auth.uid());
  end if;
end;
$$;
revoke all on function public.set_alerts_unavailable(boolean) from public, anon;
grant execute on function public.set_alerts_unavailable(boolean) to authenticated;

-- A phone or tablet, by the label the device gave when alerts were turned on.
create function private.is_phone_label(p_label text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_label in ('iPhone', 'iPad', 'Android phone');
$$;
revoke all on function private.is_phone_label(text) from public, anon, authenticated;

-- Everyone on a team: a member of a department, or on a position's team.
create function private.team_people()
returns table (user_id uuid, department_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.department_id
  from public.department_memberships m
  where m.status = 'active'
  union
  select t.user_id, t.department_id
  from public.serving_team_members t
  where t.removed_at is null;
$$;
revoke all on function private.team_people() from public, anon, authenticated;

-- Whether to ask this person to set alerts up: they're on a team, with no phone on and no exception.
create function public.alerts_setup_needed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user()
    and exists (select 1 from private.team_people() t where t.user_id = (select auth.uid()))
    and not exists (
      select 1 from public.push_subscriptions s
      where s.user_id = (select auth.uid()) and private.is_phone_label(s.device_label)
    )
    and not exists (
      select 1 from public.alert_exceptions e where e.user_id = (select auth.uid())
    );
$$;
revoke all on function public.alerts_setup_needed() from public, anon;
grant execute on function public.alerts_setup_needed() to authenticated;

-- The list for leaders, limited to the departments this person may see.
create function public.team_alert_status()
returns table (
  user_id uuid,
  display_name text,
  departments text[],
  status text,
  devices text[],
  last_sent_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select t.user_id, d.name
    from private.team_people() t
    join public.departments d on d.id = t.department_id
    where private.is_active_user()
      and private.has_capability('alerts.view', t.department_id)
  ),
  people as (
    select v.user_id, array_agg(distinct v.name order by v.name) as departments
    from visible v
    group by v.user_id
  )
  select
    p.id,
    p.display_name,
    people.departments,
    case
      when bool_or(private.is_phone_label(s.device_label)) then 'on'
      when e.user_id is not null then 'cannot'
      when count(s.id) > 0 then 'computer_only'
      else 'off'
    end,
    coalesce(array_agg(distinct s.device_label) filter (where s.id is not null), '{}'),
    max(s.last_sent_at)
  from people
  join public.profiles p on p.id = people.user_id and p.status = 'active'
  left join public.push_subscriptions s on s.user_id = p.id
  left join public.alert_exceptions e on e.user_id = p.id
  group by p.id, p.display_name, people.departments, e.user_id
  order by p.display_name;
$$;
revoke all on function public.team_alert_status() from public, anon;
grant execute on function public.team_alert_status() to authenticated;
