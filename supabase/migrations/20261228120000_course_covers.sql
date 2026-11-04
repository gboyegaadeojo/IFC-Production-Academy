-- Course covers (G, 2026-11-04; SRS-CUR-017). A cover belongs to the course, not a version, so
-- changing it needs no draft and leaves history alone. Cover art isn't private, so it sits in a
-- public bucket, the second exception to private buckets after app icons. Uploading needs
-- course.draft in the course's category. The courses audit trigger logs each change.

alter table public.courses
  add column cover_image_path text
    check (cover_image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$');

create function private.can_draft_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1 from public.courses c
    where c.id = p_course_id and private.has_capability('course.draft', c.department_id)
  );
$$;
revoke all on function private.can_draft_course(uuid) from public, anon;
grant execute on function private.can_draft_course(uuid) to authenticated;

create function public.set_course_cover(p_course_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_draft_course(p_course_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> p_course_id::text then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.courses c set cover_image_path = p_path where c.id = p_course_id;
end;
$$;
revoke all on function public.set_course_cover(uuid, text) from public, anon;
grant execute on function public.set_course_cover(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-covers', 'course-covers', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first part of each path is the course it belongs to.
create policy "Course covers: upload with course.draft"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'course-covers'
    and private.can_draft_course(nullif(split_part(name, '/', 1), '')::uuid)
  );
create policy "Course covers: remove with course.draft"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'course-covers'
    and private.can_draft_course(nullif(split_part(name, '/', 1), '')::uuid)
  );
