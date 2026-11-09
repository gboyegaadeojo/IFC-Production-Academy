-- Auto-schedule and scheduling preferences (G, 2026-11-09; plan "Academy scheduling", PR 8).
--
-- * Volunteers say how often they'd like to serve (at most so many times a month) and whether to
--   serve with someone in their household: the same services when possible, or never the same.
-- * propose_schedule() suggests someone for each open place in the chosen services, for the
--   departments the scheduler schedules. It only reads. The rules are the Academy's own picks:
--   the position's team only; never someone blocked out, serving that day, or who declined that
--   place; within how often they asked to serve; household wishes; trained first, then whoever
--   served least recently. Each suggestion says why.
-- * apply_schedule_proposal() adds the suggestions the scheduler keeps, as "Not sent yet", through
--   assign_to_position, so the usual checks and audit apply. Nobody is emailed until requests are
--   sent.

create table public.scheduling_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  max_per_month integer check (max_per_month between 1 and 8),
  household_member_id uuid references public.profiles (id) on delete set null,
  household_mode text check (household_mode in ('together', 'apart')),
  updated_at timestamptz not null default now(),
  check (household_member_id is distinct from user_id),
  check ((household_member_id is null) = (household_mode is null))
);

alter table public.scheduling_preferences enable row level security;
create policy "People read their own preferences, and schedulers read everyone's"
  on public.scheduling_preferences for select to authenticated
  using (user_id = (select auth.uid()) or private.has_capability_anywhere('schedule.manage'));
grant select on public.scheduling_preferences to authenticated;

-- People someone can choose to serve with: active members of a department they're in.
create function public.household_options()
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.id, p.display_name
  from public.department_memberships mine
  join public.department_memberships theirs
    on theirs.department_id = mine.department_id and theirs.status = 'active'
  join public.profiles p on p.id = theirs.user_id and p.status = 'active'
  where mine.user_id = (select auth.uid()) and mine.status = 'active'
    and p.id <> (select auth.uid())
  order by p.display_name;
$$;
revoke all on function public.household_options() from public, anon;
grant execute on function public.household_options() to authenticated;

create function public.set_my_scheduling_preferences(
  p_max_per_month integer,
  p_household_member_id uuid,
  p_household_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if (p_max_per_month is not null and p_max_per_month not between 1 and 8)
     or (p_household_member_id is null) <> (p_household_mode is null)
     or (p_household_mode is not null and p_household_mode not in ('together', 'apart'))
     or (p_household_member_id is not null and not exists (
           select 1 from public.household_options() o where o.user_id = p_household_member_id)) then
    raise exception 'invalid_preferences' using errcode = '22023';
  end if;
  insert into public.scheduling_preferences (user_id, max_per_month, household_member_id, household_mode, updated_at)
  values ((select auth.uid()), p_max_per_month, p_household_member_id, p_household_mode, now())
  on conflict (user_id) do update
    set max_per_month = excluded.max_per_month,
        household_member_id = excluded.household_member_id,
        household_mode = excluded.household_mode,
        updated_at = now();
end;
$$;
revoke all on function public.set_my_scheduling_preferences(integer, uuid, text) from public, anon;
grant execute on function public.set_my_scheduling_preferences(integer, uuid, text) to authenticated;

create function public.propose_schedule(p_event_ids uuid[])
returns table (position_id uuid, user_id uuid, display_name text, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place record;
  v_pick record;
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  create temporary table if not exists proposed (
    position_id uuid, event_id uuid, user_id uuid, day date, month date
  ) on commit drop;
  delete from pg_temp.proposed;

  for v_place in
    select p.id, p.event_id, p.role_id, p.department_id,
           (e.starts_at at time zone 'America/Winnipeg')::date as day
    from public.event_positions p
    join public.events e on e.id = p.event_id
    where e.id = any (p_event_ids)
      and e.organization_id = private.current_organization_id()
      and e.source = 'academy' and e.cancelled_at is null and not e.is_placeholder
      and e.starts_at > now()
      and private.has_capability('schedule.manage', p.department_id)
      and not exists (select 1 from public.event_assignments a
                      where a.position_id = p.id and a.status in ('pending', 'confirmed'))
    order by e.starts_at, p.sort_order, p.id
  loop
    select c.id, c.display_name, c.approved, c.last_served, c.month_count, c.max_per_month,
           c.with_household, c.household_name
      into v_pick
    from (
      select pr.id, pr.display_name,
             private.is_approved_for_role(pr.id, v_place.role_id) as approved,
             (select max(e.starts_at) from public.event_assignments a
                join public.events e on e.id = a.event_id
               where a.user_id = pr.id and a.department_id = v_place.department_id
                 and a.status in ('pending', 'confirmed') and e.cancelled_at is null
                 and e.starts_at < now()) as last_served,
             (select count(*) from public.event_assignments a
                join public.events e on e.id = a.event_id and e.cancelled_at is null
               where a.user_id = pr.id and a.status in ('pending', 'confirmed')
                 and date_trunc('month', e.starts_at at time zone 'America/Winnipeg')
                       = date_trunc('month', v_place.day::timestamp))
             + (select count(*) from pg_temp.proposed x
                 where x.user_id = pr.id and x.month = date_trunc('month', v_place.day::timestamp))
               as month_count,
             sp.max_per_month,
             (sp.household_mode = 'together' and (
                exists (select 1 from public.event_assignments a
                        where a.event_id = v_place.event_id and a.user_id = sp.household_member_id
                          and a.status in ('pending', 'confirmed'))
                or exists (select 1 from pg_temp.proposed x
                           where x.event_id = v_place.event_id and x.user_id = sp.household_member_id)))
               as with_household,
             hp.display_name as household_name,
             sp.household_mode, sp.household_member_id
      from public.serving_team_members t
      join public.department_memberships m
        on m.user_id = t.user_id and m.department_id = t.department_id and m.status = 'active'
      join public.profiles pr on pr.id = t.user_id and pr.status = 'active'
      left join public.scheduling_preferences sp on sp.user_id = pr.id
      left join public.profiles hp on hp.id = sp.household_member_id
      where t.role_id = v_place.role_id and t.removed_at is null
        and not private.is_unavailable(pr.id, v_place.event_id)
        and not private.is_serving_that_day(pr.id, v_place.event_id)
        and not exists (select 1 from pg_temp.proposed x where x.user_id = pr.id and x.day = v_place.day)
        and not exists (select 1 from public.event_assignments a
                        where a.position_id = v_place.id and a.user_id = pr.id)
    ) c
    where (c.max_per_month is null or c.month_count < c.max_per_month)
      and not (c.household_mode = 'apart' and (
        exists (select 1 from public.event_assignments a
                join public.events e on e.id = a.event_id and e.cancelled_at is null
                where a.user_id = c.household_member_id and a.status in ('pending', 'confirmed')
                  and (e.starts_at at time zone 'America/Winnipeg')::date = v_place.day)
        or exists (select 1 from pg_temp.proposed x
                   where x.user_id = c.household_member_id and x.day = v_place.day)))
    order by coalesce(c.with_household, false) desc, c.approved desc, c.last_served asc nulls first,
             c.month_count, c.display_name
    limit 1;

    if v_pick.id is not null then
      insert into pg_temp.proposed values
        (v_place.id, v_place.event_id, v_pick.id, v_place.day, date_trunc('month', v_place.day::timestamp));
      position_id := v_place.id;
      user_id := v_pick.id;
      display_name := v_pick.display_name;
      reason := concat_ws(', ',
        case when coalesce(v_pick.with_household, false) then 'serves with ' || v_pick.household_name end,
        case when v_pick.approved then 'trained' else 'still learning' end,
        case when v_pick.last_served is null then 'hasn''t served yet'
             else 'last served ' || to_char(v_pick.last_served at time zone 'America/Winnipeg', 'Mon FMDD') end,
        (v_pick.month_count + 1) || coalesce(' of ' || v_pick.max_per_month, '') || ' this month');
      return next;
    else
      position_id := v_place.id;
      user_id := null;
      display_name := null;
      reason := 'No one on the team is free';
      return next;
    end if;
    v_pick := null;
  end loop;
end;
$$;
revoke all on function public.propose_schedule(uuid[]) from public, anon;
grant execute on function public.propose_schedule(uuid[]) to authenticated;

-- Adds the suggestions kept, as "Not sent yet". Places filled meanwhile are skipped.
create function public.apply_schedule_proposal(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_added integer := 0;
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'invalid_proposal' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      perform public.assign_to_position((v_item ->> 'position_id')::uuid, (v_item ->> 'user_id')::uuid);
      v_added := v_added + 1;
    exception
      when sqlstate 'P0001' then null;
    end;
  end loop;
  return v_added;
end;
$$;
revoke all on function public.apply_schedule_proposal(jsonb) from public, anon;
grant execute on function public.apply_schedule_proposal(jsonb) to authenticated;
