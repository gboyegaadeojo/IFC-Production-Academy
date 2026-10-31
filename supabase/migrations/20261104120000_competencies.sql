-- Competencies, serving roles, and Approved to Serve: SRS-COMP-001..004, -008, -009, SRS-ASSESS-008.
--
-- * Leaders define each department's competencies (a skill or piece of equipment) and its serving
--   roles, and say which competencies each role needs. All of it is data (CLAUDE.md).
-- * A competency record is granted by the system when a practical assessment passes (the practical
--   assessments migration calls private.grant_competency); there is no separate approval
--   (decided 2026-10-30). Leaders with competency.approve can suspend a record, with a reason, and
--   reinstate it. Expiry is per competency and off by default (SRS-COMP-009).
-- * Approved to Serve is its own record per person and role. The system grants it when every
--   competency the role needs is approved and current, and withdraws it when one is suspended,
--   expires, or the role's requirements change (SRS-COMP-004). Course completion is never involved
--   (SPEC §3).
-- * Expiry happens with time, so readers also check expires_at; private.refresh_serving_approvals
--   brings the stored record up to date whenever anything changes.

create type public.competency_status as enum ('approved', 'suspended');
create type public.serving_approval_status as enum ('approved', 'withdrawn');

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  -- Null: never expires (the default).
  expiry_months integer check (expiry_months between 1 and 60),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, department_id)
);
create unique index competencies_name_idx
  on public.competencies (department_id, lower(trim(name))) where archived_at is null;

create table public.serving_roles (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, department_id)
);
create unique index serving_roles_name_idx
  on public.serving_roles (department_id, lower(trim(name))) where archived_at is null;

create table public.serving_role_competencies (
  role_id uuid not null,
  competency_id uuid not null,
  department_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (role_id, competency_id),
  -- Requirements stay inside one department (SRS-ASSESS-008).
  foreign key (role_id, department_id) references public.serving_roles (id, department_id),
  foreign key (competency_id, department_id) references public.competencies (id, department_id)
);

create table public.competency_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  competency_id uuid not null,
  department_id uuid not null,
  status public.competency_status not null default 'approved',
  granted_at timestamptz not null default now(),
  -- The practical assessment that granted it (linked once assessments exist).
  granted_by_assessment_id uuid,
  expires_at timestamptz,
  suspended_at timestamptz,
  suspended_by uuid references public.profiles (id),
  suspend_reason text check (suspend_reason is null or length(suspend_reason) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, competency_id),
  foreign key (competency_id, department_id) references public.competencies (id, department_id),
  constraint competency_records_suspension check (
    (status = 'suspended') = (suspended_at is not null and suspend_reason is not null)
  )
);
create index competency_records_department_idx on public.competency_records (department_id);

create table public.serving_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  role_id uuid not null,
  department_id uuid not null,
  status public.serving_approval_status not null,
  approved_at timestamptz not null,
  withdrawn_at timestamptz,
  withdraw_reason text check (
    withdraw_reason in ('competency_suspended', 'competency_expired', 'requirements_changed', 'role_archived')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role_id),
  foreign key (role_id, department_id) references public.serving_roles (id, department_id),
  constraint serving_approvals_withdrawn check (
    (status = 'withdrawn') = (withdrawn_at is not null and withdraw_reason is not null)
  )
);
create index serving_approvals_department_idx on public.serving_approvals (department_id);

alter table public.competencies enable row level security;
alter table public.serving_roles enable row level security;
alter table public.serving_role_competencies enable row level security;
alter table public.competency_records enable row level security;
alter table public.serving_approvals enable row level security;

create trigger competencies_set_updated_at before update on public.competencies
  for each row execute function private.set_updated_at();
create trigger serving_roles_set_updated_at before update on public.serving_roles
  for each row execute function private.set_updated_at();
create trigger competency_records_set_updated_at before update on public.competency_records
  for each row execute function private.set_updated_at();
create trigger serving_approvals_set_updated_at before update on public.serving_approvals
  for each row execute function private.set_updated_at();

-- Every change here is sensitive, so every change is audited (SRS-AUDIT-001, SRS-ASSESS-006).
create trigger competencies_audit after insert or update on public.competencies
  for each row execute function private.audit_change('competency');
create trigger serving_roles_audit after insert or update on public.serving_roles
  for each row execute function private.audit_change('serving_role');
create trigger serving_role_competencies_audit after insert or delete on public.serving_role_competencies
  for each row execute function private.audit_change('serving_role_requirement');
create trigger competency_records_audit after insert or update on public.competency_records
  for each row execute function private.audit_change('competency_record');
create trigger serving_approvals_audit after insert or update on public.serving_approvals
  for each row execute function private.audit_change('serving_approval');

-- ---------------------------------------------------------------------------
-- Who can see what
-- ---------------------------------------------------------------------------

-- People who work with a department's readiness: trainers, leaders, and report viewers.
create function private.can_view_readiness(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability('competency.approve', p_department_id)
      or private.has_capability('assessment.record', p_department_id)
      or private.has_capability('report.view', p_department_id);
$$;

-- Members see what their department's competencies and roles are; staff see them too.
create policy "Members and staff read competencies"
  on public.competencies for select to authenticated
  using (
    private.is_department_member(department_id)
    or private.can_view_readiness(department_id)
    or private.can_manage_curriculum(department_id)
  );
create policy "Leaders add competencies"
  on public.competencies for insert to authenticated
  with check (private.has_capability('competency.approve', department_id));
create policy "Leaders edit competencies"
  on public.competencies for update to authenticated
  using (private.has_capability('competency.approve', department_id))
  with check (private.has_capability('competency.approve', department_id));

create policy "Members and staff read serving roles"
  on public.serving_roles for select to authenticated
  using (
    private.is_department_member(department_id)
    or private.can_view_readiness(department_id)
    or private.can_manage_curriculum(department_id)
  );
create policy "Leaders add serving roles"
  on public.serving_roles for insert to authenticated
  with check (private.has_capability('competency.approve', department_id));
create policy "Leaders edit serving roles"
  on public.serving_roles for update to authenticated
  using (private.has_capability('competency.approve', department_id))
  with check (private.has_capability('competency.approve', department_id));

create policy "Members and staff read role requirements"
  on public.serving_role_competencies for select to authenticated
  using (
    private.is_department_member(department_id)
    or private.can_view_readiness(department_id)
    or private.can_manage_curriculum(department_id)
  );

create policy "People read their own competencies; staff read their department's"
  on public.competency_records for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.can_view_readiness(department_id)
  );

create policy "People read their own approvals; staff read their department's"
  on public.serving_approvals for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.can_view_readiness(department_id)
  );

grant select on public.competencies, public.serving_roles, public.serving_role_competencies,
  public.competency_records, public.serving_approvals to authenticated;
grant insert (department_id, name, description, expiry_months) on public.competencies to authenticated;
grant update (name, description, expiry_months, archived_at) on public.competencies to authenticated;
grant insert (department_id, name, description) on public.serving_roles to authenticated;
grant update (name, description, archived_at) on public.serving_roles to authenticated;

-- ---------------------------------------------------------------------------
-- Approved to Serve, worked out by the system
-- ---------------------------------------------------------------------------

-- Brings one person's Approved to Serve records in a department up to date. A role counts when it
-- needs at least one competency and every one is approved and not expired.
create function private.refresh_serving_approvals(p_user_id uuid, p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role record;
  v_missing integer;
  v_suspended integer;
  v_expired integer;
  v_qualifies boolean;
  v_reason text;
begin
  for v_role in
    select r.id, r.archived_at,
           (select count(*) from public.serving_role_competencies rc where rc.role_id = r.id) as needed
    from public.serving_roles r
    where r.department_id = p_department_id
  loop
    select
      count(*) filter (where cr.id is null),
      count(*) filter (where cr.status = 'suspended'),
      count(*) filter (where cr.status = 'approved' and cr.expires_at is not null and cr.expires_at <= now())
      into v_missing, v_suspended, v_expired
      from public.serving_role_competencies rc
      left join public.competency_records cr
        on cr.competency_id = rc.competency_id and cr.user_id = p_user_id
     where rc.role_id = v_role.id;

    v_qualifies := v_role.archived_at is null and v_role.needed > 0
      and v_missing = 0 and v_suspended = 0 and v_expired = 0;
    v_reason := case
      when v_role.archived_at is not null then 'role_archived'
      when v_suspended > 0 then 'competency_suspended'
      when v_expired > 0 then 'competency_expired'
      else 'requirements_changed'
    end;

    if v_qualifies then
      insert into public.serving_approvals as a (user_id, role_id, department_id, status, approved_at)
      values (p_user_id, v_role.id, p_department_id, 'approved', now())
      on conflict (user_id, role_id) do update
        set status = 'approved', approved_at = now(), withdrawn_at = null, withdraw_reason = null
        where a.status = 'withdrawn';
    else
      update public.serving_approvals a
         set status = 'withdrawn', withdrawn_at = now(), withdraw_reason = v_reason
       where a.user_id = p_user_id and a.role_id = v_role.id and a.status = 'approved';
    end if;
  end loop;
end;
$$;

-- Everyone who might be affected by a change to a department's roles or competencies.
create function private.refresh_department_approvals(p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select cr.user_id from public.competency_records cr where cr.department_id = p_department_id
    union
    select a.user_id from public.serving_approvals a where a.department_id = p_department_id
  loop
    perform private.refresh_serving_approvals(v_user, p_department_id);
  end loop;
end;
$$;

-- Grants (or re-grants) a competency after a passed practical. The only way records are created.
create function private.grant_competency(
  p_user_id uuid,
  p_competency_id uuid,
  p_assessment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competency public.competencies;
  v_record uuid;
begin
  select * into v_competency from public.competencies c where c.id = p_competency_id;
  if v_competency.id is null or v_competency.archived_at is not null then
    return null;
  end if;
  insert into public.competency_records as r
    (user_id, competency_id, department_id, status, granted_at, granted_by_assessment_id, expires_at)
  values (p_user_id, p_competency_id, v_competency.department_id, 'approved', now(), p_assessment_id,
          case when v_competency.expiry_months is null then null
               else now() + make_interval(months => v_competency.expiry_months) end)
  on conflict (user_id, competency_id) do update
    set status = 'approved', granted_at = now(), granted_by_assessment_id = p_assessment_id,
        expires_at = excluded.expires_at, suspended_at = null, suspended_by = null,
        suspend_reason = null
  returning id into v_record;
  perform private.refresh_serving_approvals(p_user_id, v_competency.department_id);
  return v_record;
end;
$$;

-- Requirement changes, archived roles, and archived competencies update approvals straight away.
create function private.on_readiness_rules_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'competencies' and new.archived_at is not null and old.archived_at is null then
    delete from public.serving_role_competencies rc where rc.competency_id = new.id;
  end if;
  perform private.refresh_department_approvals(
    case when tg_op = 'DELETE' then old.department_id else new.department_id end);
  return null;
end;
$$;
create trigger serving_roles_rules_changed after update of archived_at on public.serving_roles
  for each row execute function private.on_readiness_rules_changed();
create trigger competencies_rules_changed after update of archived_at on public.competencies
  for each row execute function private.on_readiness_rules_changed();

-- ---------------------------------------------------------------------------
-- Leader actions
-- ---------------------------------------------------------------------------

-- Sets which competencies a role needs (SRS-COMP-004). Replaces the list; audited per change.
create function public.set_role_competencies(p_role_id uuid, p_competency_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.serving_roles;
begin
  select * into v_role from public.serving_roles r where r.id = p_role_id for update;
  if v_role.id is null or v_role.archived_at is not null
     or not private.has_capability('competency.approve', v_role.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_competency_ids, '{}')) as wanted (id)
    where not exists (
      select 1 from public.competencies c
      where c.id = wanted.id and c.department_id = v_role.department_id and c.archived_at is null
    )
  ) then
    raise exception 'competency_not_in_department' using errcode = 'P0001';
  end if;

  delete from public.serving_role_competencies rc
   where rc.role_id = p_role_id and not (rc.competency_id = any (coalesce(p_competency_ids, '{}')));
  insert into public.serving_role_competencies (role_id, competency_id, department_id)
  select p_role_id, wanted.id, v_role.department_id
    from (select distinct unnest(coalesce(p_competency_ids, '{}')) as id) wanted
  on conflict do nothing;
  perform private.refresh_department_approvals(v_role.department_id);
end;
$$;

-- Suspends someone's competency, with a reason (SRS-COMP-003, -008). Their Approved to Serve for
-- roles that need it is withdrawn at once.
create function public.suspend_competency(p_record_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.competency_records;
begin
  select * into v_record from public.competency_records r where r.id = p_record_id for update;
  if v_record.id is null or not private.has_capability('competency.approve', v_record.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 1 and 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if v_record.status = 'suspended' then
    return;
  end if;
  update public.competency_records r
     set status = 'suspended', suspended_at = now(), suspended_by = (select auth.uid()),
         suspend_reason = trim(p_reason)
   where r.id = p_record_id;
  perform private.refresh_serving_approvals(v_record.user_id, v_record.department_id);
end;
$$;

-- Lifts a suspension. The record's original grant and expiry stay.
create function public.reinstate_competency(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.competency_records;
begin
  select * into v_record from public.competency_records r where r.id = p_record_id for update;
  if v_record.id is null or not private.has_capability('competency.approve', v_record.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.competency_records r
     set status = 'approved', suspended_at = null, suspended_by = null, suspend_reason = null
   where r.id = p_record_id and r.status = 'suspended';
  perform private.refresh_serving_approvals(v_record.user_id, v_record.department_id);
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.set_role_competencies(uuid, uuid[])',
    'public.suspend_competency(uuid, text)',
    'public.reinstate_competency(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;

revoke all on function private.can_view_readiness(uuid) from public, anon;
grant execute on function private.can_view_readiness(uuid) to authenticated;
revoke all on function private.refresh_serving_approvals(uuid, uuid) from public, anon, authenticated;
revoke all on function private.refresh_department_approvals(uuid) from public, anon, authenticated;
revoke all on function private.grant_competency(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.on_readiness_rules_changed() from public, anon, authenticated;
