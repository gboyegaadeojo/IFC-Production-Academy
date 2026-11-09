-- Blockout dates like Planning Center's (G, 2026-11-09; plan "Academy scheduling", PR 7).
--
-- One day, a date range, part of a day (from and to times, Winnipeg), or repeating on the first
-- day's weekday (every week, every other week, or the 1st, 2nd, 3rd, 4th, or last of the month)
-- until a date within a year. Each can have a reason, which schedulers see. A part-of-a-day
-- blockout counts only when it overlaps the service. The same rules drive the warning on the
-- service page and the Academy's own picks, which never choose someone blocked out.
-- lib/domain/blockouts.ts applies the same rules to forms and calendars.

alter table public.unavailability
  add column start_time time,
  add column end_time time,
  add column repeat_rule text check (repeat_rule in
    ('weekly', 'every_other_week', 'first', 'second', 'third', 'fourth', 'last')),
  add constraint unavailability_times_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time
        and starts_on = ends_on and repeat_rule is null)
  );

-- Whether a repeating rule falls on a day, on the weekday of its first day.
create function private.repeat_falls_on(p_rule text, p_anchor date, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(dow from p_day) = extract(dow from p_anchor) and case p_rule
    when 'weekly' then true
    when 'every_other_week' then ((p_day - p_anchor) / 7) % 2 = 0
    when 'first' then extract(day from p_day) <= 7
    when 'second' then extract(day from p_day) between 8 and 14
    when 'third' then extract(day from p_day) between 15 and 21
    when 'fourth' then extract(day from p_day) between 22 and 28
    when 'last' then extract(month from p_day + 7) <> extract(month from p_day)
    else false
  end;
$$;

-- The blockout covering a service, if any: its day, and for part of a day, its times.
create function private.blockout_for(p_user_id uuid, p_event_id uuid)
returns public.unavailability
language sql
stable
security definer
set search_path = ''
as $$
  select u.*
  from public.unavailability u
  join public.events e on e.id = p_event_id
  cross join lateral (
    select (e.starts_at at time zone 'America/Winnipeg')::date as day,
           (e.starts_at at time zone 'America/Winnipeg')::time as starts,
           (e.ends_at at time zone 'America/Winnipeg')::time as ends
  ) w
  where u.user_id = p_user_id
    and w.day between u.starts_on and u.ends_on
    and (u.repeat_rule is null or private.repeat_falls_on(u.repeat_rule, u.starts_on, w.day))
    and (u.start_time is null
         or (u.start_time < case when w.ends <= w.starts then time '23:59:59' else w.ends end
             and u.end_time > w.starts))
  order by u.starts_on
  limit 1;
$$;
revoke all on function private.blockout_for(uuid, uuid) from public, anon, authenticated;

create or replace function private.is_unavailable(p_user_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.blockout_for(p_user_id, p_event_id)).id is not null;
$$;

create or replace function private.blockout_note(p_user_id uuid, p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when b.id is null then null else coalesce(nullif(trim(b.note), ''), 'Away') end
  from (select (private.blockout_for(p_user_id, p_event_id)).*) b;
$$;

-- A volunteer adds a blockout. If it covers a service they're already on, whoever schedules it
-- is told, so they can find someone else.
create function public.add_blockout(
  p_starts_on date,
  p_ends_on date,
  p_note text default '',
  p_start_time time default null,
  p_end_time time default null,
  p_repeat text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row record;
  v_name text;
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_ends_on > p_starts_on + 366 or length(coalesce(p_note, '')) > 200
     or (p_start_time is null) <> (p_end_time is null)
     or (p_start_time is not null and (p_end_time <= p_start_time or p_ends_on <> p_starts_on
                                       or p_repeat is not null))
     or (p_repeat is not null and p_repeat not in
           ('weekly', 'every_other_week', 'first', 'second', 'third', 'fourth', 'last')) then
    raise exception 'invalid_dates' using errcode = '22023';
  end if;
  insert into public.unavailability (user_id, starts_on, ends_on, note, start_time, end_time, repeat_rule)
  values ((select auth.uid()), p_starts_on, p_ends_on, trim(coalesce(p_note, '')),
          p_start_time, p_end_time, p_repeat)
  returning id into v_id;

  select p.display_name into v_name from public.profiles p where p.id = (select auth.uid());
  for v_row in
    select a.id, a.department_id, e.id as event_id, e.title, e.starts_at, r.name as role_name
    from public.event_assignments a
    join public.events e on e.id = a.event_id and e.cancelled_at is null and e.starts_at > now()
      and e.source = 'academy'
    join public.serving_roles r on r.id = a.role_id
    where a.user_id = (select auth.uid()) and a.status in ('pending', 'confirmed')
      and (private.blockout_for(a.user_id, a.event_id)).id = v_id
  loop
    perform private.notify_schedulers(v_row.department_id,
      'Blocked out: ' || coalesce(v_name, 'a volunteer'),
      coalesce(v_name, 'A volunteer') || ' has blocked out ' || v_row.title || ', ' ||
        to_char(v_row.starts_at at time zone 'America/Winnipeg', 'Dy Mon FMDD, FMHH12:MI AM') ||
        ', where they''re on as ' || v_row.role_name || '.',
      '/admin/schedule/' || v_row.event_id,
      'blocked_out:' || v_id || ':' || v_row.id);
  end loop;
  return v_id;
end;
$$;
revoke all on function public.add_blockout(date, date, text, time, time, text) from public, anon;
grant execute on function public.add_blockout(date, date, text, time, time, text) to authenticated;
