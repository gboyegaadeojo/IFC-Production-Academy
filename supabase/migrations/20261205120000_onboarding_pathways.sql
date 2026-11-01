-- Onboarding pathways (docs/decisions/2026-11-01-onboarding-pathways.md).
-- * Pathways, stages and steps are data. "Join the team" (department_id null) is owned by holders of
--   an organisation-wide onboarding.manage grant; a department's pathway by that department's.
-- * People enter as contacts (no account needed), then an entry walks the pathway's steps. The
--   engine below moves an entry on until it reaches a step that waits.
-- * Course steps move on only when course_requirements_met() says so. A pathway never touches
--   position teams or approval to serve; "add to a team in Planning Center" completes itself when
--   the sync puts the person on that team.
-- * Emails to volunteers go to an outbox and are held until onboarding_emails_enabled is true.

alter type public.notification_kind add value if not exists 'onboarding_task';
alter type public.notification_kind add value if not exists 'onboarding_update';

alter table public.organizations add column onboarding_emails_enabled boolean not null default false;

insert into public.capabilities (key, description)
values ('onboarding.manage', 'Build onboarding pathways and look after the people in them')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key in ('department_leader', 'production_director') and c.key = 'onboarding.manage'
on conflict do nothing;

create type public.onboarding_step_kind as enum (
  'trigger_form', 'trigger_manual', 'trigger_join', 'trigger_pco',
  'email', 'notify', 'task', 'mentor', 'course', 'wait', 'pco_team', 'branch', 'finish'
);
create type public.onboarding_entry_status as enum ('active', 'finished', 'stopped');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.onboarding_pathways (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  department_id uuid references public.departments (id),
  name text not null check (length(trim(name)) between 1 and 120),
  summary text not null default '' check (length(summary) <= 500),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open pathway for the whole team, and one per department.
create unique index onboarding_pathways_general_idx on public.onboarding_pathways (organization_id)
  where department_id is null and archived_at is null;
create unique index onboarding_pathways_department_idx on public.onboarding_pathways (department_id)
  where department_id is not null and archived_at is null;

create table public.onboarding_stages (
  id uuid primary key default gen_random_uuid(),
  pathway_id uuid not null references public.onboarding_pathways (id),
  name text not null check (length(trim(name)) between 1 and 80),
  timing text not null default '' check (length(timing) <= 40),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index onboarding_stages_pathway_idx on public.onboarding_stages (pathway_id, sort_order);

create table public.onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  pathway_id uuid not null references public.onboarding_pathways (id),
  stage_id uuid not null references public.onboarding_stages (id),
  kind public.onboarding_step_kind not null,
  title text not null check (length(trim(title)) between 1 and 120),
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index onboarding_steps_stage_idx on public.onboarding_steps (stage_id, sort_order);

-- Someone who wants to serve, with or without an account yet.
create table public.onboarding_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  email text not null check (length(email) between 3 and 254 and email like '%_@_%'),
  phone text not null default '' check (length(phone) <= 40),
  message text not null default '' check (length(message) <= 1000),
  interests uuid[] not null default '{}',
  user_id uuid references public.profiles (id),
  source text not null check (source in ('form', 'manual', 'join', 'pco_workflow')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index onboarding_contacts_email_idx on public.onboarding_contacts (organization_id, lower(email));
create index onboarding_contacts_user_idx on public.onboarding_contacts (user_id);

create table public.onboarding_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  pathway_id uuid not null references public.onboarding_pathways (id),
  contact_id uuid not null references public.onboarding_contacts (id),
  current_step_id uuid references public.onboarding_steps (id),
  status public.onboarding_entry_status not null default 'active',
  came_in_by text not null check (came_in_by in ('form', 'manual', 'join', 'pco_workflow', 'branch')),
  chosen_department_id uuid references public.departments (id),
  step_started_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index onboarding_entries_open_idx on public.onboarding_entries (pathway_id, contact_id)
  where status = 'active';
create index onboarding_entries_contact_idx on public.onboarding_entries (contact_id);

create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.onboarding_entries (id),
  step_id uuid not null references public.onboarding_steps (id),
  kind text not null check (kind in ('follow_up', 'mentor', 'pco_team')),
  title text not null,
  detail text not null default '',
  pool_role_id uuid references public.roles (id),
  assignee_id uuid references public.profiles (id),
  due_at timestamptz,
  done_at timestamptz,
  done_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, step_id)
);
create index onboarding_tasks_assignee_idx on public.onboarding_tasks (assignee_id) where done_at is null;

create table public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.onboarding_entries (id),
  step_id uuid references public.onboarding_steps (id),
  kind text not null,
  detail text not null default '',
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index onboarding_events_entry_idx on public.onboarding_events (entry_id, created_at);

-- Shared notes are for everyone who looks after the pathway; private ones for their author only.
create table public.onboarding_notes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.onboarding_entries (id),
  author_id uuid not null default auth.uid() references public.profiles (id),
  body text not null check (length(trim(body)) between 1 and 2000),
  visibility text not null check (visibility in ('shared', 'private')),
  created_at timestamptz not null default now()
);

-- Emails to volunteers. Held until the organisation turns onboarding emails on.
create table public.onboarding_outbox (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.onboarding_entries (id),
  step_id uuid not null references public.onboarding_steps (id),
  contact_id uuid not null references public.onboarding_contacts (id),
  subject text not null,
  body text not null,
  status text not null default 'held' check (status in ('held', 'pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (entry_id, step_id)
);

alter table public.onboarding_pathways enable row level security;
alter table public.onboarding_stages enable row level security;
alter table public.onboarding_steps enable row level security;
alter table public.onboarding_contacts enable row level security;
alter table public.onboarding_entries enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.onboarding_events enable row level security;
alter table public.onboarding_notes enable row level security;
alter table public.onboarding_outbox enable row level security;

create trigger onboarding_pathways_set_updated_at before update on public.onboarding_pathways
  for each row execute function private.set_updated_at();
create trigger onboarding_stages_set_updated_at before update on public.onboarding_stages
  for each row execute function private.set_updated_at();
create trigger onboarding_steps_set_updated_at before update on public.onboarding_steps
  for each row execute function private.set_updated_at();
create trigger onboarding_contacts_set_updated_at before update on public.onboarding_contacts
  for each row execute function private.set_updated_at();
create trigger onboarding_entries_set_updated_at before update on public.onboarding_entries
  for each row execute function private.set_updated_at();
create trigger onboarding_tasks_set_updated_at before update on public.onboarding_tasks
  for each row execute function private.set_updated_at();

create trigger onboarding_pathways_audit after insert or update on public.onboarding_pathways
  for each row execute function private.audit_change('onboarding_pathway');
create trigger onboarding_stages_audit after insert or update on public.onboarding_stages
  for each row execute function private.audit_change('onboarding_stage');
create trigger onboarding_steps_audit after insert or update on public.onboarding_steps
  for each row execute function private.audit_change('onboarding_step');
create trigger onboarding_entries_audit after insert or update of status on public.onboarding_entries
  for each row execute function private.audit_change('onboarding_entry');
create trigger onboarding_tasks_audit after insert or update of assignee_id, done_at on public.onboarding_tasks
  for each row execute function private.audit_change('onboarding_task');

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- With a department: that department's or an organisation-wide grant. Without one ("Join the
-- team"): an organisation-wide grant only.
create function private.can_manage_onboarding(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability('onboarding.manage', p_department_id);
$$;
revoke all on function private.can_manage_onboarding(uuid) from public, anon;
grant execute on function private.can_manage_onboarding(uuid) to authenticated;

create function private.can_manage_pathway(p_pathway_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.onboarding_pathways p
    where p.id = p_pathway_id and p.organization_id = private.current_organization_id()
      and private.can_manage_onboarding(p.department_id)
  );
$$;
revoke all on function private.can_manage_pathway(uuid) from public, anon;
grant execute on function private.can_manage_pathway(uuid) to authenticated;

create function private.can_manage_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.onboarding_entries e
    where e.id = p_entry_id and private.can_manage_pathway(e.pathway_id)
  );
$$;
revoke all on function private.can_manage_entry(uuid) from public, anon;
grant execute on function private.can_manage_entry(uuid) to authenticated;

create policy onboarding_pathways_select on public.onboarding_pathways for select to authenticated
  using (organization_id = private.current_organization_id() and private.can_manage_onboarding(department_id));
create policy onboarding_pathways_insert on public.onboarding_pathways for insert to authenticated
  with check (organization_id = private.current_organization_id() and private.can_manage_onboarding(department_id));
create policy onboarding_pathways_update on public.onboarding_pathways for update to authenticated
  using (organization_id = private.current_organization_id() and private.can_manage_onboarding(department_id))
  with check (organization_id = private.current_organization_id() and private.can_manage_onboarding(department_id));

create policy onboarding_stages_select on public.onboarding_stages for select to authenticated
  using (private.can_manage_pathway(pathway_id));
create policy onboarding_stages_insert on public.onboarding_stages for insert to authenticated
  with check (private.can_manage_pathway(pathway_id));
create policy onboarding_stages_update on public.onboarding_stages for update to authenticated
  using (private.can_manage_pathway(pathway_id)) with check (private.can_manage_pathway(pathway_id));

create policy onboarding_steps_select on public.onboarding_steps for select to authenticated
  using (private.can_manage_pathway(pathway_id));
create policy onboarding_steps_insert on public.onboarding_steps for insert to authenticated
  with check (
    private.can_manage_pathway(pathway_id)
    and exists (select 1 from public.onboarding_stages s where s.id = stage_id and s.pathway_id = onboarding_steps.pathway_id)
  );
create policy onboarding_steps_update on public.onboarding_steps for update to authenticated
  using (private.can_manage_pathway(pathway_id))
  with check (
    private.can_manage_pathway(pathway_id)
    and exists (select 1 from public.onboarding_stages s where s.id = stage_id and s.pathway_id = onboarding_steps.pathway_id)
  );

-- Contacts: anyone who looks after a pathway the person is in, or any organisation-wide manager.
create policy onboarding_contacts_select on public.onboarding_contacts for select to authenticated
  using (
    organization_id = private.current_organization_id()
    and (
      private.can_manage_onboarding(null)
      or exists (select 1 from public.onboarding_entries e
                 where e.contact_id = onboarding_contacts.id and private.can_manage_pathway(e.pathway_id))
    )
  );

create policy onboarding_entries_select on public.onboarding_entries for select to authenticated
  using (private.can_manage_pathway(pathway_id));
create policy onboarding_events_select on public.onboarding_events for select to authenticated
  using (private.can_manage_entry(entry_id));
create policy onboarding_tasks_select on public.onboarding_tasks for select to authenticated
  using (assignee_id = (select auth.uid()) or private.can_manage_entry(entry_id));
create policy onboarding_outbox_select on public.onboarding_outbox for select to authenticated
  using (private.can_manage_entry(entry_id));

-- Private notes have their own policy (as mentoring's, SRS-RBAC-006): only the author reads them.
create policy onboarding_notes_select_shared on public.onboarding_notes for select to authenticated
  using (visibility = 'shared' and private.can_manage_entry(entry_id));
create policy onboarding_notes_select_private on public.onboarding_notes for select to authenticated
  using (visibility = 'private' and author_id = (select auth.uid()));
create policy onboarding_notes_insert on public.onboarding_notes for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_manage_entry(entry_id));

grant select, insert, update on public.onboarding_pathways, public.onboarding_stages, public.onboarding_steps
  to authenticated;
grant select on public.onboarding_contacts, public.onboarding_entries, public.onboarding_events,
  public.onboarding_tasks, public.onboarding_outbox to authenticated;
grant select, insert on public.onboarding_notes to authenticated;

-- ---------------------------------------------------------------------------
-- The engine
-- ---------------------------------------------------------------------------

-- The live steps of a pathway, in order: stage order, then step order.
create function private.onboarding_ordered_steps(p_pathway_id uuid)
returns table (step_id uuid, position integer)
language sql
stable
security definer
set search_path = ''
as $$
  select st.id, (row_number() over (order by sg.sort_order, sg.created_at, st.sort_order, st.created_at))::integer
  from public.onboarding_steps st
  join public.onboarding_stages sg on sg.id = st.stage_id and sg.archived_at is null
  where st.pathway_id = p_pathway_id and st.archived_at is null;
$$;
revoke all on function private.onboarding_ordered_steps(uuid) from public, anon, authenticated;

-- The people a follow-up can go to: holders of the role, scoped to the pathway's department when
-- the role is department scoped.
create function private.onboarding_pool(p_role_id uuid, p_department_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ur.user_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where ur.role_id = p_role_id and ur.revoked_at is null
    and (not r.department_scoped or ur.department_id is not distinct from p_department_id
         or p_department_id is null);
$$;
revoke all on function private.onboarding_pool(uuid, uuid) from public, anon, authenticated;

-- Taking turns: the person in the pool who was given this step longest ago (or never).
create function private.onboarding_next_in_turn(p_step_id uuid, p_role_id uuid, p_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pool.uid
  from private.onboarding_pool(p_role_id, p_department_id) as pool(uid)
  join public.profiles p on p.id = pool.uid
  left join lateral (
    select max(t.created_at) as last_at from public.onboarding_tasks t
    where t.step_id = p_step_id and t.assignee_id = pool.uid
  ) l on true
  order by l.last_at nulls first, p.display_name, p.id
  limit 1;
$$;
revoke all on function private.onboarding_next_in_turn(uuid, uuid, uuid) from public, anon, authenticated;

create function private.onboarding_log(p_entry uuid, p_step uuid, p_kind text, p_detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.onboarding_events (entry_id, step_id, kind, detail, actor_id)
  values (p_entry, p_step, p_kind, left(coalesce(p_detail, ''), 500), (select auth.uid()));
$$;
revoke all on function private.onboarding_log(uuid, uuid, text, text) from public, anon, authenticated;

-- Moves an entry on until it reaches a step that waits, or the end. Safe to call any time.
create function private.onboarding_run(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.onboarding_entries;
  v_step public.onboarding_steps;
  v_pathway public.onboarding_pathways;
  v_contact public.onboarding_contacts;
  v_task public.onboarding_tasks;
  v_next uuid;
  v_done boolean;
  v_course uuid;
  v_role uuid;
  v_assignee uuid;
  v_leader uuid;
  v_target uuid;
  v_guard integer := 0;
begin
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 60;
    select * into v_entry from public.onboarding_entries where id = p_entry_id for update;
    if not found or v_entry.status <> 'active' then
      return;
    end if;
    select * into v_pathway from public.onboarding_pathways where id = v_entry.pathway_id;
    select * into v_contact from public.onboarding_contacts where id = v_entry.contact_id;

    -- Start at the first step, or skip a step that was removed.
    if v_entry.current_step_id is null
       or not exists (select 1 from private.onboarding_ordered_steps(v_entry.pathway_id) o
                      where o.step_id = v_entry.current_step_id) then
      select o.step_id into v_next from private.onboarding_ordered_steps(v_entry.pathway_id) o
      order by o.position limit 1;
      if v_entry.current_step_id is not null then
        -- The removed step's place: continue with whatever now follows it in order.
        select o.step_id into v_next from private.onboarding_ordered_steps(v_entry.pathway_id) o
        join public.onboarding_steps s on s.id = o.step_id
        join public.onboarding_steps old on old.id = v_entry.current_step_id
        join public.onboarding_stages so on so.id = old.stage_id
        join public.onboarding_stages sn on sn.id = s.stage_id
        where (sn.sort_order, s.sort_order) > (so.sort_order, old.sort_order)
        order by o.position limit 1;
      end if;
      if v_next is null then
        update public.onboarding_entries set status = 'finished', finished_at = now(), current_step_id = null
         where id = v_entry.id;
        perform private.onboarding_log(v_entry.id, null, 'finished', 'Onboarding complete');
        return;
      end if;
      update public.onboarding_entries set current_step_id = v_next, step_started_at = now() where id = v_entry.id;
      continue;
    end if;

    select * into v_step from public.onboarding_steps where id = v_entry.current_step_id;
    v_done := false;

    case v_step.kind
      when 'trigger_form', 'trigger_manual', 'trigger_join', 'trigger_pco' then
        v_done := true;

      when 'email' then
        insert into public.onboarding_outbox (entry_id, step_id, contact_id, subject, body, status)
        select v_entry.id, v_step.id, v_contact.id,
               replace(coalesce(v_step.config ->> 'subject', v_step.title), '{first name}', split_part(v_contact.display_name, ' ', 1)),
               replace(coalesce(v_step.config ->> 'body', ''), '{first name}', split_part(v_contact.display_name, ' ', 1)),
               case when o.onboarding_emails_enabled then 'pending' else 'held' end
        from public.organizations o where o.id = v_entry.organization_id
        on conflict (entry_id, step_id) do nothing;
        perform private.onboarding_log(v_entry.id, v_step.id, 'email',
          case when (select o.onboarding_emails_enabled from public.organizations o where o.id = v_entry.organization_id)
               then 'Email queued' else 'Email ready (sending is off until launch)' end);
        v_done := true;

      when 'notify' then
        for v_leader in
          select * from private.onboarding_pool(nullif(v_step.config ->> 'role_id', '')::uuid, v_pathway.department_id)
          union
          select * from private.department_capability_holders('onboarding.manage', v_pathway.department_id)
           where nullif(v_step.config ->> 'role_id', '') is null
        loop
          perform private.notify(v_leader, 'onboarding_update'::public.notification_kind,
            left(v_step.title || ': ' || v_contact.display_name, 200), v_pathway.name,
            '/admin/onboarding/people', 'onboarding-update:' || v_entry.id || ':' || v_step.id || ':' || v_leader);
        end loop;
        perform private.onboarding_log(v_entry.id, v_step.id, 'notified', v_step.title);
        v_done := true;

      when 'task', 'mentor', 'pco_team' then
        select * into v_task from public.onboarding_tasks where entry_id = v_entry.id and step_id = v_step.id;
        if not found then
          v_role := nullif(v_step.config ->> 'role_id', '')::uuid;
          v_assignee := case coalesce(v_step.config ->> 'mode', 'turns')
            when 'person' then nullif(v_step.config ->> 'person_id', '')::uuid
            when 'claim' then null
            else private.onboarding_next_in_turn(v_step.id, v_role, v_pathway.department_id) end;
          insert into public.onboarding_tasks (entry_id, step_id, kind, title, detail, pool_role_id, assignee_id, due_at)
          values (v_entry.id, v_step.id,
                  case v_step.kind when 'task' then 'follow_up' else v_step.kind::text end,
                  v_step.title, coalesce(v_step.config ->> 'detail', ''), v_role, v_assignee,
                  now() + make_interval(hours => coalesce(nullif(v_step.config ->> 'due_hours', '')::integer, 72)))
          returning * into v_task;
          for v_leader in
            select v_assignee where v_assignee is not null
            union
            select * from private.onboarding_pool(v_role, v_pathway.department_id) where v_assignee is null
          loop
            perform private.notify(v_leader, 'onboarding_task'::public.notification_kind,
              left(v_step.title || ': ' || v_contact.display_name, 200),
              case when v_assignee is null then 'Anyone can take this one.' else 'This one is yours.' end,
              '/admin/onboarding/follow-ups', 'onboarding-task:' || v_task.id || ':' || v_leader);
          end loop;
          perform private.onboarding_log(v_entry.id, v_step.id, 'task_created', v_step.title);
        end if;
        -- Planning Center: done when the sync has them on that position's team.
        if v_step.kind = 'pco_team' and v_task.done_at is null and v_contact.user_id is not null
           and exists (select 1 from public.serving_team_members m
                       where m.user_id = v_contact.user_id and m.removed_at is null
                         and m.role_id = nullif(v_step.config ->> 'serving_role_id', '')::uuid) then
          perform private.onboarding_log(v_entry.id, v_step.id, 'task_done', 'On the team in Planning Center');
          -- The task's trigger runs the entry on from here, so stop this pass.
          update public.onboarding_tasks set done_at = now() where id = v_task.id;
          return;
        end if;
        v_done := v_task.done_at is not null;

      when 'course' then
        v_course := nullif(v_step.config ->> 'course_id', '')::uuid;
        if v_contact.user_id is not null and v_course is not null then
          -- Membership opens the course's lessons (as an invitation does); it never approves anyone to serve.
          select c.department_id into v_target from public.courses c where c.id = v_course;
          if v_target is not null and not exists (
            select 1 from public.department_memberships m
            where m.user_id = v_contact.user_id and m.department_id = v_target and m.status = 'active'
          ) then
            update public.department_memberships m
               set status = 'active', decided_at = now(), decision_reason = 'Onboarding: ' || v_pathway.name
             where m.user_id = v_contact.user_id and m.department_id = v_target and m.status = 'requested';
            if not found then
              insert into public.department_memberships (department_id, user_id, status, decided_at, decision_reason)
              values (v_target, v_contact.user_id, 'active', now(), 'Onboarding: ' || v_pathway.name);
            end if;
          end if;
          v_done := private.course_requirements_met(v_contact.user_id, v_course);
          if v_done then
            perform private.onboarding_log(v_entry.id, v_step.id, 'course_done', v_step.title);
          end if;
        end if;

      when 'wait' then
        v_done := now() >= v_entry.step_started_at
          + make_interval(days => coalesce(nullif(v_step.config ->> 'days', '')::integer, 3));

      when 'branch' then
        if v_entry.chosen_department_id is not null then
          insert into public.onboarding_entries (organization_id, pathway_id, contact_id, came_in_by)
          select v_entry.organization_id, p.id, v_entry.contact_id, 'branch'
          from public.onboarding_pathways p
          where p.department_id = v_entry.chosen_department_id and p.archived_at is null
          on conflict do nothing;
          perform private.onboarding_log(v_entry.id, v_step.id, 'chose_department',
            (select d.name from public.departments d where d.id = v_entry.chosen_department_id));
          v_done := true;
        end if;

      when 'finish' then
        update public.onboarding_entries set status = 'finished', finished_at = now() where id = v_entry.id;
        perform private.onboarding_log(v_entry.id, v_step.id, 'finished', 'Onboarding complete');
        return;
    end case;

    if not v_done then
      return;
    end if;

    -- On to the next step in order, or finish.
    select o2.step_id into v_next
    from private.onboarding_ordered_steps(v_entry.pathway_id) o1
    join private.onboarding_ordered_steps(v_entry.pathway_id) o2 on o2.position = o1.position + 1
    where o1.step_id = v_step.id;
    if v_next is null then
      update public.onboarding_entries set status = 'finished', finished_at = now(), current_step_id = null
       where id = v_entry.id;
      perform private.onboarding_log(v_entry.id, null, 'finished', 'Onboarding complete');
      return;
    end if;
    update public.onboarding_entries set current_step_id = v_next, step_started_at = now() where id = v_entry.id;
  end loop;
end;
$$;
revoke all on function private.onboarding_run(uuid) from public, anon, authenticated;

-- A new entry starts straight away.
create function private.onboarding_entry_started()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.onboarding_log(new.id, null, 'started', new.came_in_by);
  perform private.onboarding_run(new.id);
  return null;
end;
$$;
create trigger onboarding_entries_start after insert on public.onboarding_entries
  for each row execute function private.onboarding_entry_started();

-- A finished task moves its entry on.
create function private.onboarding_task_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.done_at is not null and old.done_at is null then
    perform private.onboarding_run(new.entry_id);
  end if;
  return null;
end;
$$;
create trigger onboarding_tasks_done after update of done_at on public.onboarding_tasks
  for each row execute function private.onboarding_task_done();

-- Starts the general pathway for a contact, if it has this way in and they aren't already in it.
create function private.onboarding_enter(p_contact_id uuid, p_pathway_id uuid, p_way public.onboarding_step_kind, p_came_in_by text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pathway_id is null or not exists (
    select 1 from public.onboarding_steps s where s.pathway_id = p_pathway_id and s.kind = p_way and s.archived_at is null
  ) then
    return;
  end if;
  insert into public.onboarding_entries (organization_id, pathway_id, contact_id, came_in_by)
  select p.organization_id, p.id, p_contact_id, p_came_in_by
  from public.onboarding_pathways p where p.id = p_pathway_id and p.archived_at is null
  on conflict do nothing;
end;
$$;
revoke all on function private.onboarding_enter(uuid, uuid, public.onboarding_step_kind, text) from public, anon, authenticated;

-- Contacts link to an account by email when the person signs in for the first time, or now.
create function private.onboarding_link_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.onboarding_contacts c set user_id = new.id
   where c.user_id is null and c.organization_id = new.organization_id
     and lower(c.email) = (select lower(u.email) from auth.users u where u.id = new.id);
  return null;
end;
$$;
create trigger profiles_onboarding_link after insert on public.profiles
  for each row execute function private.onboarding_link_contact();

-- Joining a department starts that department's pathway, if it has "Joins a department" as a way in.
create function private.onboarding_on_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid;
  v_pathway uuid;
  v_profile public.profiles;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return null;
  end if;
  select p.id into v_pathway from public.onboarding_pathways p
   where p.department_id = new.department_id and p.archived_at is null;
  if v_pathway is null then
    return null;
  end if;
  select * into v_profile from public.profiles where id = new.user_id;
  insert into public.onboarding_contacts (organization_id, display_name, email, user_id, source)
  select v_profile.organization_id, v_profile.display_name, u.email, v_profile.id, 'join'
  from auth.users u where u.id = new.user_id and u.email is not null
  on conflict (organization_id, lower(email)) do update set user_id = excluded.user_id
  returning id into v_contact;
  if v_contact is not null then
    perform private.onboarding_enter(v_contact, v_pathway, 'trigger_join', 'join');
  end if;
  return null;
end;
$$;
create trigger department_memberships_onboarding after insert or update of status on public.department_memberships
  for each row execute function private.onboarding_on_membership();

-- Progress elsewhere moves people on: finished lessons, and team places from Planning Center.
create function private.onboarding_run_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry uuid;
begin
  for v_entry in
    select e.id from public.onboarding_entries e
    join public.onboarding_contacts c on c.id = e.contact_id
    where c.user_id = p_user_id and e.status = 'active'
  loop
    perform private.onboarding_run(v_entry);
  end loop;
end;
$$;
revoke all on function private.onboarding_run_for_user(uuid) from public, anon, authenticated;

create function private.onboarding_progress_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.onboarding_run_for_user(new.user_id);
  return null;
end;
$$;
create trigger lesson_progress_onboarding after insert or update of status on public.lesson_progress
  for each row when (new.status = 'completed')
  execute function private.onboarding_progress_changed();
create trigger serving_team_members_onboarding after insert on public.serving_team_members
  for each row execute function private.onboarding_progress_changed();

-- The 15-minute job: waits that have run their time, and anything else that changed.
create function public.run_onboarding()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry uuid;
  v_count integer := 0;
begin
  for v_entry in select e.id from public.onboarding_entries e where e.status = 'active' loop
    perform private.onboarding_run(v_entry);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.run_onboarding() from public, anon, authenticated;
grant execute on function public.run_onboarding() to service_role;

-- ---------------------------------------------------------------------------
-- What people do
-- ---------------------------------------------------------------------------

-- The public "I want to serve" page. Anyone may call it; it always answers the same way, so it
-- never reveals whether an email is known. The website field is a trap for bots.
create function public.submit_interest(
  p_name text, p_email text, p_phone text, p_message text, p_interests uuid[], p_website text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_contact uuid;
  v_pathway uuid;
begin
  if coalesce(p_website, '') <> '' then
    return;
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120
     or length(trim(coalesce(p_email, ''))) not between 3 and 254 or p_email not like '%_@_%' then
    raise exception 'invalid_interest' using errcode = '22023';
  end if;
  select o.id into v_org from public.organizations o order by o.created_at limit 1;
  insert into public.onboarding_contacts (organization_id, display_name, email, phone, message, interests, source, user_id)
  values (v_org, trim(p_name), lower(trim(p_email)), left(trim(coalesce(p_phone, '')), 40),
          left(trim(coalesce(p_message, '')), 1000),
          coalesce((select array_agg(d.id) from public.departments d
                    where d.id = any(coalesce(p_interests, '{}')) and d.status <> 'inactive'), '{}'),
          'form',
          (select p.id from public.profiles p join auth.users u on u.id = p.id
            where lower(u.email) = lower(trim(p_email)) limit 1))
  on conflict (organization_id, lower(email)) do update
    set message = case when excluded.message <> '' then excluded.message else onboarding_contacts.message end,
        interests = excluded.interests
  returning id into v_contact;
  select p.id into v_pathway from public.onboarding_pathways p
   where p.organization_id = v_org and p.department_id is null and p.archived_at is null;
  perform private.onboarding_enter(v_contact, v_pathway, 'trigger_form', 'form');
end;
$$;
revoke all on function public.submit_interest(text, text, text, text, uuid[], text) from public;
grant execute on function public.submit_interest(text, text, text, text, uuid[], text) to anon, authenticated;

-- A leader adds someone to a pathway they look after.
create function public.onboarding_add_person(p_pathway_id uuid, p_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid;
  v_org uuid;
  v_entry uuid;
begin
  if not private.can_manage_pathway(p_pathway_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 or coalesce(p_email, '') not like '%_@_%' then
    raise exception 'invalid_person' using errcode = '22023';
  end if;
  v_org := private.current_organization_id();
  insert into public.onboarding_contacts (organization_id, display_name, email, source, user_id)
  values (v_org, trim(p_name), lower(trim(p_email)), 'manual',
          (select p.id from public.profiles p join auth.users u on u.id = p.id
            where lower(u.email) = lower(trim(p_email)) limit 1))
  on conflict (organization_id, lower(email)) do update set display_name = onboarding_contacts.display_name
  returning id into v_contact;
  if exists (select 1 from public.onboarding_entries e
             where e.pathway_id = p_pathway_id and e.contact_id = v_contact and e.status = 'active') then
    raise exception 'already_in_pathway' using errcode = 'P0001';
  end if;
  insert into public.onboarding_entries (organization_id, pathway_id, contact_id, came_in_by)
  values (v_org, p_pathway_id, v_contact, 'manual')
  returning id into v_entry;
  return v_entry;
end;
$$;
revoke all on function public.onboarding_add_person(uuid, text, text) from public, anon;
grant execute on function public.onboarding_add_person(uuid, text, text) to authenticated;

-- Tick a follow-up: its assignee, or anyone who looks after the pathway.
create function public.onboarding_complete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.onboarding_tasks;
begin
  select * into v_task from public.onboarding_tasks where id = p_task_id for update;
  if not found or not (v_task.assignee_id = (select auth.uid()) or private.can_manage_entry(v_task.entry_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_task.kind = 'pco_team' then
    raise exception 'completes_from_planning_center' using errcode = 'P0001';
  end if;
  if v_task.done_at is null then
    perform private.onboarding_log(v_task.entry_id, v_task.step_id, 'task_done', v_task.title);
    update public.onboarding_tasks set done_at = now(), done_by = (select auth.uid()) where id = p_task_id;
  end if;
end;
$$;
revoke all on function public.onboarding_complete_task(uuid) from public, anon;
grant execute on function public.onboarding_complete_task(uuid) to authenticated;

-- "I'll take this": anyone in the task's pool, or who looks after the pathway.
create function public.onboarding_claim_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.onboarding_tasks;
  v_department uuid;
begin
  select t.* into v_task from public.onboarding_tasks t where t.id = p_task_id for update;
  select p.department_id into v_department from public.onboarding_entries e
    join public.onboarding_pathways p on p.id = e.pathway_id where e.id = v_task.entry_id;
  if v_task.id is null or not (
    (select auth.uid()) in (select * from private.onboarding_pool(v_task.pool_role_id, v_department))
    or private.can_manage_entry(v_task.entry_id)
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_task.assignee_id is not null then
    raise exception 'already_taken' using errcode = 'P0001';
  end if;
  update public.onboarding_tasks set assignee_id = (select auth.uid()) where id = p_task_id;
  perform private.onboarding_log(v_task.entry_id, v_task.step_id, 'task_claimed',
    (select p.display_name from public.profiles p where p.id = (select auth.uid())));
end;
$$;
revoke all on function public.onboarding_claim_task(uuid) from public, anon;
grant execute on function public.onboarding_claim_task(uuid) to authenticated;

-- Hand a follow-up to someone else in its pool (anyone who looks after the pathway may).
create function public.onboarding_assign_task(p_task_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.onboarding_tasks;
  v_department uuid;
begin
  select t.* into v_task from public.onboarding_tasks t where t.id = p_task_id for update;
  if v_task.id is null or not private.can_manage_entry(v_task.entry_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select p.department_id into v_department from public.onboarding_entries e
    join public.onboarding_pathways p on p.id = e.pathway_id where e.id = v_task.entry_id;
  if p_user_id not in (select * from private.onboarding_pool(v_task.pool_role_id, v_department))
     and p_user_id not in (select * from private.department_capability_holders('onboarding.manage', v_department)) then
    raise exception 'not_in_pool' using errcode = 'P0001';
  end if;
  update public.onboarding_tasks set assignee_id = p_user_id where id = p_task_id;
  perform private.onboarding_log(v_task.entry_id, v_task.step_id, 'task_assigned',
    (select p.display_name from public.profiles p where p.id = p_user_id));
  perform private.notify(p_user_id, 'onboarding_task'::public.notification_kind,
    left(v_task.title, 200), 'This one is yours now.', '/admin/onboarding/follow-ups',
    'onboarding-task:' || v_task.id || ':' || p_user_id || ':' || extract(epoch from now())::bigint);
end;
$$;
revoke all on function public.onboarding_assign_task(uuid, uuid) from public, anon;
grant execute on function public.onboarding_assign_task(uuid, uuid) to authenticated;

-- Stop someone's onboarding (they changed their mind). Their history stays.
create function public.onboarding_stop(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_entry(p_entry_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.onboarding_entries set status = 'stopped', finished_at = now()
   where id = p_entry_id and status = 'active';
  perform private.onboarding_log(p_entry_id, null, 'stopped', '');
end;
$$;
revoke all on function public.onboarding_stop(uuid) from public, anon;
grant execute on function public.onboarding_stop(uuid) to authenticated;

-- The volunteer's own view: their pathways, every step with where they are, and their contact.
create function public.my_onboarding()
returns table (
  entry_id uuid, pathway_name text, status public.onboarding_entry_status,
  step_id uuid, step_title text, step_kind public.onboarding_step_kind, stage_name text, stage_timing text,
  step_position integer, current_position integer, contact_name text, chosen_department_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, p.name, e.status, s.id, s.title, s.kind, sg.name, sg.timing, o.position,
         (select o2.position from private.onboarding_ordered_steps(e.pathway_id) o2 where o2.step_id = e.current_step_id),
         (select pr.display_name from public.onboarding_tasks t join public.profiles pr on pr.id = t.assignee_id
           where t.entry_id = e.id and t.done_at is null order by t.created_at desc limit 1),
         e.chosen_department_id
  from public.onboarding_entries e
  join public.onboarding_contacts c on c.id = e.contact_id and c.user_id = (select auth.uid())
  join public.onboarding_pathways p on p.id = e.pathway_id
  join private.onboarding_ordered_steps(e.pathway_id) o on true
  join public.onboarding_steps s on s.id = o.step_id
  join public.onboarding_stages sg on sg.id = s.stage_id
  where e.status in ('active', 'finished') and s.kind not in ('trigger_form', 'trigger_manual', 'trigger_join', 'trigger_pco')
    and private.is_active_user()
  order by e.started_at, o.position;
$$;
revoke all on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;

-- The volunteer picks a department at a "Choose a department" step.
create function public.onboarding_choose_department(p_entry_id uuid, p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.onboarding_entries e
    join public.onboarding_contacts c on c.id = e.contact_id
    join public.onboarding_steps s on s.id = e.current_step_id and s.kind = 'branch'
    where e.id = p_entry_id and e.status = 'active' and c.user_id = (select auth.uid())
  ) or not exists (select 1 from public.departments d where d.id = p_department_id and d.status = 'active') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.onboarding_entries set chosen_department_id = p_department_id where id = p_entry_id;
  perform private.onboarding_run(p_entry_id);
end;
$$;
revoke all on function public.onboarding_choose_department(uuid, uuid) from public, anon;
grant execute on function public.onboarding_choose_department(uuid, uuid) to authenticated;
