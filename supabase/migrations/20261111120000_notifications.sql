-- Notifications: SRS-NOTIF-001..006, SOP review reminders (SRS-SOP-004, SPEC §9 Phase 3).
--
-- * Things that happen write a notification for the person concerned: joining a department,
--   being scheduled, a practical assessment result, a mentoring pairing, and an SOP review
--   coming due for its owner. Each has a dedupe key, so a retry never notifies twice
--   (SRS-NOTIF duplicate handling).
-- * People see their notifications in the app and choose which kinds also come by email
--   (SRS-NOTIF-002). Email is on by default.
-- * Email is sent by a scheduled job (.github/workflows/notifications.yml) through Resend. It
--   claims pending emails with the service role, which never reaches the browser or the app's
--   runtime. Until the job's secrets are set, emails stay pending and the app works as before.
-- * Notification text holds names and titles only: nothing from mentoring notes or feedback.

create type public.notification_kind as enum (
  'membership_approved', 'assignment_scheduled', 'assessment_recorded', 'mentoring_paired',
  'sop_review_due'
);
create type public.email_status as enum ('pending', 'sent', 'skipped', 'failed');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  kind public.notification_kind not null,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 1000),
  -- A path inside the app, never an outside address.
  link text check (link is null or link ~ '^/[A-Za-z0-9/_.?=&-]*$'),
  dedupe_key text not null unique check (length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_status public.email_status not null default 'pending',
  email_attempts integer not null default 0,
  emailed_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_pending_idx on public.notifications (created_at) where email_status = 'pending';

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete restrict,
  kind public.notification_kind not null,
  email boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy "People read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and private.is_active_user());
create policy "People read their own preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()) and private.is_active_user());

grant select on public.notifications, public.notification_preferences to authenticated;

-- Writes one notification; a repeat with the same key is ignored.
create function private.notify(
  p_user_id uuid, p_kind public.notification_kind, p_title text, p_body text, p_link text,
  p_dedupe_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_user_id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_link,
          left(p_dedupe_key, 200))
  on conflict (dedupe_key) do nothing;
$$;
revoke all on function private.notify(uuid, public.notification_kind, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What notifies whom
-- ---------------------------------------------------------------------------

create function private.notify_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department public.departments;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    select * into v_department from public.departments d where d.id = new.department_id;
    perform private.notify(new.user_id, 'membership_approved',
      'You''ve joined ' || v_department.name,
      'Your training for ' || v_department.name || ' is open.',
      '/departments/' || v_department.slug,
      'membership:' || new.id || ':' || coalesce(new.decided_at, now())::text);
  end if;
  return null;
end;
$$;
create trigger department_memberships_notify after update of status on public.department_memberships
  for each row execute function private.notify_membership();

create function private.notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_role text;
begin
  select * into v_event from public.events e where e.id = new.event_id;
  select r.name into v_role from public.serving_roles r where r.id = new.role_id;
  perform private.notify(new.user_id, 'assignment_scheduled',
    'You''re scheduled: ' || coalesce(v_role, 'a serving role'),
    v_event.title || ', ' ||
      to_char(v_event.starts_at at time zone 'America/Winnipeg', 'Dy Mon FMDD, FMHH12:MI AM') ||
      '. Please confirm or decline.',
    '/schedule',
    'assignment:' || new.id);
  return null;
end;
$$;
create trigger event_assignments_notify after insert on public.event_assignments
  for each row execute function private.notify_assignment();

create function private.notify_assessment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  select p.title into v_title from public.practicals p where p.id = new.practical_id;
  perform private.notify(new.user_id, 'assessment_recorded',
    case when new.outcome = 'pass' then 'You passed: ' else 'Assessment feedback: ' end
      || coalesce(v_title, 'practical assessment'),
    case when new.outcome = 'pass'
         then 'Your practical assessment passed.'
         else 'Your trainer recorded further practice. Their feedback is waiting for you.' end,
    '/courses/' || new.course_id || '/practicals/' || new.practical_key,
    'assessment:' || new.id);
  return null;
end;
$$;
create trigger practical_assessments_notify after insert on public.practical_assessments
  for each row execute function private.notify_assessment();

create function private.notify_mentoring()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mentor text;
  v_mentee text;
begin
  select display_name into v_mentor from public.profiles where id = new.mentor_id;
  select display_name into v_mentee from public.profiles where id = new.mentee_id;
  perform private.notify(new.mentee_id, 'mentoring_paired', v_mentor || ' is your mentor',
    'You can set goals and share notes together.', '/mentoring/' || new.id,
    'mentoring:' || new.id || ':mentee');
  perform private.notify(new.mentor_id, 'mentoring_paired', 'You''re mentoring ' || v_mentee,
    'You can set goals and share notes together.', '/mentoring/' || new.id,
    'mentoring:' || new.id || ':mentor');
  return null;
end;
$$;
create trigger mentor_relationships_notify after insert on public.mentor_relationships
  for each row execute function private.notify_mentoring();

-- SOP owners hear when a review is due within a week, once per review date (SRS-SOP-004).
-- Run by the scheduled job before sending emails; safe to run any number of times.
create function public.queue_sop_review_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_sop record;
begin
  for v_sop in
    select s.id, s.owner_id, v.title,
           (s.last_reviewed_at + make_interval(months => s.review_interval_months)) as due_at
    from public.sops s
    join public.sop_versions v on v.sop_id = s.id and v.status = 'published'
    where s.archived_at is null and s.owner_id is not null and s.last_reviewed_at is not null
      and s.last_reviewed_at + make_interval(months => s.review_interval_months) <= now() + interval '7 days'
  loop
    perform private.notify(v_sop.owner_id, 'sop_review_due', 'Review due: ' || v_sop.title,
      'Check the SOP is still right, then mark it reviewed or publish an update.',
      '/admin/sops/' || v_sop.id,
      'sop_review:' || v_sop.id || ':' || (v_sop.due_at at time zone 'America/Winnipeg')::date);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.queue_sop_review_reminders() from public, anon, authenticated;
grant execute on function public.queue_sop_review_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- People's own actions
-- ---------------------------------------------------------------------------

create function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n set read_at = now()
   where n.user_id = (select auth.uid()) and n.read_at is null
     and (p_ids is null or n.id = any (p_ids[1:500]));
$$;

create function public.set_notification_email(p_kind public.notification_kind, p_email boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() or p_email is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.notification_preferences as p (user_id, kind, email)
  values ((select auth.uid()), p_kind, p_email)
  on conflict (user_id, kind) do update set email = excluded.email, updated_at = now();
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
revoke all on function public.set_notification_email(public.notification_kind, boolean) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.set_notification_email(public.notification_kind, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The email job (service role only)
-- ---------------------------------------------------------------------------

-- Claims up to p_limit pending emails, oldest first, with the address to send to. Turned-off
-- kinds and inactive accounts are marked skipped instead. Failed sends are retried three times.
create function public.claim_email_notifications(p_limit integer default 50)
returns table (id uuid, email text, title text, body text, link text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n set email_status = 'skipped'
   where n.email_status = 'pending'
     and (
       exists (select 1 from public.notification_preferences p
               where p.user_id = n.user_id and p.kind = n.kind and not p.email)
       or not exists (select 1 from public.profiles pr where pr.id = n.user_id and pr.status = 'active')
     );
  return query
    with claimed as (
      select n.id
      from public.notifications n
      where n.email_status = 'pending' and n.email_attempts < 3
      order by n.created_at
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
      for update skip locked
    )
    update public.notifications n
       set email_attempts = n.email_attempts + 1
      from claimed c, auth.users u
     where n.id = c.id and u.id = n.user_id
    returning n.id, u.email::text, n.title, n.body, n.link;
end;
$$;

create function public.complete_email_notification(p_id uuid, p_sent boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set email_status = case when p_sent then 'sent'::public.email_status
                             when n.email_attempts >= 3 then 'failed'::public.email_status
                             else 'pending'::public.email_status end,
         emailed_at = case when p_sent then now() else n.emailed_at end
   where n.id = p_id;
$$;

revoke all on function public.claim_email_notifications(integer) from public, anon, authenticated;
revoke all on function public.complete_email_notification(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_email_notifications(integer) to service_role;
grant execute on function public.complete_email_notification(uuid, boolean) to service_role;
