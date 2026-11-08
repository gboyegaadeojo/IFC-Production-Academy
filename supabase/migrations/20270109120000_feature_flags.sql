-- Feature flags (ADD-FLAG-01; docs/decisions/2026-11-08-team-messaging.md). A module that's off is
-- hidden by the screens and refused by the database: its functions and policies call
-- private.feature_enabled(). Keys are a fixed list, here and in lib/domain/features.ts, so a typo
-- can't switch on something that doesn't exist. Messaging is the first, and starts off.

insert into public.capabilities (key, description)
values ('feature.manage', 'Switch modules such as messaging on or off')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'platform_admin' and c.key = 'feature.manage'
on conflict do nothing;

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  key text not null check (key in ('messaging')),
  enabled boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

-- Everyone signed in needs to know what's on, to show or hide a module. Nobody writes directly.
alter table public.feature_flags enable row level security;
create policy "Active people read their organization's flags"
  on public.feature_flags for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.is_active_user());
grant select on public.feature_flags to authenticated;

insert into public.feature_flags (organization_id, key)
select o.id, 'messaging' from public.organizations o
on conflict (organization_id, key) do nothing;

-- Off unless a row says on, so a missing row never switches anything on.
create function private.feature_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select f.enabled from public.feature_flags f
    where f.organization_id = private.current_organization_id() and f.key = p_key
  ), false);
$$;
revoke all on function private.feature_enabled(text) from public, anon;
grant execute on function private.feature_enabled(text) to authenticated, service_role;

-- Switching a flag says which one and which way in the audit log (SRS-AUDIT-001). Safe to retry:
-- setting it to what it already is records nothing.
create function public.set_feature_flag(p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag uuid;
begin
  if not (private.is_active_user() and private.has_capability('feature.manage')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.feature_flags (organization_id, key)
  values (private.current_organization_id(), p_key)
  on conflict (organization_id, key) do nothing;
  update public.feature_flags f
     set enabled = p_enabled, updated_by = (select auth.uid()), updated_at = now()
   where f.organization_id = private.current_organization_id()
     and f.key = p_key
     and f.enabled is distinct from p_enabled
  returning f.id into v_flag;
  if v_flag is not null then
    insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
    values (private.current_organization_id(), (select auth.uid()),
      'feature_flag.' || case when p_enabled then 'switched_on' else 'switched_off' end,
      'feature_flags', v_flag, jsonb_build_object('key', p_key, 'enabled', p_enabled));
  end if;
end;
$$;
revoke all on function public.set_feature_flag(text, boolean) from public, anon;
grant execute on function public.set_feature_flag(text, boolean) to authenticated;
