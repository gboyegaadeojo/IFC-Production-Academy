-- Service Dashboard, stage 1 (docs/decisions/2026-11-02-service-dashboard.md, ADD-DASH-01 to 03):
--
-- * One saved layout for the whole church. No row means nobody has saved one yet, so the app shows
--   the default.
-- * Up to 3 people hold the Service Dashboard Editor role and can change it. The limit is enforced
--   on user_roles, so no screen can get around it.
-- * Who can view follows Planning Center teams, as the Checklist does. Training is never a gate.

insert into public.capabilities (key, description) values
  ('dashboard.edit', 'Change the Service Dashboard layout'),
  ('dashboard.manage', 'Choose who can edit the Service Dashboard')
on conflict (key) do nothing;

insert into public.roles (organization_id, key, name, description, department_scoped)
select o.id, 'dashboard_editor', 'Service Dashboard Editor',
       'Changes the Service Dashboard layout. Up to 3 people.', false
from public.organizations o
on conflict do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where (r.key = 'dashboard_editor' and c.key = 'dashboard.edit')
   or (r.key in ('platform_admin', 'production_director') and c.key = 'dashboard.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Up to 3 editors
-- ---------------------------------------------------------------------------

create function private.enforce_dashboard_editor_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked_at is not null
     or not exists (
       select 1 from public.roles r where r.id = new.role_id and r.key = 'dashboard_editor'
     ) then
    return new;
  end if;
  -- One at a time, so two people adding the third editor can't both pass the count.
  perform pg_advisory_xact_lock(hashtext('dashboard_editor_limit'));
  if (
    select count(*)
    from public.user_roles u
    where u.role_id = new.role_id and u.revoked_at is null and u.id <> new.id
  ) >= 3 then
    raise exception 'dashboard_editor_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_dashboard_editor_limit() from public, anon, authenticated;

create trigger user_roles_dashboard_editor_limit
  before insert or update of revoked_at, role_id on public.user_roles
  for each row execute function private.enforce_dashboard_editor_limit();

-- ---------------------------------------------------------------------------
-- Who can view
-- ---------------------------------------------------------------------------

create function private.can_view_service_dashboard()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    private.is_team_member()
    or private.has_capability_anywhere('checklist.manage')
    or private.has_capability_anywhere('schedule.manage')
    or private.has_capability('dashboard.edit')
    or private.has_capability('dashboard.manage')
  );
$$;
revoke all on function private.can_view_service_dashboard() from public, anon;
-- The layout's read policy runs as the person reading.
grant execute on function private.can_view_service_dashboard() to authenticated;

create function public.can_view_service_dashboard()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_service_dashboard();
$$;
revoke all on function public.can_view_service_dashboard() from public, anon;
grant execute on function public.can_view_service_dashboard() to authenticated;

-- ---------------------------------------------------------------------------
-- The layout
-- ---------------------------------------------------------------------------

create table public.dashboard_layouts (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 60),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30),
  -- Which mixer channels the levels tile shows, in order.
  channels jsonb not null default '[]'::jsonb
    check (jsonb_typeof(channels) = 'array' and jsonb_array_length(channels) <= 100),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_layouts enable row level security;

create policy "Service Dashboard viewers read the layout"
  on public.dashboard_layouts for select to authenticated
  using (private.can_view_service_dashboard());

grant select on public.dashboard_layouts to authenticated;

-- Changed only through this function, so every save is checked and logged.
create function public.save_dashboard_layout(p_name text, p_items jsonb, p_channels jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
begin
  if not (private.is_active_user() and private.has_capability('dashboard.edit')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.dashboard_layouts as l (organization_id, name, items, channels, updated_by)
  values (v_organization_id, p_name, p_items, p_channels, (select auth.uid()))
  on conflict (organization_id) do update
    set name = excluded.name,
        items = excluded.items,
        channels = excluded.channels,
        updated_by = excluded.updated_by,
        updated_at = now();
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (v_organization_id, (select auth.uid()), 'service_dashboard.layout_saved',
          'dashboard_layouts', v_organization_id,
          jsonb_build_object('tiles', jsonb_array_length(p_items)));
end;
$$;
revoke all on function public.save_dashboard_layout(text, jsonb, jsonb) from public, anon;
grant execute on function public.save_dashboard_layout(text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Choosing editors
-- ---------------------------------------------------------------------------

create function public.service_dashboard_people()
returns table (user_id uuid, display_name text, is_editor boolean)
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
    select p.id, p.display_name, exists (
      select 1
      from public.user_roles u
      join public.roles r on r.id = u.role_id
      where u.user_id = p.id and r.key = 'dashboard_editor' and u.revoked_at is null
    )
    from public.profiles p
    where p.status = 'active'
    order by p.display_name;
end;
$$;
revoke all on function public.service_dashboard_people() from public, anon;
grant execute on function public.service_dashboard_people() to authenticated;

-- user_roles' own audit trigger logs each change. Setting the same value twice is harmless.
create function public.set_dashboard_editor(p_user_id uuid, p_is_editor boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
begin
  if not (private.is_active_user() and private.has_capability('dashboard.manage')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select r.id into v_role_id from public.roles r where r.key = 'dashboard_editor';
  if p_is_editor then
    if not exists (select 1 from public.profiles p where p.id = p_user_id and p.status = 'active') then
      raise exception 'person_not_found' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.user_roles u
      where u.user_id = p_user_id and u.role_id = v_role_id and u.revoked_at is null
    ) then
      insert into public.user_roles (user_id, role_id, granted_by)
      values (p_user_id, v_role_id, (select auth.uid()));
    end if;
  else
    update public.user_roles u
       set revoked_at = now(), revoked_by = (select auth.uid())
     where u.user_id = p_user_id and u.role_id = v_role_id and u.revoked_at is null;
  end if;
end;
$$;
revoke all on function public.set_dashboard_editor(uuid, boolean) from public, anon;
grant execute on function public.set_dashboard_editor(uuid, boolean) to authenticated;
