-- Foundation schema: organizations, profiles, departments, membership, RBAC, audit.
-- SPEC §4 and §5. SRS-RBAC-001..005, SRS-MEM-001..005, SRS-AUTH-004, SRS-AUTH-007, SRS-AUDIT-001, SRS-CUR-009.
--
-- Rules this file enforces:
--   * Every table has RLS enabled and nothing is readable or writable without a policy (SRS-RBAC-004).
--   * anon gets no table access at all. authenticated gets only the grants listed at the end.
--   * Permissions are named capabilities granted through roles, optionally scoped to a department.
--   * Membership changes and sensitive admin changes are recorded, never deleted (SRS-MEM-004).

-- ---------------------------------------------------------------------------
-- Schemas and types
-- ---------------------------------------------------------------------------

-- Helpers used by policies live in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public;

create type public.account_status as enum ('active', 'suspended', 'deactivated');
create type public.department_status as enum ('active', 'coming_soon', 'inactive');
create type public.enrolment_mode as enum ('request', 'invite_only');
create type public.membership_status as enum ('requested', 'active', 'declined', 'removed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (length(trim(name)) > 0),
  time_zone text not null default 'America/Winnipeg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  -- Restrict, not cascade: deleting a login must never erase training history (SRS-AUTH-004).
  -- Deactivate the profile instead.
  id uuid primary key references auth.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  avatar_url text,
  status public.account_status not null default 'active',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_organization_id_idx on public.profiles (organization_id);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (length(trim(name)) > 0),
  summary text not null default '',
  status public.department_status not null default 'inactive',
  enrolment_mode public.enrolment_mode not null default 'request',
  -- Design-token keys, e.g. hue 'blue' maps to the CSS variable --dept-blue (SPEC §7).
  hue text not null check (hue ~ '^[a-z][a-z0-9-]*$'),
  icon text not null check (icon ~ '^[a-z][a-z0-9-]*$'),
  cover_image_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create index departments_organization_id_idx on public.departments (organization_id, sort_order);

create table public.department_memberships (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  status public.membership_status not null default 'requested',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_memberships_decision_recorded
    check (status = 'requested' or decided_at is not null)
);
-- No duplicate open memberships (SPEC §5 "Integrity"). Declined or removed rows stay as history.
create unique index department_memberships_one_open_idx
  on public.department_memberships (department_id, user_id)
  where status in ('requested', 'active');
create index department_memberships_user_id_idx on public.department_memberships (user_id);

-- Every status change, with actor and time (SRS-MEM-003).
create table public.department_membership_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.department_memberships (id) on delete restrict,
  department_id uuid not null references public.departments (id),
  user_id uuid not null references public.profiles (id),
  from_status public.membership_status,
  to_status public.membership_status not null,
  actor_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);
create index department_membership_events_membership_idx
  on public.department_membership_events (membership_id, created_at);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  -- true: every grant names a department. false: grants apply across the organization.
  department_scoped boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.capabilities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.role_capabilities (
  role_id uuid not null references public.roles (id) on delete cascade,
  capability_id uuid not null references public.capabilities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, capability_id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  role_id uuid not null references public.roles (id),
  department_id uuid references public.departments (id),
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  -- Revoke by setting these. Rows are never deleted, so role history survives.
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index user_roles_one_active_idx
  on public.user_roles (user_id, role_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index user_roles_user_id_idx on public.user_roles (user_id) where revoked_at is null;

-- Append-only (SRS-AUDIT-001). actor_id has no foreign key so events outlive anything they mention.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id),
  actor_id uuid,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_table text not null,
  target_id uuid,
  department_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_created_at_idx on public.audit_events (created_at desc);
create index audit_events_target_idx on public.audit_events (target_table, target_id);

-- ---------------------------------------------------------------------------
-- Row-level security: on for every table, deny by default
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.department_memberships enable row level security;
alter table public.department_membership_events enable row level security;
alter table public.roles enable row level security;
alter table public.capabilities enable row level security;
alter table public.role_capabilities enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_events enable row level security;

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so policies can call them without recursion)
-- ---------------------------------------------------------------------------

create function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

create function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id from public.profiles p where p.id = (select auth.uid());
$$;

-- True when the signed-in, active user holds the capability through any unrevoked role.
-- With p_department_id null, only organization-wide grants count.
-- With a department, organization-wide grants and grants for that department count.
create function private.has_capability(p_capability text, p_department_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    join public.capabilities c on c.id = rc.capability_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and p.status = 'active'
      and c.key = p_capability
      and (ur.department_id is null or ur.department_id = p_department_id)
  );
$$;

-- Who may see a profile: the person, account and role managers, and leaders of a
-- department the person has asked to join or belongs to.
create function private.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_profile_id = (select auth.uid())
    or private.has_capability('user.manage')
    or private.has_capability('role.assign')
    or exists (
      select 1 from public.department_memberships m
      where m.user_id = p_profile_id
        and private.has_capability('member.approve', m.department_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy "Active users read their organization"
  on public.organizations for select to authenticated
  using (private.is_active_user() and id = private.current_organization_id());

create policy "People read profiles they are allowed to see"
  on public.profiles for select to authenticated
  using (private.can_view_profile(id));

-- Column grants below limit this to display_name and avatar_url.
create policy "People update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Active users browse open departments"
  on public.departments for select to authenticated
  using (
    private.is_active_user()
    and organization_id = private.current_organization_id()
    and (status in ('active', 'coming_soon') or private.has_capability('department.manage'))
  );

create policy "Department managers create departments"
  on public.departments for insert to authenticated
  with check (
    private.has_capability('department.manage')
    and organization_id = private.current_organization_id()
  );

create policy "Department managers update departments"
  on public.departments for update to authenticated
  using (private.has_capability('department.manage') and organization_id = private.current_organization_id())
  with check (private.has_capability('department.manage') and organization_id = private.current_organization_id());

-- Writes go through request_membership() and decide_membership() only.
create policy "Members and approvers read memberships"
  on public.department_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_capability('member.approve', department_id)
  );

create policy "Members and approvers read membership history"
  on public.department_membership_events for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_capability('member.approve', department_id)
  );

create policy "Active users read roles"
  on public.roles for select to authenticated
  using (private.is_active_user() and organization_id = private.current_organization_id());

create policy "Active users read capabilities"
  on public.capabilities for select to authenticated
  using (private.is_active_user());

create policy "Active users read role capabilities"
  on public.role_capabilities for select to authenticated
  using (private.is_active_user());

create policy "People read their own roles; role managers read all"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.has_capability('role.assign'));

create policy "Role managers grant roles"
  on public.user_roles for insert to authenticated
  with check (private.has_capability('role.assign'));

create policy "Role managers revoke roles"
  on public.user_roles for update to authenticated
  using (private.has_capability('role.assign'))
  with check (private.has_capability('role.assign'));

create policy "Auditors read the audit log"
  on public.audit_events for select to authenticated
  using (private.has_capability('audit.view') and organization_id = private.current_organization_id());

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger departments_set_updated_at before update on public.departments
  for each row execute function private.set_updated_at();
create trigger department_memberships_set_updated_at before update on public.department_memberships
  for each row execute function private.set_updated_at();
create trigger roles_set_updated_at before update on public.roles
  for each row execute function private.set_updated_at();
create trigger user_roles_set_updated_at before update on public.user_roles
  for each row execute function private.set_updated_at();

-- Generic audit writer. TG_ARGV[0] is the entity name used in the action, e.g. 'department'.
-- Records which columns changed, and old and new status values, but never other row contents.
create function private.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed jsonb := '[]'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_department_id uuid;
  v_organization_id uuid;
  v_target_id uuid;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(n.key order by n.key), '[]'::jsonb)
      into v_changed
      from jsonb_each(v_new) n
     where n.value is distinct from (v_old -> n.key)
       and n.key <> 'updated_at';
    if jsonb_array_length(v_changed) = 0 then
      return null;
    end if;
    v_metadata := jsonb_build_object('changed', v_changed);
    if v_changed ? 'status' then
      v_metadata := v_metadata || jsonb_build_object(
        'status', jsonb_build_object('from', v_old -> 'status', 'to', v_new -> 'status'));
    end if;
    if v_changed ? 'revoked_at' then
      v_metadata := v_metadata || jsonb_build_object('revoked', v_new -> 'revoked_at' <> 'null'::jsonb);
    end if;
  elsif v_row ? 'status' then
    v_metadata := jsonb_build_object('status', v_row -> 'status');
  end if;

  if tg_table_name = 'departments' then
    v_department_id := (v_row ->> 'id')::uuid;
  elsif v_row ? 'department_id' then
    v_department_id := (v_row ->> 'department_id')::uuid;
  end if;

  if v_row ? 'role_id' and v_row ? 'capability_id' then
    -- role_capabilities has a composite key; keep both ids in metadata.
    v_metadata := v_metadata || jsonb_build_object(
      'role_id', v_row -> 'role_id', 'capability_id', v_row -> 'capability_id');
  elsif v_row ? 'role_id' then
    v_metadata := v_metadata || jsonb_build_object('role_id', v_row -> 'role_id');
  end if;
  if v_row ? 'id' then
    v_target_id := (v_row ->> 'id')::uuid;
  end if;

  v_organization_id := coalesce(
    (v_row ->> 'organization_id')::uuid,
    (select d.organization_id from public.departments d where d.id = v_department_id),
    (select p.organization_id from public.profiles p where p.id = (v_row ->> 'user_id')::uuid),
    private.current_organization_id()
  );

  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, department_id, metadata)
  values (
    v_organization_id,
    (select auth.uid()),
    tg_argv[0] || '.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    tg_table_name,
    v_target_id,
    v_department_id,
    v_metadata
  );
  return null;
end;
$$;

create trigger organizations_audit after insert or update on public.organizations
  for each row execute function private.audit_change('organization');
create trigger profiles_audit after insert or update on public.profiles
  for each row execute function private.audit_change('profile');
create trigger departments_audit after insert or update or delete on public.departments
  for each row execute function private.audit_change('department');
create trigger department_memberships_audit after insert or update on public.department_memberships
  for each row execute function private.audit_change('department_membership');
create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function private.audit_change('role');
create trigger capabilities_audit after insert or update or delete on public.capabilities
  for each row execute function private.audit_change('capability');
create trigger role_capabilities_audit after insert or delete on public.role_capabilities
  for each row execute function private.audit_change('role_capability');
create trigger user_roles_audit after insert or update on public.user_roles
  for each row execute function private.audit_change('user_role');

create function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end;
$$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function private.prevent_audit_mutation();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function private.prevent_audit_mutation();

-- Membership history: one event per status change.
create function private.record_membership_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.department_membership_events
      (membership_id, department_id, user_id, from_status, to_status, actor_id, reason)
    values (
      new.id,
      new.department_id,
      new.user_id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      (select auth.uid()),
      case when tg_op = 'INSERT' then null else new.decision_reason end
    );
  end if;
  return null;
end;
$$;

create trigger department_memberships_history after insert or update on public.department_memberships
  for each row execute function private.record_membership_event();

-- user_roles: actor columns come from the session, scope matches the role, identity columns are fixed.
create function private.guard_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_scoped boolean;
begin
  select r.department_scoped into v_department_scoped from public.roles r where r.id = new.role_id;
  if v_department_scoped and new.department_id is null then
    raise exception 'role_requires_department' using errcode = '23514';
  elsif not v_department_scoped and new.department_id is not null then
    raise exception 'role_is_organization_wide' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.granted_by := coalesce((select auth.uid()), new.granted_by);
    new.granted_at := now();
    new.revoked_at := null;
    new.revoked_by := null;
  else
    if new.user_id <> old.user_id or new.role_id <> old.role_id
       or new.department_id is distinct from old.department_id
       or new.granted_by is distinct from old.granted_by
       or new.granted_at <> old.granted_at then
      raise exception 'user_role_identity_is_fixed' using errcode = '42501';
    end if;
    if old.revoked_at is not null then
      raise exception 'user_role_already_revoked' using errcode = '42501';
    end if;
    if new.revoked_at is not null then
      new.revoked_at := now();
      new.revoked_by := coalesce((select auth.uid()), new.revoked_by);
    end if;
  end if;
  return new;
end;
$$;

create trigger user_roles_guard before insert or update on public.user_roles
  for each row execute function private.guard_user_role();

-- New sign-ins get a profile in the organization and the baseline Volunteer role.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_volunteer_role_id uuid;
  v_name text;
begin
  select o.id into v_organization_id from public.organizations o order by o.created_at, o.id limit 1;
  if v_organization_id is null then
    raise exception 'No organization is configured';
  end if;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'New volunteer'
  );

  insert into public.profiles (id, organization_id, display_name)
  values (new.id, v_organization_id, left(v_name, 120));

  select r.id into v_volunteer_role_id
    from public.roles r
   where r.organization_id = v_organization_id and r.key = 'volunteer';
  if v_volunteer_role_id is not null then
    insert into public.user_roles (user_id, role_id) values (new.id, v_volunteer_role_id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs called by the app
-- ---------------------------------------------------------------------------

-- SRS-MEM-001. Idempotent: asking again returns the open request or membership.
create function public.request_membership(p_department_id uuid)
returns public.department_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_department public.departments;
  v_membership public.department_memberships;
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_department
    from public.departments d
   where d.id = p_department_id and d.organization_id = private.current_organization_id();
  if not found or v_department.status = 'inactive' then
    raise exception 'department_not_found' using errcode = 'P0002';
  end if;
  if v_department.status <> 'active' then
    raise exception 'department_not_open' using errcode = 'P0001';
  end if;
  if v_department.enrolment_mode <> 'request' then
    raise exception 'department_invite_only' using errcode = 'P0001';
  end if;

  select * into v_membership
    from public.department_memberships m
   where m.department_id = p_department_id
     and m.user_id = v_user_id
     and m.status in ('requested', 'active');
  if found then
    return v_membership;
  end if;

  begin
    insert into public.department_memberships (department_id, user_id, status)
    values (p_department_id, v_user_id, 'requested')
    returning * into v_membership;
  exception when unique_violation then
    -- A concurrent retry won the race; return its row.
    select * into v_membership
      from public.department_memberships m
     where m.department_id = p_department_id
       and m.user_id = v_user_id
       and m.status in ('requested', 'active');
  end;
  return v_membership;
end;
$$;

-- SRS-MEM-003. Approve or decline a request, or remove a member. Records actor, time, and reason.
create function public.decide_membership(
  p_membership_id uuid,
  p_decision public.membership_status,
  p_reason text default null
)
returns public.department_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_membership public.department_memberships;
begin
  select * into v_membership from public.department_memberships m where m.id = p_membership_id for update;
  if not found or not private.has_capability('member.approve', v_membership.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_membership.user_id = v_user_id then
    raise exception 'cannot_decide_own_membership' using errcode = '42501';
  end if;
  if v_membership.status = p_decision then
    return v_membership;
  end if;
  if not (
    (v_membership.status = 'requested' and p_decision in ('active', 'declined'))
    or (v_membership.status = 'active' and p_decision = 'removed')
  ) then
    raise exception 'invalid_membership_transition' using errcode = 'P0001';
  end if;

  update public.department_memberships m
     set status = p_decision,
         decided_at = now(),
         decided_by = v_user_id,
         decision_reason = nullif(trim(p_reason), '')
   where m.id = p_membership_id
  returning * into v_membership;
  return v_membership;
end;
$$;

-- The signed-in user's capabilities, for server-side checks in the app (SRS-RBAC-001).
create function public.my_capabilities()
returns table (capability text, department_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct c.key, ur.department_id
  from public.user_roles ur
  join public.role_capabilities rc on rc.role_id = ur.role_id
  join public.capabilities c on c.id = rc.capability_id
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = (select auth.uid())
    and ur.revoked_at is null
    and p.status = 'active';
$$;

-- Daily keep-alive (CLAUDE.md "Scheduled jobs"): a real database read that returns no data.
create function public.keepalive()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select now() from (select count(*) from public.departments) as touched;
$$;

-- ---------------------------------------------------------------------------
-- Grants: deny by default, then allow exactly what the policies expect
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Future tables and functions start with no access for API roles; each migration grants what it needs.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

grant select on
  public.organizations,
  public.profiles,
  public.departments,
  public.department_memberships,
  public.department_membership_events,
  public.roles,
  public.capabilities,
  public.role_capabilities,
  public.user_roles,
  public.audit_events
to authenticated;

grant update (display_name, avatar_url) on public.profiles to authenticated;
grant insert, update on public.departments to authenticated;
grant insert, update on public.user_roles to authenticated;

grant execute on function public.request_membership(uuid) to authenticated;
grant execute on function public.decide_membership(uuid, public.membership_status, text) to authenticated;
grant execute on function public.my_capabilities() to authenticated;
grant execute on function public.keepalive() to anon, authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.has_capability(text, uuid) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
