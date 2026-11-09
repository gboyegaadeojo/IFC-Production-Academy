-- Files on a service, and a calendar link that stays up to date (G, 2026-11-09; plan "Academy
-- scheduling", PR 10).
--
-- * Service files: stage plots, run sheets, and the like, in the private service-files bucket
--   under the service's id. Schedulers add and remove them while the Academy schedules. People
--   asked to serve that day, and schedulers, open them through short signed links.
-- * Calendar feed: each person can make a private link that Google, Apple, or Outlook Calendar
--   reads, listing where they're serving. Only a hash of the link is kept. Making a new link stops
--   the old one. Calendar apps can't sign in, so calendar_feed() is open to anyone holding a
--   valid link, and returns only that person's own serving: titles, times, places, and roles.

-- ---------------------------------------------------------------------------
-- Service files
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-files', 'service-files', false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table public.service_files (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  path text not null unique,
  name text not null check (length(name) between 1 and 200),
  mime_type text not null,
  bytes integer not null check (bytes between 1 and 10485760),
  uploaded_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index service_files_event_idx on public.service_files (event_id, created_at);

-- Schedulers, and anyone asked to serve at that service.
create function private.can_open_service_files(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability_anywhere('schedule.manage') or exists (
    select 1 from public.event_assignments a
    where a.event_id = p_event_id and a.user_id = (select auth.uid())
      and a.status in ('pending', 'confirmed') and a.request_sent_at is not null
  );
$$;
revoke all on function private.can_open_service_files(uuid) from public, anon;
grant execute on function private.can_open_service_files(uuid) to authenticated;

alter table public.service_files enable row level security;
create policy "Schedulers and those serving see a service's files"
  on public.service_files for select to authenticated
  using (private.can_open_service_files(event_id));
grant select on public.service_files to authenticated;

-- The first part of each path is the service it belongs to.
create function private.service_file_event(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid end;
$$;

create policy "Service files: schedulers upload while the Academy schedules"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'service-files'
    and private.has_capability_anywhere('schedule.manage')
    and exists (select 1 from public.organizations o
                where o.id = private.current_organization_id() and o.scheduling_source = 'academy'));
create policy "Service files: open for schedulers and those serving"
  on storage.objects for select to authenticated
  using (bucket_id = 'service-files'
    and private.can_open_service_files(private.service_file_event(name)));
create policy "Service files: schedulers remove them"
  on storage.objects for delete to authenticated
  using (bucket_id = 'service-files' and private.has_capability_anywhere('schedule.manage'));

-- Records an uploaded file on its service.
create function public.add_service_file(
  p_event_id uuid, p_path text, p_name text, p_mime_type text, p_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.plannable_event(p_event_id);
  if private.service_file_event(p_path) is distinct from p_event_id
     or not exists (select 1 from storage.objects o where o.bucket_id = 'service-files' and o.name = p_path) then
    raise exception 'invalid_file' using errcode = '22023';
  end if;
  insert into public.service_files (event_id, path, name, mime_type, bytes)
  values (p_event_id, p_path, left(trim(p_name), 200), p_mime_type, p_bytes)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_service_file(uuid, text, text, text, integer) from public, anon;
grant execute on function public.add_service_file(uuid, text, text, text, integer) to authenticated;

-- Takes a file off its service; returns its path so the app removes the stored file too.
create function public.remove_service_file(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.service_files;
begin
  select * into v_file from public.service_files f where f.id = p_id;
  if v_file.id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.plannable_event(v_file.event_id);
  delete from public.service_files f where f.id = p_id;
  return v_file.path;
end;
$$;
revoke all on function public.remove_service_file(uuid) from public, anon;
grant execute on function public.remove_service_file(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Calendar feed
-- ---------------------------------------------------------------------------

create table public.calendar_feeds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now()
);
-- Read only through the functions below.
alter table public.calendar_feeds enable row level security;

create function private.feed_hash(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

-- A new private link; any old one stops working. Returns the token, shown once.
create function public.reset_my_calendar_feed()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.calendar_feeds (user_id, token_hash, created_at)
  values ((select auth.uid()), private.feed_hash(v_token), now())
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now();
  return v_token;
end;
$$;
revoke all on function public.reset_my_calendar_feed() from public, anon;
grant execute on function public.reset_my_calendar_feed() to authenticated;

create function public.stop_my_calendar_feed()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.calendar_feeds f where f.user_id = (select auth.uid());
$$;
revoke all on function public.stop_my_calendar_feed() from public, anon;
grant execute on function public.stop_my_calendar_feed() to authenticated;

create function public.my_calendar_feed_since()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select f.created_at from public.calendar_feeds f where f.user_id = (select auth.uid());
$$;
revoke all on function public.my_calendar_feed_since() from public, anon;
grant execute on function public.my_calendar_feed_since() to authenticated;

-- What a calendar app reads with a link: that person's serving from the last month on.
create function public.calendar_feed(p_token text)
returns table (
  assignment_id uuid, role_name text, department_name text, title text, location text,
  starts_at timestamptz, ends_at timestamptz, confirmed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, r.name, d.name, e.title, e.location, e.starts_at, e.ends_at, a.status = 'confirmed'
  from public.calendar_feeds f
  join public.profiles p on p.id = f.user_id and p.status = 'active'
  join public.event_assignments a on a.user_id = f.user_id
    and a.status in ('pending', 'confirmed') and a.request_sent_at is not null
  join public.events e on e.id = a.event_id and e.cancelled_at is null
    and e.ends_at > now() - interval '31 days'
  join public.serving_roles r on r.id = a.role_id
  join public.departments d on d.id = a.department_id
  where p_token ~ '^[0-9a-f]{48}$' and f.token_hash = private.feed_hash(p_token)
  order by e.starts_at
  limit 500;
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
