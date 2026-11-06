-- Tells people about changes a leader makes to them (G, 2026-11-06). Bad news is worded gently and
-- says what they can do next. Each one names who acted where that helps, never the private reason
-- for a decline or removal, which stays with leaders.

-- The person who acted, by the name others see, or a neutral stand-in.
create function private.actor_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(trim(p.display_name), '') from public.profiles p where p.id = p_id),
    'A leader');
$$;
revoke all on function private.actor_name(uuid) from public, anon, authenticated;

-- A course's title: the published version, or its newest one.
create function private.course_title(p_course_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select v.title from public.course_versions v
      where v.course_id = p_course_id
      order by (v.status = 'published') desc, v.version_number desc limit 1),
    'a course');
$$;
revoke all on function private.course_title(uuid) from public, anon, authenticated;

-- A role is removed.
create function private.notify_role_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_department text;
begin
  if old.revoked_at is not null or new.revoked_at is null
     or new.revoked_by is null or new.revoked_by = new.user_id then
    return null;
  end if;
  select r.name into v_role from public.roles r where r.id = new.role_id and r.key <> 'volunteer';
  if v_role is null then
    return null;
  end if;
  select d.name into v_department from public.departments d where d.id = new.department_id;
  perform private.notify(new.user_id, 'role_removed',
    'You''re no longer ' || v_role
      || coalesce(' for ' || v_department, ''),
    private.actor_name(new.revoked_by) || ' removed this role. If you think it''s a mistake, talk to them.',
    '/profile',
    'role_removed:' || new.id);
  return null;
end;
$$;
revoke all on function private.notify_role_removed() from public, anon, authenticated;
create trigger user_roles_notify_removed after update of revoked_at on public.user_roles
  for each row execute function private.notify_role_removed();

-- A request to join is declined, or a member is removed.
create function private.notify_membership_ended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department text;
begin
  if new.status is not distinct from old.status or new.status not in ('declined', 'removed') then
    return null;
  end if;
  select d.name into v_department from public.departments d where d.id = new.department_id;
  if new.status = 'declined' then
    perform private.notify(new.user_id, 'membership_declined',
      'Your request to join ' || coalesce(v_department, 'the department') || ' wasn''t accepted',
      'You can ask again later, or talk to the department leader. Every course stays open to you.',
      '/home',
      'membership_declined:' || new.id || ':' || coalesce(new.decided_at, now())::text);
  else
    perform private.notify(new.user_id, 'membership_removed',
      'You''re no longer a member of ' || coalesce(v_department, 'the department'),
      'Talk to the department leader if you have questions. Your training and certificates stay with you.',
      '/profile',
      'membership_removed:' || new.id || ':' || coalesce(new.decided_at, now())::text);
  end if;
  return null;
end;
$$;
revoke all on function private.notify_membership_ended() from public, anon, authenticated;
create trigger department_memberships_notify_ended after update of status on public.department_memberships
  for each row execute function private.notify_membership_ended();

-- A leader pauses one of someone's skills, which can pause their approval to serve.
create function private.notify_skill_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_skill text;
begin
  if new.status <> 'suspended' or old.status = 'suspended' then
    return null;
  end if;
  select c.name into v_skill from public.competencies c where c.id = new.competency_id;
  perform private.notify(new.user_id, 'skill_suspended',
    'A skill is paused: ' || coalesce(v_skill, 'one of your skills'),
    'Roles that need it are paused until a leader restores it. Your leader can tell you what to work on.',
    '/profile',
    'skill_suspended:' || new.id || ':' || coalesce(new.suspended_at, now())::text);
  return null;
end;
$$;
revoke all on function private.notify_skill_suspended() from public, anon, authenticated;
create trigger competency_records_notify_suspended after update of status on public.competency_records
  for each row execute function private.notify_skill_suspended();

-- A certificate is withdrawn.
create function private.notify_certificate_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.revoked_at is not null or new.revoked_at is null then
    return null;
  end if;
  perform private.notify(new.user_id, 'certificate_withdrawn',
    'A certificate was withdrawn: ' || new.course_title,
    'A leader withdrew it, so it no longer counts. Talk to them if you think it''s a mistake.',
    '/profile',
    'certificate_withdrawn:' || new.id);
  return null;
end;
$$;
revoke all on function private.notify_certificate_withdrawn() from public, anon, authenticated;
create trigger certificates_notify_withdrawn after update of revoked_at on public.certificates
  for each row execute function private.notify_certificate_withdrawn();

-- Someone is given another go at a quiz.
create function private.notify_quiz_attempt_granted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz text;
begin
  select q.title into v_quiz
    from public.quizzes q
    join public.course_versions v on v.id = q.course_version_id
   where q.quiz_key = new.quiz_key and v.course_id = new.course_id
   order by (v.status = 'published') desc, v.version_number desc
   limit 1;
  perform private.notify(new.user_id, 'quiz_attempt_granted',
    'Another try: ' || coalesce(v_quiz, 'your quiz'),
    private.actor_name(new.granted_by) || ' gave you another attempt at this quiz in '
      || private.course_title(new.course_id) || '.',
    '/courses/' || new.course_id,
    'quiz_attempt_granted:' || new.id);
  return null;
end;
$$;
revoke all on function private.notify_quiz_attempt_granted() from public, anon, authenticated;
create trigger quiz_attempt_allowances_notify after insert on public.quiz_attempt_allowances
  for each row execute function private.notify_quiz_attempt_granted();

-- A scheduled spot is cancelled. A whole service cancelled already says so (service_changed).
create function private.notify_assignment_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_role text;
begin
  if new.status <> 'cancelled' or old.status not in ('pending', 'confirmed') then
    return null;
  end if;
  select * into v_event from public.events e where e.id = new.event_id;
  if v_event.id is null or v_event.cancelled_at is not null or v_event.ends_at < now() then
    return null;
  end if;
  select r.name into v_role from public.serving_roles r where r.id = new.role_id;
  perform private.notify(new.user_id, 'assignment_cancelled',
    'You''re no longer scheduled: ' || coalesce(v_role, 'your position'),
    v_event.title || ', '
      || to_char(v_event.starts_at at time zone 'America/Winnipeg', 'FMMon FMDD, YYYY')
      || '. Nothing else changes.',
    '/schedule',
    'assignment_cancelled:' || new.id);
  return null;
end;
$$;
revoke all on function private.notify_assignment_cancelled() from public, anon, authenticated;
create trigger event_assignments_notify_cancelled after update of status on public.event_assignments
  for each row execute function private.notify_assignment_cancelled();

-- Mentoring ends: both people hear.
create function private.notify_mentoring_ended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ended_at is not null or new.ended_at is null then
    return null;
  end if;
  perform private.notify(new.mentee_id, 'mentoring_ended',
    'Your mentoring with ' || private.actor_name(new.mentor_id) || ' has ended',
    'Your shared notes stay in Mentoring. Thank them for their time.',
    '/mentoring',
    'mentoring_ended:' || new.id || ':mentee');
  perform private.notify(new.mentor_id, 'mentoring_ended',
    'Your mentoring with ' || private.actor_name(new.mentee_id) || ' has ended',
    'Your shared notes stay in Mentoring. Thank you for your time.',
    '/mentoring',
    'mentoring_ended:' || new.id || ':mentor');
  return null;
end;
$$;
revoke all on function private.notify_mentoring_ended() from public, anon, authenticated;
create trigger mentor_relationships_notify_ended after update of ended_at on public.mentor_relationships
  for each row execute function private.notify_mentoring_ended();

-- A course a leader asked someone to take is no longer asked of them.
create function private.notify_course_unassigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.removed_at is not null or new.removed_at is null then
    return null;
  end if;
  perform private.notify(new.user_id, 'course_unassigned',
    'No longer assigned: ' || private.course_title(new.course_id),
    'A leader no longer needs you to take this course. It stays open if you''d like to carry on.',
    '/courses/' || new.course_id,
    'course_unassigned:' || new.id);
  return null;
end;
$$;
revoke all on function private.notify_course_unassigned() from public, anon, authenticated;
create trigger course_assignments_notify_removed after update of removed_at on public.course_assignments
  for each row execute function private.notify_course_unassigned();
