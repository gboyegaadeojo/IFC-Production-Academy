-- Topics beside departments (G, 2026-11-04; docs/decisions/2026-11-04-course-categories.md).
-- Every course sits in one category. A team is a department people join. A topic, such as General or
-- Leadership, is courses only: no members, positions, competencies, or practicals. Keeping topics in
-- this table means permissions, publishing, versions, and certificates work the same for both.
-- Topics are data: adding one is a row, not code.

create type public.department_kind as enum ('team', 'topic');

alter table public.departments
  add column kind public.department_kind not null default 'team',
  add column uses_levels boolean not null default true,
  add constraint departments_teams_use_levels check (kind = 'topic' or uses_levels);

-- A category without levels still has one level row underneath, which pages never show. Courses,
-- progress, and reports all rely on a course having a level.
create or replace function private.create_default_levels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.uses_levels then
    insert into public.levels (department_id, number, name)
    values (new.id, 1, 'Foundations'), (new.id, 2, 'Proficiency'), (new.id, 3, 'Advanced and Leadership');
  else
    insert into public.levels (department_id, number, name) values (new.id, 1, 'Courses');
  end if;
  return null;
end;
$$;

insert into public.departments
  (id, organization_id, slug, name, summary, status, kind, uses_levels, hue, icon, sort_order) values
  ('3f0c3a6e-6a55-4f0e-9a7e-0c1d6a2b7e11', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'general',
   'General',
   'Courses for everyone on the production team, whichever department you serve in.',
   'active', 'topic', false, 'cyan', 'people', 1),
  ('7b2e9d14-1c3f-4a86-8d52-5e9f0b3c6a22', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'leadership',
   'Leadership',
   'Looking after the people you serve with, and growing as a leader.',
   'active', 'topic', true, 'pink', 'leadership', 2)
on conflict do nothing;

-- Nobody joins a topic, whichever way they try. request_membership's callers already know this
-- message: "This department isn't taking requests yet."
create function private.reject_topic_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.departments d where d.id = new.department_id and d.kind = 'topic') then
    raise exception 'department_not_open' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger department_memberships_not_topics before insert on public.department_memberships
  for each row execute function private.reject_topic_membership();

-- Positions, competencies, and practicals prove a skill for a team. Topics have none (G, 2026-11-04).
create function private.reject_topic_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.departments d where d.id = new.department_id and d.kind = 'topic') then
    raise exception 'topic_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger competencies_not_topics before insert on public.competencies
  for each row execute function private.reject_topic_department();
create trigger serving_roles_not_topics before insert on public.serving_roles
  for each row execute function private.reject_topic_department();

create function private.reject_topic_practical()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.course_versions v
    join public.courses c on c.id = v.course_id
    join public.departments d on d.id = c.department_id
    where v.id = new.course_version_id and d.kind = 'topic'
  ) then
    raise exception 'topic_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger practicals_not_topics before insert on public.practicals
  for each row execute function private.reject_topic_practical();

revoke all on function private.reject_topic_membership() from public, anon, authenticated;
revoke all on function private.reject_topic_department() from public, anon, authenticated;
revoke all on function private.reject_topic_practical() from public, anon, authenticated;

-- A certificate from a category without levels has no level to print.
alter table public.certificates alter column level_number drop not null;

create function private.certificate_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.departments d where d.id = new.department_id and not d.uses_levels) then
    new.level_number := null;
  end if;
  return new;
end;
$$;
revoke all on function private.certificate_level() from public, anon, authenticated;
create trigger certificates_level before insert on public.certificates
  for each row execute function private.certificate_level();

-- "What interests you?" and "Choose a department" are about teams.
create or replace function public.open_departments()
returns table (id uuid, name text, hue text, icon text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.hue, d.icon
  from public.departments d
  where d.status = 'active' and d.kind = 'team'
  order by d.sort_order, d.name;
$$;

create or replace function private.onboarding_offered_departments(p_step_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(s.config -> 'department_ids') = 'array'
         and jsonb_array_length(s.config -> 'department_ids') > 0
    then array(
      select d.id from public.departments d
      where d.status = 'active' and d.kind = 'team' and d.organization_id = p.organization_id
        and d.id::text in (select jsonb_array_elements_text(s.config -> 'department_ids'))
      order by d.sort_order)
    else array(
      select d.id from public.departments d
      where d.status = 'active' and d.kind = 'team' and d.organization_id = p.organization_id
      order by d.sort_order)
  end
  from public.onboarding_steps s
  join public.onboarding_pathways p on p.id = s.pathway_id
  where s.id = p_step_id;
$$;

-- A course step in a topic moves on when the course is finished, without joining anything. The rest
-- of this function is as it was (20261205120000_onboarding_pathways.sql).
create or replace function private.onboarding_run(p_entry_id uuid)
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
      order by o.step_order limit 1;
      if v_entry.current_step_id is not null then
        -- The removed step's place: continue with whatever now follows it in order.
        select o.step_id into v_next from private.onboarding_ordered_steps(v_entry.pathway_id) o
        join public.onboarding_steps s on s.id = o.step_id
        join public.onboarding_steps old on old.id = v_entry.current_step_id
        join public.onboarding_stages so on so.id = old.stage_id
        join public.onboarding_stages sn on sn.id = s.stage_id
        where (sn.sort_order, s.sort_order) > (so.sort_order, old.sort_order)
        order by o.step_order limit 1;
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
          -- Membership is for team departments; a topic has nothing to join. It never approves anyone to serve.
          select c.department_id into v_target from public.courses c where c.id = v_course;
          if v_target is not null and exists (
            select 1 from public.departments d where d.id = v_target and d.kind = 'team'
          ) and not exists (
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
    join private.onboarding_ordered_steps(v_entry.pathway_id) o2 on o2.step_order = o1.step_order + 1
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
