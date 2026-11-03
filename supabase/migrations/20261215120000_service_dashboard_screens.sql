-- Service Dashboard, stage 3 (docs/decisions/2026-11-02-service-dashboard.md, ADD-DASH-06, 07):
--
-- * The wall TV connects by a 6-digit code and holds a view-only pass, not anyone's account. The
--   pass is a long random token, stored only as a hash. These functions are the only way in, and
--   they return only what the dashboard shows. The service-role key isn't involved.
-- * YouTube viewers. The stream is public, so the Academy needs only the channel and an API key
--   (a Cloudflare secret). Whichever screen is open during a service keeps the numbers current.

alter table public.organizations
  add column youtube_channel_id text check (youtube_channel_id ~ '^UC[A-Za-z0-9_-]{22}$');

-- ---------------------------------------------------------------------------
-- Screens
-- ---------------------------------------------------------------------------

create table public.display_screens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  token_hash bytea unique,
  added_by uuid references public.profiles (id),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.display_pairings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  secret_hash bytea not null unique,
  screen_id uuid references public.display_screens (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Reached only through the functions below, so neither table has policies or grants.
alter table public.display_screens enable row level security;
alter table public.display_pairings enable row level security;

create function private.screen_hash(p_value text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(p_value, 'UTF8'), 'sha256');
$$;
revoke all on function private.screen_hash(text) from public, anon, authenticated;

create function private.screen_for_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.display_screens s
  where p_token is not null
    and s.token_hash = private.screen_hash(p_token)
    and s.revoked_at is null;
$$;
revoke all on function private.screen_for_token(text) from public, anon, authenticated;

-- A TV showing a code. Open to anyone, since the TV has no account, so it's capped: a code does
-- nothing until a signed-in editor enters it.
create function public.screen_start_pairing()
returns table (code text, secret text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_secret text := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires timestamptz := now() + interval '15 minutes';
  v_attempt integer := 0;
begin
  delete from public.display_pairings p where p.expires_at < now();
  if (select count(*) from public.display_pairings) >= 20 then
    raise exception 'too_many_pairings' using errcode = 'P0001';
  end if;
  loop
    v_attempt := v_attempt + 1;
    v_code := lpad(
      (('x' || encode(extensions.gen_random_bytes(3), 'hex'))::bit(24)::integer % 1000000)::text,
      6, '0');
    begin
      insert into public.display_pairings (code, secret_hash, expires_at)
      values (v_code, private.screen_hash(v_secret), v_expires);
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;
  return query select v_code, v_secret, v_expires;
end;
$$;
revoke all on function public.screen_start_pairing() from public;
grant execute on function public.screen_start_pairing() to anon, authenticated;

-- The TV asking whether its code has been approved. Hands over the pass exactly once.
create function public.screen_claim(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pairing public.display_pairings;
  v_token text;
begin
  select * into v_pairing
  from public.display_pairings p
  where p.secret_hash = private.screen_hash(coalesce(p_secret, ''))
    and p.expires_at >= now();
  if v_pairing.id is null then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_pairing.screen_id is null then
    return jsonb_build_object('status', 'waiting');
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  update public.display_screens s
     set token_hash = private.screen_hash(v_token), last_seen_at = now()
   where s.id = v_pairing.screen_id;
  delete from public.display_pairings p where p.id = v_pairing.id;
  return jsonb_build_object('status', 'approved', 'token', v_token);
end;
$$;
revoke all on function public.screen_claim(text) from public;
grant execute on function public.screen_claim(text) to anon, authenticated;

create function private.can_manage_screens()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user()
    and (private.has_capability('dashboard.edit') or private.has_capability('dashboard.manage'));
$$;
revoke all on function private.can_manage_screens() from public, anon, authenticated;

create function public.approve_screen(p_code text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pairing public.display_pairings;
  v_screen_id uuid;
begin
  if not private.can_manage_screens() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_pairing
  from public.display_pairings p
  where p.code = regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g')
    and p.expires_at >= now()
    and p.screen_id is null;
  if v_pairing.id is null then
    raise exception 'screen_code_not_found' using errcode = 'P0001';
  end if;
  insert into public.display_screens (name, added_by)
  values (trim(p_name), (select auth.uid()))
  returning id into v_screen_id;
  update public.display_pairings p set screen_id = v_screen_id where p.id = v_pairing.id;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (private.current_organization_id(), (select auth.uid()), 'service_dashboard.screen_added',
          'display_screens', v_screen_id, '{}'::jsonb);
  return v_screen_id;
end;
$$;
revoke all on function public.approve_screen(text, text) from public, anon;
grant execute on function public.approve_screen(text, text) to authenticated;

create function public.remove_screen(p_screen_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_screens() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.display_screens s
     set revoked_at = now(), revoked_by = (select auth.uid()), token_hash = null
   where s.id = p_screen_id and s.revoked_at is null;
  if found then
    insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
    values (private.current_organization_id(), (select auth.uid()), 'service_dashboard.screen_removed',
            'display_screens', p_screen_id, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.remove_screen(uuid) from public, anon;
grant execute on function public.remove_screen(uuid) to authenticated;

create function public.service_dashboard_screens()
returns table (id uuid, name text, last_seen_at timestamptz, added_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_screens() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select s.id, s.name, s.last_seen_at, p.display_name
    from public.display_screens s
    left join public.profiles p on p.id = s.added_by
    where s.revoked_at is null
    order by s.created_at;
end;
$$;
revoke all on function public.service_dashboard_screens() from public, anon;
grant execute on function public.service_dashboard_screens() to authenticated;

-- Everything a screen shows, read only. Null if the pass isn't valid. Checklists are totals only:
-- a TV has nobody to tick them, and nobody's name needs to be on the wall beside each task.
create function public.screen_dashboard(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_screen_id uuid := private.screen_for_token(p_token);
  v_event public.events;
  v_set uuid;
begin
  if v_screen_id is null then
    return null;
  end if;
  update public.display_screens s
     set last_seen_at = now()
   where s.id = v_screen_id
     and (s.last_seen_at is null or s.last_seen_at < now() - interval '5 minutes');

  select * into v_event from public.events e where e.id = private.church_current_service();
  if v_event.id is not null then
    v_set := private.service_checklist_set(v_event.id);
  end if;

  return jsonb_build_object(
    'layout', (select jsonb_build_object('name', l.name, 'items', l.items, 'channels', l.channels)
               from public.dashboard_layouts l limit 1),
    'channel', (select o.youtube_channel_id from public.organizations o
                order by o.created_at limit 1),
    'service', case when v_event.id is null then null else jsonb_build_object(
      'id', v_event.id, 'title', v_event.title,
      'startsAt', v_event.starts_at, 'endsAt', v_event.ends_at) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'itemType', i.item_type, 'title', i.title,
        'lengthSeconds', i.length_seconds, 'servicePosition', i.service_position,
        'notes', i.notes) order by i.position)
      from public.service_plan_items i where i.event_id = v_event.id), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'positionId', t.position_id, 'roleName', t.role_name,
        'name', t.display_name, 'readiness', t.readiness))
      from (
        select p.id as position_id, r.name as role_name, pr.display_name, a.readiness
        from public.event_positions p
        join public.serving_roles r on r.id = p.role_id
        join public.departments d on d.id = p.department_id
        left join public.event_assignments a
          on a.position_id = p.id and a.status in ('pending', 'confirmed')
        left join public.profiles pr on pr.id = a.user_id
        where p.event_id = v_event.id
        order by d.sort_order, p.sort_order
      ) t), '[]'::jsonb),
    'note', coalesce((select n.body from public.service_notes n where n.event_id = v_event.id), ''),
    'checklists', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'done', c.done, 'total', c.total))
      from (
        select c.name, c.sort_order,
               count(i.id)::int as total,
               count(k.item_id)::int as done
        from public.checklists c
        join public.checklist_sections s on s.checklist_id = c.id and s.archived_at is null
        join public.checklist_items i on i.section_id = s.id and i.archived_at is null
        left join public.checklist_checkoffs k
          on k.item_id = i.id and k.event_id = v_event.id
         and k.unchecked_at is null and k.reset_id is null
        where c.archived_at is null and c.set_id = v_set
        group by c.id, c.name, c.sort_order
        order by c.sort_order, c.name
      ) c), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.screen_dashboard(text) from public;
grant execute on function public.screen_dashboard(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

create function public.service_dashboard_connections()
returns table (youtube_channel_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_active_user() and private.has_capability('dashboard.manage')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select o.youtube_channel_id from public.organizations o
    where o.id = private.current_organization_id();
end;
$$;
revoke all on function public.service_dashboard_connections() from public, anon;
grant execute on function public.service_dashboard_connections() to authenticated;

-- organizations' audit trigger logs the change.
create function public.set_youtube_channel(p_channel_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_active_user() and private.has_capability('dashboard.manage')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.organizations o
     set youtube_channel_id = nullif(trim(p_channel_id), '')
   where o.id = private.current_organization_id();
end;
$$;
revoke all on function public.set_youtube_channel(text) from public, anon;
grant execute on function public.set_youtube_channel(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Viewers
-- ---------------------------------------------------------------------------

create table public.service_streams (
  event_id uuid not null references public.events (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'facebook')),
  external_id text,
  last_search_at timestamptz,
  primary key (event_id, platform)
);

create table public.service_viewer_samples (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'facebook')),
  viewers integer not null check (viewers >= 0),
  sampled_at timestamptz not null default now()
);
create index service_viewer_samples_event_idx
  on public.service_viewer_samples (event_id, platform, sampled_at);

-- Reached only through the functions below.
alter table public.service_streams enable row level security;
alter table public.service_viewer_samples enable row level security;

create function private.can_use_stream_data(p_screen_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.screen_for_token(p_screen_token) is not null
      or private.can_view_service_dashboard();
$$;
revoke all on function private.can_use_stream_data(text) from public, anon, authenticated;

create function public.service_stream_state(p_event_id uuid, p_platform text, p_screen_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_use_stream_data(p_screen_token) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'channel', (select o.youtube_channel_id from public.organizations o
                order by o.created_at limit 1),
    'externalId', (select s.external_id from public.service_streams s
                   where s.event_id = p_event_id and s.platform = p_platform),
    'lastSearchAt', (select s.last_search_at from public.service_streams s
                     where s.event_id = p_event_id and s.platform = p_platform),
    'samples', coalesce((
      select jsonb_agg(jsonb_build_object('at', x.sampled_at, 'viewers', x.viewers) order by x.sampled_at)
      from (
        select v.sampled_at, v.viewers
        from public.service_viewer_samples v
        where v.event_id = p_event_id and v.platform = p_platform
        order by v.sampled_at desc
        limit 120
      ) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.service_stream_state(uuid, text, text) from public;
grant execute on function public.service_stream_state(uuid, text, text) to anon, authenticated;

create function public.save_stream_search(
  p_event_id uuid, p_platform text, p_external_id text, p_screen_token text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_use_stream_data(p_screen_token) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.service_streams (event_id, platform, external_id, last_search_at)
  values (p_event_id, p_platform, p_external_id, now())
  on conflict (event_id, platform) do update
    set external_id = coalesce(excluded.external_id, public.service_streams.external_id),
        last_search_at = now();
end;
$$;
revoke all on function public.save_stream_search(uuid, text, text, text) from public;
grant execute on function public.save_stream_search(uuid, text, text, text) to anon, authenticated;

-- Several screens may be open at once, so a reading within 20 seconds of the last is ignored.
create function public.save_viewer_sample(
  p_event_id uuid, p_platform text, p_viewers integer, p_screen_token text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_use_stream_data(p_screen_token) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.service_viewer_samples v
    where v.event_id = p_event_id and v.platform = p_platform
      and v.sampled_at > now() - interval '20 seconds'
  ) then
    return;
  end if;
  insert into public.service_viewer_samples (event_id, platform, viewers)
  values (p_event_id, p_platform, p_viewers);
end;
$$;
revoke all on function public.save_viewer_sample(uuid, text, integer, text) from public;
grant execute on function public.save_viewer_sample(uuid, text, integer, text) to anon, authenticated;
