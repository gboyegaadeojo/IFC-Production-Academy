-- The Service Dashboard keeps the YouTube live stream and drops viewer counts, on YouTube and
-- Facebook (G, 2026-11-03; ADD-DASH-07, ADD-DASH-10). Nothing was ever recorded: no API key was set.
-- The channel stays on organizations, and the wall TV still reads it through screen_dashboard.

drop function public.service_viewer_history(uuid);
drop function public.save_viewer_sample(uuid, text, integer, text);
drop function public.save_stream_search(uuid, text, text, text);
drop function public.service_stream_state(uuid, text, text);
drop function private.can_use_stream_data(text);
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
