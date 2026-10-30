-- Invitations (SRS-AUTH-003, SRS-MEM-002, ADD-AUTH-01): leaders create a link, for one person or a
-- group (shown as a QR code at a volunteer night). Accepting joins the department straight away,
-- because the leader decided when they invited. Joining is never approval to serve.
--
--   * Only a SHA-256 hash of the token is stored; the link is shown once, when it is created.
--   * The inviter must still hold member.invite when someone accepts.
--   * Every invitation, revocation, and acceptance is audited.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  -- null: an invitation to the Academy only, for people with organization-wide member.invite.
  department_id uuid references public.departments (id),
  token_hash bytea not null unique,
  -- For the inviter's reference, such as "Volunteer night, 12 November". No personal details.
  note text check (note is null or length(note) <= 120),
  max_uses integer not null default 1 check (max_uses between 1 and 200),
  use_count integer not null default 0 check (use_count between 0 and max_uses),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invitations_department_idx on public.invitations (department_id, created_at desc);

create table public.invitation_acceptances (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  membership_id uuid references public.department_memberships (id),
  accepted_at timestamptz not null default now(),
  unique (invitation_id, user_id)
);
create index invitation_acceptances_user_idx on public.invitation_acceptances (user_id);

alter table public.invitations enable row level security;
alter table public.invitation_acceptances enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Like has_capability, but for any user: used to check the inviter at acceptance time.
create function private.user_has_capability(p_user_id uuid, p_capability text, p_department_id uuid)
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
    where ur.user_id = p_user_id
      and ur.revoked_at is null
      and p.status = 'active'
      and c.key = p_capability
      and (ur.department_id is null or ur.department_id = p_department_id)
  );
$$;

create function private.invitation_token_hash(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

-- ---------------------------------------------------------------------------
-- Policies: read only; writes go through the functions below
-- ---------------------------------------------------------------------------

create policy "Inviters read their department's invitations"
  on public.invitations for select to authenticated
  using (
    organization_id = private.current_organization_id()
    and private.has_capability('member.invite', department_id)
  );

create policy "People read their acceptances; inviters read their department's"
  on public.invitation_acceptances for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.invitations i
      where i.id = invitation_id and private.has_capability('member.invite', i.department_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger invitations_set_updated_at before update on public.invitations
  for each row execute function private.set_updated_at();
create trigger invitations_audit after insert or update on public.invitations
  for each row execute function private.audit_change('invitation');
create trigger invitation_acceptances_audit after insert on public.invitation_acceptances
  for each row execute function private.audit_change('invitation_acceptance');

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Creates an invitation and returns its token once. Raises not_authorized, department_not_open,
-- or invalid_invitation_settings.
create function public.create_invitation(
  p_department_id uuid,
  p_max_uses integer,
  p_valid_days integer,
  p_note text default null
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_status public.department_status;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_actor is null or not private.has_capability('member.invite', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 200
     or p_valid_days is null or p_valid_days not between 1 and 60
     or length(coalesce(p_note, '')) > 120 then
    raise exception 'invalid_invitation_settings' using errcode = '22023';
  end if;
  if p_department_id is not null then
    select d.status into v_status
      from public.departments d
     where d.id = p_department_id and d.organization_id = private.current_organization_id();
    if v_status is distinct from 'active' then
      raise exception 'department_not_open' using errcode = 'P0001';
    end if;
  end if;

  -- 24 random bytes as URL-safe base64: 32 characters, 192 bits.
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  v_expires := now() + make_interval(days => p_valid_days);

  insert into public.invitations
    (organization_id, department_id, token_hash, note, max_uses, expires_at, created_by)
  values (
    private.current_organization_id(),
    p_department_id,
    private.invitation_token_hash(v_token),
    nullif(trim(p_note), ''),
    p_max_uses,
    v_expires,
    v_actor
  )
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
begin
  select * into v_invitation from public.invitations i where i.id = p_invitation_id for update;
  if not found
     or v_invitation.organization_id is distinct from private.current_organization_id()
     or not private.has_capability('member.invite', v_invitation.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_invitation.revoked_at is null then
    update public.invitations i
       set revoked_at = now(), revoked_by = (select auth.uid())
     where i.id = p_invitation_id;
  end if;
end;
$$;

-- What a signed-in person sees before accepting. Never reveals who else accepted.
-- status: valid, accepted (by this person already), already_member, expired, used_up, revoked,
-- not_found. Invitations whose inviter lost member.invite, or whose department closed, read as
-- not_found or revoked so they can't be used.
create function public.invitation_preview(p_token text)
returns table (
  status text,
  department_id uuid,
  department_name text,
  department_hue text,
  department_icon text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invitation public.invitations;
  v_department public.departments;
  v_status text;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_invitation
    from public.invitations i
   where i.token_hash = private.invitation_token_hash(coalesce(p_token, ''))
     and i.organization_id = private.current_organization_id();
  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_invitation.department_id is not null then
    select * into v_department from public.departments d where d.id = v_invitation.department_id;
  end if;

  if exists (
    select 1 from public.invitation_acceptances a
    where a.invitation_id = v_invitation.id and a.user_id = v_user
  ) then
    v_status := 'accepted';
  elsif v_invitation.revoked_at is not null
     or not private.user_has_capability(v_invitation.created_by, 'member.invite', v_invitation.department_id)
     or (v_invitation.department_id is not null and v_department.status <> 'active') then
    v_status := 'revoked';
  elsif v_invitation.expires_at <= now() then
    v_status := 'expired';
  elsif v_invitation.use_count >= v_invitation.max_uses then
    v_status := 'used_up';
  elsif v_invitation.department_id is not null and exists (
    select 1 from public.department_memberships m
    where m.department_id = v_invitation.department_id and m.user_id = v_user and m.status = 'active'
  ) then
    v_status := 'already_member';
  else
    v_status := 'valid';
  end if;

  return query select
    v_status,
    v_invitation.department_id,
    v_department.name,
    v_department.hue,
    v_department.icon,
    v_invitation.expires_at;
end;
$$;

-- Accepts an invitation. Idempotent: accepting again returns the same result.
-- outcome: joined, already_member, accepted (Academy-only invitation).
-- Raises not_authorized, invitation_not_found, invitation_revoked, invitation_expired,
-- invitation_used_up.
create function public.accept_invitation(p_token text)
returns table (outcome text, department_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invitation public.invitations;
  v_department_status public.department_status;
  v_membership public.department_memberships;
  v_outcome text;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_invitation
    from public.invitations i
   where i.token_hash = private.invitation_token_hash(coalesce(p_token, ''))
     and i.organization_id = private.current_organization_id()
   for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  -- Accepting twice is not an error and doesn't use another place.
  if exists (
    select 1 from public.invitation_acceptances a
    where a.invitation_id = v_invitation.id and a.user_id = v_user
  ) then
    return query select
      case when v_invitation.department_id is null then 'accepted' else 'joined' end,
      v_invitation.department_id;
    return;
  end if;

  if v_invitation.department_id is not null then
    select d.status into v_department_status
      from public.departments d where d.id = v_invitation.department_id;
  end if;
  if v_invitation.revoked_at is not null
     or not private.user_has_capability(v_invitation.created_by, 'member.invite', v_invitation.department_id)
     or (v_invitation.department_id is not null and v_department_status is distinct from 'active') then
    raise exception 'invitation_revoked' using errcode = 'P0001';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  if v_invitation.use_count >= v_invitation.max_uses then
    raise exception 'invitation_used_up' using errcode = 'P0001';
  end if;

  if v_invitation.department_id is null then
    v_outcome := 'accepted';
  else
    select * into v_membership
      from public.department_memberships m
     where m.department_id = v_invitation.department_id
       and m.user_id = v_user
       and m.status in ('requested', 'active')
     for update;

    if found and v_membership.status = 'active' then
      v_outcome := 'already_member';
    elsif found then
      -- An open request becomes membership: the inviter has already decided.
      update public.department_memberships m
         set status = 'active',
             decided_at = now(),
             decided_by = v_invitation.created_by,
             decision_reason = 'Accepted an invitation'
       where m.id = v_membership.id
      returning * into v_membership;
      v_outcome := 'joined';
    else
      insert into public.department_memberships
        (department_id, user_id, status, decided_at, decided_by, decision_reason)
      values (
        v_invitation.department_id, v_user, 'active', now(), v_invitation.created_by,
        'Accepted an invitation'
      )
      returning * into v_membership;
      v_outcome := 'joined';
    end if;
  end if;

  insert into public.invitation_acceptances (invitation_id, user_id, membership_id)
  values (v_invitation.id, v_user, v_membership.id);
  -- Someone already a member doesn't use up a place.
  if v_outcome <> 'already_member' then
    update public.invitations i set use_count = use_count + 1 where i.id = v_invitation.id;
  end if;

  return query select v_outcome, v_invitation.department_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- The token hash is never readable through the API.
grant select (
  id, organization_id, department_id, note, max_uses, use_count, expires_at,
  created_by, revoked_at, revoked_by, created_at, updated_at
) on public.invitations to authenticated;
grant select on public.invitation_acceptances to authenticated;

revoke all on function public.create_invitation(uuid, integer, integer, text) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.invitation_preview(text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_invitation(uuid, integer, integer, text) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.invitation_preview(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

revoke all on function private.user_has_capability(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.invitation_token_hash(text) from public, anon, authenticated;
