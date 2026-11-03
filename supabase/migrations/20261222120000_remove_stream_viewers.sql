-- The Service Dashboard shows whether YouTube is live and drops viewer counts, on YouTube and
-- Facebook (G, 2026-11-03; ADD-DASH-07, ADD-DASH-10). Nothing was ever recorded: no API key was set.
-- The channel stays on organizations, and the wall TV still reads it through screen_dashboard.

drop function public.service_viewer_history(uuid);
drop function public.save_viewer_sample(uuid, text, integer, text);
drop function public.save_stream_search(uuid, text, text, text);
drop function public.service_stream_state(uuid, text, text);
drop table public.service_viewer_samples;
drop table public.service_streams;

-- The channel, for the stream tile on a computer.
create function public.service_stream_channel()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_view_service_dashboard() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return (select o.youtube_channel_id from public.organizations o
          where o.id = private.current_organization_id());
end;
$$;
revoke all on function public.service_stream_channel() from public, anon;
grant execute on function public.service_stream_channel() to authenticated;

-- The last answer from YouTube for a service, shared by every open screen. Reached only through
-- the functions below.
create table public.service_youtube_checks (
  event_id uuid primary key references public.events (id) on delete cascade,
  video_id text,
  live boolean not null default false,
  last_search_at timestamptz,
  checked_at timestamptz
);
alter table public.service_youtube_checks enable row level security;

create function public.service_youtube_state(p_event_id uuid, p_screen_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_check public.service_youtube_checks;
begin
  if not private.can_use_stream_data(p_screen_token) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_check from public.service_youtube_checks c where c.event_id = p_event_id;
  return jsonb_build_object(
    'channel', (select o.youtube_channel_id from public.organizations o
                order by o.created_at limit 1),
    'videoId', v_check.video_id,
    'live', coalesce(v_check.live, false),
    'lastSearchAt', v_check.last_search_at,
    'checkedAt', v_check.checked_at
  );
end;
$$;
revoke all on function public.service_youtube_state(uuid, text) from public;
grant execute on function public.service_youtube_state(uuid, text) to anon, authenticated;

create function public.save_youtube_check(
  p_event_id uuid, p_video_id text, p_live boolean, p_searched boolean, p_screen_token text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_use_stream_data(p_screen_token) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.service_youtube_checks (event_id, video_id, live, last_search_at, checked_at)
  values (p_event_id, p_video_id, p_live, case when p_searched then now() end, now())
  on conflict (event_id) do update
    set video_id = excluded.video_id,
        live = excluded.live,
        last_search_at = coalesce(excluded.last_search_at, public.service_youtube_checks.last_search_at),
        checked_at = now();
end;
$$;
revoke all on function public.save_youtube_check(uuid, text, boolean, boolean, text) from public;
grant execute on function public.save_youtube_check(uuid, text, boolean, boolean, text) to anon, authenticated;
