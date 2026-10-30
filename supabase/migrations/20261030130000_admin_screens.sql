-- Support for the admin screens: account status changes, sign-in emails for people you may already
-- see, and two guards on role grants. SRS-AUTH-004, SRS-AUTH-007, SRS-RBAC-001, SRS-AUDIT-001.

-- ---------------------------------------------------------------------------
-- Sign-in emails (they live in auth.users, which the Data API never exposes)
-- ---------------------------------------------------------------------------

-- Returns emails only for profiles the caller may already read (private.can_view_profile), so this
-- reveals nothing new beyond the address itself. Capped at 500 ids per call.
create function public.profile_emails(p_user_ids uuid[])
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text
  from auth.users u
  where private.is_active_user()
    and coalesce(cardinality(p_user_ids), 0) <= 500
    and u.id = any (p_user_ids)
    and private.can_view_profile(u.id);
$$;

-- ---------------------------------------------------------------------------
-- Account status (SRS-AUTH-004): suspend, reactivate, or deactivate without erasing history
-- ---------------------------------------------------------------------------

create function public.set_account_status(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_profile public.profiles;
begin
  if v_actor is null or not private.has_capability('user.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_user_id = v_actor then
    raise exception 'cannot_change_own_status' using errcode = '42501';
  end if;

  select * into v_profile
    from public.profiles p
   where p.id = p_user_id and p.organization_id = private.current_organization_id()
   for update;
  if not found then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_profile.status = p_status then
    return v_profile;
  end if;

  update public.profiles p
     set status = p_status,
         status_reason = nullif(trim(left(coalesce(p_reason, ''), 500)), ''),
         status_changed_at = now(),
         status_changed_by = v_actor
   where p.id = p_user_id
  returning * into v_profile;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role grant guards
-- ---------------------------------------------------------------------------

-- Same rules as before, plus:
--   * Only someone who holds user.manage may grant or revoke a role that carries user.manage, so a
--     role manager can't make themselves (or anyone) an account administrator.
--   * Nobody revokes their own roles, so an administrator can't lock themselves out by accident.
-- Both apply only to signed-in callers; maintenance SQL run by the database owner has no auth.uid().
create or replace function private.guard_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_scoped boolean;
  v_actor uuid := (select auth.uid());
  v_carries_user_manage boolean;
begin
  select r.department_scoped into v_department_scoped from public.roles r where r.id = new.role_id;
  if v_department_scoped and new.department_id is null then
    raise exception 'role_requires_department' using errcode = '23514';
  elsif not v_department_scoped and new.department_id is not null then
    raise exception 'role_is_organization_wide' using errcode = '23514';
  end if;

  select exists (
    select 1 from public.role_capabilities rc
    join public.capabilities c on c.id = rc.capability_id
    where rc.role_id = new.role_id and c.key = 'user.manage'
  ) into v_carries_user_manage;

  if tg_op = 'INSERT' then
    if v_actor is not null and v_carries_user_manage and not private.has_capability('user.manage') then
      raise exception 'role_needs_user_manage' using errcode = '42501';
    end if;
    new.granted_by := coalesce(v_actor, new.granted_by);
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
      if v_actor is not null and old.user_id = v_actor then
        raise exception 'cannot_revoke_own_role' using errcode = '42501';
      end if;
      if v_actor is not null and v_carries_user_manage and not private.has_capability('user.manage') then
        raise exception 'role_needs_user_manage' using errcode = '42501';
      end if;
      new.revoked_at := now();
      new.revoked_by := coalesce(v_actor, new.revoked_by);
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.profile_emails(uuid[]) from public, anon;
revoke all on function public.set_account_status(uuid, public.account_status, text) from public, anon;
grant execute on function public.profile_emails(uuid[]) to authenticated;
grant execute on function public.set_account_status(uuid, public.account_status, text) to authenticated;
