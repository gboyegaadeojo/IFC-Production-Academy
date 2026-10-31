-- Mentoring: SRS-MENTOR-001..005, SRS-RBAC-006.
--
-- * Leaders with mentoring.assign pair a mentor with a volunteer in their department. A mentor
--   must hold mentoring.feedback for that department (trainers and leaders do).
-- * Mentor and volunteer share goals (with optional due dates, for follow-ups) and shared notes.
-- * Private notes are the mentor's own: written only with mentoring.private_notes, and readable
--   only by their author, through a policy of their own (SRS-RBAC-006). Leaders don't see them,
--   and no report or export includes any mentoring note (SRS-REPORT-005).
-- * Pairings are audited; note and goal contents are not copied into the audit log.

insert into public.capabilities (key, description)
values ('mentoring.assign', 'Pair mentors with volunteers in a department')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key in ('department_leader', 'production_director') and c.key = 'mentoring.assign'
on conflict do nothing;

-- Whether a given person (not the caller) holds a capability for a department.
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
revoke all on function private.user_has_capability(uuid, text, uuid) from public, anon, authenticated;

create type public.mentoring_note_visibility as enum ('shared', 'private');
create type public.mentoring_goal_status as enum ('open', 'done');

create table public.mentor_relationships (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  mentor_id uuid not null references public.profiles (id) on delete restrict,
  mentee_id uuid not null references public.profiles (id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason is null or length(end_reason) <= 300),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentor_relationships_not_self check (mentor_id <> mentee_id)
);
create unique index mentor_relationships_one_active_idx
  on public.mentor_relationships (department_id, mentor_id, mentee_id) where ended_at is null;
create index mentor_relationships_mentee_idx on public.mentor_relationships (mentee_id);
create index mentor_relationships_mentor_idx on public.mentor_relationships (mentor_id);

create table public.mentoring_goals (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.mentor_relationships (id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 200),
  due_on date,
  status public.mentoring_goal_status not null default 'open',
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentoring_goals_done check ((status = 'done') = (completed_at is not null))
);
create index mentoring_goals_relationship_idx on public.mentoring_goals (relationship_id);

create table public.mentoring_notes (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.mentor_relationships (id) on delete restrict,
  author_id uuid not null default auth.uid() references public.profiles (id),
  visibility public.mentoring_note_visibility not null,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index mentoring_notes_relationship_idx on public.mentoring_notes (relationship_id, created_at);

alter table public.mentor_relationships enable row level security;
alter table public.mentoring_goals enable row level security;
alter table public.mentoring_notes enable row level security;

create trigger mentor_relationships_set_updated_at before update on public.mentor_relationships
  for each row execute function private.set_updated_at();
create trigger mentoring_goals_set_updated_at before update on public.mentoring_goals
  for each row execute function private.set_updated_at();
create trigger mentor_relationships_audit after insert or update on public.mentor_relationships
  for each row execute function private.audit_change('mentor_relationship');

-- The caller's part in a relationship: mentor, mentee, or neither.
create function private.mentoring_part(p_relationship_id uuid, p_active_only boolean default false)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.mentor_id = (select auth.uid()) then 'mentor'
    when r.mentee_id = (select auth.uid()) then 'mentee'
  end
  from public.mentor_relationships r
  where r.id = p_relationship_id
    and private.is_active_user()
    and (not p_active_only or r.ended_at is null);
$$;

create function private.can_read_mentoring(p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.mentoring_part(p_relationship_id) is not null
      or exists (
        select 1 from public.mentor_relationships r
        where r.id = p_relationship_id and private.has_capability('mentoring.assign', r.department_id)
      );
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy "Mentor, volunteer, and assigning leaders read a pairing"
  on public.mentor_relationships for select to authenticated
  using (private.can_read_mentoring(id));

create policy "Mentor, volunteer, and assigning leaders read goals"
  on public.mentoring_goals for select to authenticated
  using (private.can_read_mentoring(relationship_id));
create policy "Mentor and volunteer add goals while paired"
  on public.mentoring_goals for insert to authenticated
  with check (
    private.mentoring_part(relationship_id, true) is not null
    and created_by = (select auth.uid())
  );
create policy "Mentor and volunteer update goals while paired"
  on public.mentoring_goals for update to authenticated
  using (private.mentoring_part(relationship_id, true) is not null)
  with check (private.mentoring_part(relationship_id, true) is not null);

-- Shared notes: both people, and the leaders who assign mentors.
create policy "Shared notes are read by the pairing and its leaders"
  on public.mentoring_notes for select to authenticated
  using (visibility = 'shared' and private.can_read_mentoring(relationship_id));
-- Private notes: their author only (SRS-RBAC-006).
create policy "Private notes are read by their author only"
  on public.mentoring_notes for select to authenticated
  using (visibility = 'private' and author_id = (select auth.uid()) and private.is_active_user());

create policy "Shared notes are written by the pairing"
  on public.mentoring_notes for insert to authenticated
  with check (
    visibility = 'shared'
    and author_id = (select auth.uid())
    and (
      private.mentoring_part(relationship_id, true) = 'mentee'
      or (private.mentoring_part(relationship_id, true) = 'mentor'
          and exists (select 1 from public.mentor_relationships r
                      where r.id = relationship_id
                        and private.has_capability('mentoring.feedback', r.department_id)))
    )
  );
create policy "Private notes are written by the mentor"
  on public.mentoring_notes for insert to authenticated
  with check (
    visibility = 'private'
    and author_id = (select auth.uid())
    and private.mentoring_part(relationship_id, true) = 'mentor'
    and exists (select 1 from public.mentor_relationships r
                where r.id = relationship_id
                  and private.has_capability('mentoring.private_notes', r.department_id))
  );

grant select on public.mentor_relationships, public.mentoring_goals, public.mentoring_notes
  to authenticated;
grant insert (relationship_id, title, due_on) on public.mentoring_goals to authenticated;
grant update (title, due_on, status, completed_at) on public.mentoring_goals to authenticated;
grant insert (relationship_id, visibility, body) on public.mentoring_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Pairing
-- ---------------------------------------------------------------------------

-- Who could be paired in a department: names, whether they can mentor, whether they're a member.
create function public.mentoring_people(p_department_id uuid)
returns table (user_id uuid, display_name text, can_mentor boolean, is_member boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('mentoring.assign', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select pr.id, pr.display_name,
           private.user_has_capability(pr.id, 'mentoring.feedback', p_department_id),
           exists (select 1 from public.department_memberships m
                   where m.user_id = pr.id and m.department_id = p_department_id and m.status = 'active')
    from public.profiles pr
    where pr.status = 'active'
      and pr.organization_id = private.current_organization_id()
      and (
        exists (select 1 from public.department_memberships m
                where m.user_id = pr.id and m.department_id = p_department_id and m.status = 'active')
        or private.user_has_capability(pr.id, 'mentoring.feedback', p_department_id)
      )
    order by pr.display_name;
end;
$$;

create function public.assign_mentor(p_department_id uuid, p_mentor_id uuid, p_mentee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_capability('mentoring.assign', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_mentor_id = p_mentee_id then
    raise exception 'cannot_mentor_self' using errcode = 'P0001';
  end if;
  if not private.user_has_capability(p_mentor_id, 'mentoring.feedback', p_department_id) then
    raise exception 'mentor_not_eligible' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.department_memberships m join public.profiles pr on pr.id = m.user_id
    where m.user_id = p_mentee_id and m.department_id = p_department_id
      and m.status = 'active' and pr.status = 'active'
  ) then
    raise exception 'mentee_not_member' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.mentor_relationships r
    where r.department_id = p_department_id and r.mentor_id = p_mentor_id
      and r.mentee_id = p_mentee_id and r.ended_at is null
  ) then
    raise exception 'already_paired' using errcode = 'P0001';
  end if;
  insert into public.mentor_relationships (department_id, mentor_id, mentee_id)
  values (p_department_id, p_mentor_id, p_mentee_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Ends a pairing. Its goals and notes stay, read-only.
create function public.end_mentoring(p_relationship_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relationship public.mentor_relationships;
begin
  select * into v_relationship from public.mentor_relationships r where r.id = p_relationship_id for update;
  if v_relationship.id is null
     or not private.has_capability('mentoring.assign', v_relationship.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(coalesce(p_reason, '')) > 300 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  update public.mentor_relationships r
     set ended_at = now(), end_reason = nullif(trim(coalesce(p_reason, '')), '')
   where r.id = p_relationship_id and r.ended_at is null;
end;
$$;

-- Pairings with names, for the people in them (names only: profiles stay private).
create function public.my_mentoring()
returns table (
  relationship_id uuid, department_id uuid, department_name text, mentor_id uuid, mentor_name text,
  mentee_id uuid, mentee_name text, my_part text, started_at timestamptz, ended_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.department_id, d.name, r.mentor_id, mentor.display_name, r.mentee_id,
         mentee.display_name,
         case when r.mentor_id = (select auth.uid()) then 'mentor' else 'mentee' end,
         r.started_at, r.ended_at
  from public.mentor_relationships r
  join public.departments d on d.id = r.department_id
  join public.profiles mentor on mentor.id = r.mentor_id
  join public.profiles mentee on mentee.id = r.mentee_id
  where private.is_active_user()
    and (r.mentor_id = (select auth.uid()) or r.mentee_id = (select auth.uid()))
  order by r.ended_at nulls first, r.started_at desc;
$$;

-- Pairings in a department with names, for leaders who assign mentors.
create function public.department_mentoring(p_department_id uuid)
returns table (
  relationship_id uuid, mentor_id uuid, mentor_name text, mentee_id uuid, mentee_name text,
  started_at timestamptz, ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('mentoring.assign', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select r.id, r.mentor_id, mentor.display_name, r.mentee_id, mentee.display_name, r.started_at,
           r.ended_at
    from public.mentor_relationships r
    join public.profiles mentor on mentor.id = r.mentor_id
    join public.profiles mentee on mentee.id = r.mentee_id
    where r.department_id = p_department_id
    order by r.ended_at nulls first, r.started_at desc;
end;
$$;

revoke all on function private.mentoring_part(uuid, boolean) from public, anon;
revoke all on function private.can_read_mentoring(uuid) from public, anon;
grant execute on function private.mentoring_part(uuid, boolean) to authenticated;
grant execute on function private.can_read_mentoring(uuid) to authenticated;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.my_mentoring()',
    'public.department_mentoring(uuid)',
    'public.mentoring_people(uuid)',
    'public.assign_mentor(uuid, uuid, uuid)',
    'public.end_mentoring(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;
