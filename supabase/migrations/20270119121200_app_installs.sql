-- Who has the app on their phone, beside who has alerts on (G, 2026-11-10).
-- * The app notes when it's opened from a Home Screen (record_app_open), once a day at most, per
--   kind of device. A phone doesn't say when an app is deleted, so this is "has opened it".
-- * team_alert_status also says which kinds of alert someone has switched off for their phone,
--   so leaders see "Off for: Training" without anyone's choices being changed.

create table public.app_installs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('iphone', 'android', 'computer')),
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  primary key (user_id, platform)
);

alter table public.app_installs enable row level security;
grant select on public.app_installs to authenticated;

-- People see their own. Leaders see others' only through team_alert_status below.
create policy app_installs_select_own on public.app_installs
  for select to authenticated using (user_id = (select auth.uid()));

-- Notes that the signed-in person opened the installed app on this kind of device.
create function public.record_app_open(p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_platform not in ('iphone', 'android', 'computer') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;
  if not private.is_active_user() then
    return;
  end if;
  insert into public.app_installs (user_id, platform)
  values ((select auth.uid()), p_platform)
  on conflict (user_id, platform) do update set last_opened_at = now();
end;
$$;
revoke all on function public.record_app_open(text) from public, anon;
grant execute on function public.record_app_open(text) to authenticated;

-- Same people and rules as before, plus where they've opened the app and which kinds of alert
-- they've switched off for their phone.
drop function public.team_alert_status();
create function public.team_alert_status()
returns table (
  user_id uuid,
  display_name text,
  departments text[],
  status text,
  devices text[],
  last_sent_at timestamptz,
  app_platforms text[],
  push_off_kinds text[]
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
    max(s.last_sent_at),
    coalesce((select array_agg(i.platform order by i.platform) from public.app_installs i where i.user_id = p.id), '{}'),
    coalesce((select array_agg(np.kind::text order by np.kind::text) from public.notification_preferences np
              where np.user_id = p.id and not np.push), '{}')
  from people
  join public.profiles p on p.id = people.user_id and p.status = 'active'
  left join public.push_subscriptions s on s.user_id = p.id
  left join public.alert_exceptions e on e.user_id = p.id
  group by p.id, p.display_name, people.departments, e.user_id
  order by p.display_name;
$$;
revoke all on function public.team_alert_status() from public, anon;
grant execute on function public.team_alert_status() to authenticated;
