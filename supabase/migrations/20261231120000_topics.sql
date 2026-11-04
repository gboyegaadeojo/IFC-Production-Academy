-- Topics and Videos (G, 2026-11-04; SRS-CUR-019). Topics are tags on lessons, as in MxU, for finding
-- videos across courses. A tag belongs to the lesson's stable key, so it carries across versions and
-- publishing never rewrites anything. Tags help people find things and never affect progress or
-- approval. Anyone in the Academy can read them; writes go through the functions below.

insert into public.capabilities (key, description) values
  ('topic.create', 'Add new topics for tagging lessons'),
  ('topic.manage', 'Rename and remove topics')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r
join public.capabilities c on c.key in ('topic.create', 'topic.manage')
where r.key in ('production_director', 'platform_admin')
on conflict do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r
join public.capabilities c on c.key = 'topic.create'
where r.key = 'department_leader'
on conflict do nothing;

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) between 1 and 60),
  created_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index topics_name_idx on public.topics (organization_id, lower(trim(name)))
  where archived_at is null;

create table public.lesson_topics (
  course_id uuid not null references public.courses (id) on delete cascade,
  lesson_key uuid not null,
  topic_id uuid not null references public.topics (id) on delete cascade,
  added_by uuid references public.profiles (id),
  added_at timestamptz not null default now(),
  primary key (course_id, lesson_key, topic_id)
);
create index lesson_topics_topic_idx on public.lesson_topics (topic_id);

alter table public.topics enable row level security;
alter table public.lesson_topics enable row level security;

create policy "Active users read topics in their organization"
  on public.topics for select to authenticated
  using (private.is_active_user() and organization_id = private.current_organization_id());
create policy "Active users read lesson topics"
  on public.lesson_topics for select to authenticated
  using (private.is_active_user());
grant select on public.topics, public.lesson_topics to authenticated;

create trigger topics_set_updated_at before update on public.topics
  for each row execute function private.set_updated_at();
create trigger topics_audit after insert or update on public.topics
  for each row execute function private.audit_change('topic');

-- Whether the person holds a capability in any department, or across the organization.
create function private.has_capability_anywhere(p_capability text)
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
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and p.status = 'active'
      and c.key = p_capability
  );
$$;
revoke all on function private.has_capability_anywhere(text) from public, anon, authenticated;

-- Safe to retry: a name already in use returns that topic.
create function public.create_topic(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_capability_anywhere('topic.create') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select t.id into v_id from public.topics t
   where t.organization_id = private.current_organization_id()
     and lower(trim(t.name)) = lower(trim(p_name)) and t.archived_at is null;
  if v_id is null then
    insert into public.topics (organization_id, name, created_by)
    values (private.current_organization_id(), trim(p_name), (select auth.uid()))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create function public.rename_topic(p_topic_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('topic.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.topics t set name = trim(p_name)
   where t.id = p_topic_id and t.organization_id = private.current_organization_id();
end;
$$;

-- Removing a topic takes it off every lesson. The audit log keeps the record that it existed.
create function public.remove_topic(p_topic_id uuid)
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
end;
$$;

-- Replaces a lesson's tags. Tagging needs course.draft for that course; it isn't part of a version,
-- so it also works on a lesson that's already published.
create function public.set_lesson_topics(p_course_id uuid, p_lesson_key uuid, p_topic_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_draft_course(p_course_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lessons l
    join public.course_versions v on v.id = l.course_version_id
    where v.course_id = p_course_id and l.lesson_key = p_lesson_key
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.lesson_topics lt
   where lt.course_id = p_course_id and lt.lesson_key = p_lesson_key
     and not (lt.topic_id = any (p_topic_ids));
  insert into public.lesson_topics (course_id, lesson_key, topic_id, added_by)
  select p_course_id, p_lesson_key, t.id, (select auth.uid())
  from public.topics t
  where t.id = any (p_topic_ids) and t.archived_at is null
    and t.organization_id = private.current_organization_id()
  on conflict do nothing;
end;
$$;

revoke all on function public.create_topic(text) from public, anon;
revoke all on function public.rename_topic(uuid, text) from public, anon;
revoke all on function public.remove_topic(uuid) from public, anon;
revoke all on function public.set_lesson_topics(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.create_topic(text) to authenticated;
grant execute on function public.rename_topic(uuid, text) to authenticated;
grant execute on function public.remove_topic(uuid) to authenticated;
grant execute on function public.set_lesson_topics(uuid, uuid, uuid[]) to authenticated;
