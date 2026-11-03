-- Leaders publish their own department's curriculum with no approval gate (G, 2026-10-30, confirmed
-- 2026-11-03). This removes the optional "a second person publishes" setting. Published history is
-- untouched. Anything waiting for review goes back to being a draft.
update public.course_versions set status = 'draft', submitted_at = null, submitted_by = null
 where status = 'pending_review';

drop function public.submit_course_version(uuid, text);
drop function public.return_course_version(uuid, text);

create or replace function public.publish_course_version(p_version_id uuid, p_change_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_version public.course_versions;
  v_course public.courses;
  v_note text;
  v_number integer;
begin
  select * into v_version from public.course_versions v where v.id = p_version_id;
  if not found then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_course from public.courses c where c.id = v_version.course_id for update;
  if not private.has_capability('course.publish', v_course.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'version_not_publishable' using errcode = 'P0001';
  end if;

  v_note := trim(coalesce(nullif(trim(coalesce(p_change_note, '')), ''), v_version.change_note, ''));
  if length(v_note) not between 1 and 500 then
    raise exception 'change_note_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lessons l where l.course_version_id = p_version_id) then
    raise exception 'course_has_no_lessons' using errcode = 'P0001';
  end if;

  update public.course_versions v
     set status = 'superseded'
   where v.course_id = v_course.id and v.status in ('published', 'archived');

  select coalesce(max(v.version_number), 0) + 1 into v_number
    from public.course_versions v where v.course_id = v_course.id;

  update public.course_versions v
     set status = 'published',
         version_number = v_number,
         change_note = v_note,
         published_at = now(),
         published_by = v_actor
   where v.id = p_version_id;

  update public.courses c set archived_at = null where c.id = v_course.id and c.archived_at is not null;
  return v_number;
end;
$$;

alter table public.departments drop column curriculum_requires_review;

-- The saved dashboard shows the YouTube live tile and no stream preview (G, 2026-11-03).
update public.dashboard_layouts
   set items = '[
     {"tile":"team","x":0,"y":0,"w":3,"h":13},
     {"tile":"pptimers","x":0,"y":13,"w":3,"h":3},
     {"tile":"youtube","x":3,"y":0,"w":4,"h":2},
     {"tile":"current","x":3,"y":2,"w":4,"h":3},
     {"tile":"run","x":3,"y":5,"w":4,"h":11},
     {"tile":"slides","x":7,"y":0,"w":5,"h":7},
     {"tile":"timer","x":7,"y":7,"w":2,"h":3},
     {"tile":"encoder","x":9,"y":7,"w":3,"h":3},
     {"tile":"checklist","x":7,"y":10,"w":3,"h":6},
     {"tile":"notes","x":10,"y":10,"w":2,"h":6},
     {"tile":"levels","x":0,"y":16,"w":12,"h":5}
   ]'::jsonb
 where items @> '[{"tile":"preview"}]'::jsonb;

-- Emails held back by Resend's limit go back in the queue without using up a try (item 5).
create function public.release_email_notification(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set email_attempts = greatest(n.email_attempts - 1, 0)
   where n.id = p_id and n.email_status = 'pending';
$$;
create function public.release_onboarding_email(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.onboarding_outbox o
     set attempts = greatest(o.attempts - 1, 0)
   where o.id = p_id and o.status = 'pending';
$$;
revoke all on function public.release_email_notification(uuid) from public, anon, authenticated;
revoke all on function public.release_onboarding_email(uuid) from public, anon, authenticated;
grant execute on function public.release_email_notification(uuid) to service_role;
grant execute on function public.release_onboarding_email(uuid) to service_role;
