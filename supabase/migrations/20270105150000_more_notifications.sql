-- More events, and which way each one travels (G, 2026-11-05; docs/decisions/2026-11-05-alerts.md).
-- * Everything shows in the app. Low-priority news stays there.
-- * Someone with alerts on a phone gets no routine email; only a changed or cancelled service still
--   comes by email too. Someone without gets email as they've chosen.
-- * Each person chooses by kind what reaches their phone.
-- All of it still waits behind the launch switch. Mentors' private notes never notify anyone.

alter table public.notification_preferences add column push boolean not null default true;

create function public.set_notification_push(p_kind public.notification_kind, p_push boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.notification_preferences as p (user_id, kind, email, push)
  values ((select auth.uid()), p_kind, true, p_push)
  on conflict (user_id, kind) do update set push = excluded.push, updated_at = now();
end;
$$;
revoke all on function public.set_notification_push(public.notification_kind, boolean) from public, anon;
grant execute on function public.set_notification_push(public.notification_kind, boolean) to authenticated;

-- Runs after the launch hold and only ever turns channels off, so it can't undo that hold.
create function private.route_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('certificate_ready', 'new_course', 'sop_updated') then
    new.email_status := 'skipped';
    new.push_status := 'none';
    return new;
  end if;
  if exists (
    select 1 from public.notification_preferences p
    where p.user_id = new.user_id and p.kind = new.kind and not p.push
  ) then
    new.push_status := 'none';
  end if;
  if new.kind <> 'service_changed' and exists (
    select 1 from public.push_subscriptions s
    where s.user_id = new.user_id and private.is_phone_label(s.device_label)
  ) and not exists (
    select 1 from public.notification_preferences p
    where p.user_id = new.user_id and p.kind = new.kind and not p.push
  ) then
    new.email_status := 'skipped';
  end if;
  return new;
end;
$$;
revoke all on function private.route_notification() from public, anon, authenticated;
create trigger notifications_route before insert on public.notifications
  for each row execute function private.route_notification();

-- A service cancelled or moved, to everyone still on it. Placeholders hold a date until Planning
-- Center's real service arrives, so they don't count.
create function private.notify_service_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_cancelled boolean := old.cancelled_at is null and new.cancelled_at is not null;
begin
  if old.is_placeholder or new.is_placeholder or old.starts_at <= now() then
    return null;
  end if;
  if not v_cancelled and (new.cancelled_at is not null or new.starts_at = old.starts_at) then
    return null;
  end if;
  for v_row in
    select a.user_id, r.name as role_name
    from public.event_assignments a
    join public.serving_roles r on r.id = a.role_id
    join public.profiles p on p.id = a.user_id and p.status = 'active'
    where a.event_id = new.id and a.status in ('pending', 'confirmed')
  loop
    perform private.notify(v_row.user_id, 'service_changed',
      case when v_cancelled then 'Service cancelled: ' else 'Service moved: ' end || new.title,
      case when v_cancelled
           then 'You don''t need to serve as ' || v_row.role_name || ' at this service.'
           else 'It''s now ' || private.winnipeg_when(new.starts_at) || '. You''re serving as ' ||
             v_row.role_name || '.' end,
      '/schedule',
      'service_changed:' || new.id || ':' || v_row.user_id || ':' ||
        case when v_cancelled then 'cancelled' else new.starts_at::text end);
  end loop;
  return null;
end;
$$;
revoke all on function private.notify_service_changed() from public, anon, authenticated;
create trigger events_notify_changed after update of cancelled_at, starts_at on public.events
  for each row execute function private.notify_service_changed();

-- Someone asks to join a department, to those who can approve it.
create function private.notify_join_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_holder uuid;
  v_person text;
  v_department text;
begin
  if new.status <> 'requested' or (tg_op = 'UPDATE' and old.status = 'requested') then
    return null;
  end if;
  select coalesce(p.display_name, 'Someone') into v_person from public.profiles p where p.id = new.user_id;
  select d.name into v_department from public.departments d where d.id = new.department_id;
  for v_holder in
    select * from private.department_capability_holders('member.approve', new.department_id)
  loop
    continue when v_holder = new.user_id;
    perform private.notify(v_holder, 'join_requested',
      v_person || ' asked to join ' || v_department,
      'Review their request when you have a moment.',
      '/admin/members',
      'join_requested:' || new.id || ':' || v_holder || ':' || now()::date);
  end loop;
  return null;
end;
$$;
revoke all on function private.notify_join_requested() from public, anon, authenticated;
create trigger department_memberships_notify_requested
  after insert or update of status on public.department_memberships
  for each row execute function private.notify_join_requested();

-- Approved to Serve: the record follows a passed practical, and this tells the person.
create function private.notify_approved_to_serve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if new.status <> 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then
    return null;
  end if;
  select r.name into v_role from public.serving_roles r where r.id = new.role_id;
  perform private.notify(new.user_id, 'approved_to_serve',
    'Approved to serve: ' || coalesce(v_role, 'a serving role'),
    'A team manager adds you to a team when you''re ready to be scheduled.',
    '/profile',
    'approved_to_serve:' || new.id || ':' || new.approved_at::text);
  return null;
end;
$$;
revoke all on function private.notify_approved_to_serve() from public, anon, authenticated;
create trigger serving_approvals_notify after insert or update of status on public.serving_approvals
  for each row execute function private.notify_approved_to_serve();

-- A practical can be what finishes a course, while the person is elsewhere. Someone finishing on a
-- lesson or quiz is already on the page that offers the certificate.
create function private.notify_certificate_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if new.outcome <> 'pass'
     or not private.course_requirements_met(new.user_id, new.course_id)
     or exists (select 1 from public.certificates c
                where c.user_id = new.user_id and c.course_id = new.course_id) then
    return null;
  end if;
  select v.title into v_title from public.course_versions v
   where v.course_id = new.course_id and v.status = 'published';
  perform private.notify(new.user_id, 'certificate_ready',
    'You''ve finished ' || coalesce(v_title, 'a course'),
    'Your certificate is ready when you want it.',
    '/courses/' || new.course_id,
    'certificate_ready:' || new.user_id || ':' || new.course_id);
  return null;
end;
$$;
revoke all on function private.notify_certificate_ready() from public, anon, authenticated;
create trigger practical_assessments_notify_certificate after insert on public.practical_assessments
  for each row execute function private.notify_certificate_ready();

-- A new course, to its department. Later versions of a course don't notify anyone.
create function private.notify_new_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_department uuid;
begin
  if new.status <> 'published' or old.status = 'published' or new.version_number is distinct from 1 then
    return null;
  end if;
  select c.department_id into v_department from public.courses c where c.id = new.course_id;
  for v_user in
    select m.user_id from public.department_memberships m
    join public.profiles p on p.id = m.user_id and p.status = 'active'
    where m.department_id = v_department and m.status = 'active'
  loop
    continue when v_user = (select auth.uid());
    perform private.notify(v_user, 'new_course', 'New course: ' || new.title,
      'It''s open whenever you''d like to start.',
      '/courses/' || new.course_id,
      'new_course:' || new.course_id || ':' || v_user);
  end loop;
  return null;
end;
$$;
revoke all on function private.notify_new_course() from public, anon, authenticated;
create trigger course_versions_notify_new after update of status on public.course_versions
  for each row execute function private.notify_new_course();

-- An SOP updated, to its department. The first version is news to nobody yet.
create function private.notify_sop_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.status <> 'published' or old.status = 'published' or coalesce(new.version_number, 1) <= 1 then
    return null;
  end if;
  for v_user in
    select m.user_id from public.department_memberships m
    join public.profiles p on p.id = m.user_id and p.status = 'active'
    where m.department_id = new.department_id and m.status = 'active'
  loop
    continue when v_user = (select auth.uid());
    perform private.notify(v_user, 'sop_updated', 'SOP updated: ' || new.title,
      'There''s a new version to read.',
      '/sops/' || new.sop_id,
      'sop_updated:' || new.id || ':' || v_user);
  end loop;
  return null;
end;
$$;
revoke all on function private.notify_sop_updated() from public, anon, authenticated;
create trigger sop_versions_notify_updated after update of status on public.sop_versions
  for each row execute function private.notify_sop_updated();

-- A shared mentoring note, to the other person. Never private notes, and never the note's words
-- (SRS-RBAC-006): the alert shows on a lock screen.
create function private.notify_mentor_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relationship public.mentor_relationships;
  v_author text;
  v_other uuid;
begin
  select * into v_relationship from public.mentor_relationships r where r.id = new.relationship_id;
  v_other := case when new.author_id = v_relationship.mentor_id
                  then v_relationship.mentee_id else v_relationship.mentor_id end;
  select coalesce(p.display_name, 'Your mentoring partner') into v_author
    from public.profiles p where p.id = new.author_id;
  perform private.notify(v_other, 'mentor_note', 'New note from ' || v_author,
    'Open mentoring to read it.',
    '/mentoring/' || new.relationship_id,
    'mentor_note:' || new.id);
  return null;
end;
$$;
revoke all on function private.notify_mentor_note() from public, anon, authenticated;
create trigger mentoring_notes_notify after insert on public.mentoring_notes
  for each row when (new.visibility = 'shared') execute function private.notify_mentor_note();

-- A cover request still open within two days of the service, to those who schedule. Run by the job.
create function public.queue_cover_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_row record;
  v_holder uuid;
begin
  for v_row in
    select cr.id, cr.department_id, e.title, e.starts_at, r.name as role_name
    from public.cover_requests cr
    join public.events e on e.id = cr.event_id and e.cancelled_at is null
    join public.event_positions ep on ep.id = cr.position_id
    join public.serving_roles r on r.id = ep.role_id
    where cr.status = 'open'
      and e.starts_at > now() and e.starts_at <= now() + interval '2 days'
  loop
    for v_holder in
      select * from private.department_capability_holders('schedule.manage', v_row.department_id)
    loop
      perform private.notify(v_holder, 'cover_open',
        'Still needs cover: ' || v_row.role_name,
        v_row.title || ', ' || private.winnipeg_when(v_row.starts_at) || '.',
        '/admin/schedule',
        'cover_open:' || v_row.id || ':' || v_holder);
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.queue_cover_reminders() from public, anon, authenticated;
grant execute on function public.queue_cover_reminders() to service_role;
