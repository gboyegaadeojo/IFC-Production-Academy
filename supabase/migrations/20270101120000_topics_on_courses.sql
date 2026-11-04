-- Topics on courses too (G, 2026-11-04; SRS-CUR-019). A tag belongs to the course, not a version, so
-- it carries across versions. Tags help people find things and never affect progress or approval.

create table public.course_topics (
  course_id uuid not null references public.courses (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  added_by uuid references public.profiles (id),
  added_at timestamptz not null default now(),
  primary key (course_id, topic_id)
);
create index course_topics_topic_idx on public.course_topics (topic_id);

alter table public.course_topics enable row level security;
create policy "Active users read course topics"
  on public.course_topics for select to authenticated
  using (private.is_active_user());
grant select on public.course_topics to authenticated;

-- Replaces a course's tags. Needs course.draft for that course.
create function public.set_course_topics(p_course_id uuid, p_topic_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_draft_course(p_course_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.course_topics ct
   where ct.course_id = p_course_id and not (ct.topic_id = any (p_topic_ids));
  insert into public.course_topics (course_id, topic_id, added_by)
  select p_course_id, t.id, (select auth.uid())
  from public.topics t
  where t.id = any (p_topic_ids) and t.archived_at is null
    and t.organization_id = private.current_organization_id()
  on conflict do nothing;
end;
$$;
revoke all on function public.set_course_topics(uuid, uuid[]) from public, anon;
grant execute on function public.set_course_topics(uuid, uuid[]) to authenticated;

-- Removing a topic now takes it off every course as well as every lesson.
create or replace function public.remove_topic(p_topic_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('topic.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.topics t set archived_at = now()
   where t.id = p_topic_id and t.organization_id = private.current_organization_id();
  delete from public.lesson_topics lt where lt.topic_id = p_topic_id;
  delete from public.course_topics ct where ct.topic_id = p_topic_id;
end;
$$;
