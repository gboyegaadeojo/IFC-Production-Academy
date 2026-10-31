-- Certificates: SRS-CERT-001..005.
--
-- * A certificate says someone finished a course. It is issued only when the database confirms
--   the course's requirements on its live version: every required lesson marked complete (or every
--   lesson, if none is required), every required quiz passed, and every required practical passed.
--   Earlier versions count by stable key, the same "keep" rule as course progress.
-- * It records the recipient, course, department, the exact course version, the date, and a unique
--   reference (SRS-CERT-002, -003). Names and titles are copied in, so the certificate reads the
--   same after later edits.
-- * A certificate is not a competency and not Approved to Serve (SPEC §3).
-- * Revocation needs competency.approve for the department and a reason, and is audited
--   (SRS-CERT-005). A revoked certificate stays on record; the course can't be certified again
--   for that person without a leader's say (a new decision, not built yet).

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^IFC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  user_id uuid not null references public.profiles (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  course_version_id uuid not null references public.course_versions (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  recipient_name text not null,
  course_title text not null,
  department_name text not null,
  level_number integer not null,
  version_number integer not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoke_reason text check (revoke_reason is null or length(revoke_reason) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id),
  constraint certificates_revoked check ((revoked_at is null) = (revoke_reason is null))
);
create index certificates_department_idx on public.certificates (department_id);

alter table public.certificates enable row level security;

create trigger certificates_set_updated_at before update on public.certificates
  for each row execute function private.set_updated_at();
create trigger certificates_audit after insert or update on public.certificates
  for each row execute function private.audit_change('certificate');

create policy "People read their own certificates; staff read their department's"
  on public.certificates for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.can_view_readiness(department_id)
  );

grant select on public.certificates to authenticated;

-- Whether a person has met a course's requirements on its live version (SRS-CERT-001).
create function private.course_requirements_met(p_user_id uuid, p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select v.id
    from public.course_versions v
    join public.courses c on c.id = v.course_id
    where v.course_id = p_course_id and v.status = 'published' and c.archived_at is null
  ),
  counted_lessons as (
    select l.lesson_key
    from public.lessons l
    where l.course_version_id = (select id from live)
      and (l.is_required or not exists (
        select 1 from public.lessons r where r.course_version_id = (select id from live) and r.is_required))
  )
  select exists (select 1 from live)
    and exists (select 1 from counted_lessons)
    and not exists (
      select 1 from counted_lessons cl
      where not exists (
        select 1 from public.lesson_progress p
        where p.user_id = p_user_id and p.course_id = p_course_id
          and p.lesson_key = cl.lesson_key and p.status = 'completed'
      )
    )
    and not exists (
      select 1 from public.quizzes q
      where q.course_version_id = (select id from live) and q.is_required
        and not exists (
          select 1 from public.quiz_attempts a
          where a.user_id = p_user_id and a.course_id = p_course_id
            and a.quiz_key = q.quiz_key and a.passed
        )
    )
    and not exists (
      select 1 from public.practicals pr
      where pr.course_version_id = (select id from live) and pr.is_required
        and not exists (
          select 1 from public.practical_assessments pa
          where pa.user_id = p_user_id and pa.course_id = p_course_id
            and pa.practical_key = pr.practical_key and pa.outcome = 'pass' and pa.voided_at is null
        )
    );
$$;
revoke all on function private.course_requirements_met(uuid, uuid) from public, anon, authenticated;

-- Issues the caller's certificate for a course once the requirements are met. Idempotent: returns
-- the existing reference if there is one.
create function public.issue_certificate(p_course_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_existing public.certificates;
  v_course public.courses;
  v_version public.course_versions;
  v_reference text;
begin
  select * into v_course from public.courses c where c.id = p_course_id;
  if v_course.id is null or not private.is_department_member(v_course.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_course_id::text, 0));
  select * into v_existing from public.certificates c where c.user_id = v_user and c.course_id = p_course_id;
  if v_existing.id is not null then
    if v_existing.revoked_at is not null then
      raise exception 'certificate_revoked' using errcode = 'P0001';
    end if;
    return v_existing.reference;
  end if;
  if not private.course_requirements_met(v_user, p_course_id) then
    raise exception 'requirements_not_met' using errcode = 'P0001';
  end if;

  select * into v_version from public.course_versions v
   where v.course_id = p_course_id and v.status = 'published';
  loop
    v_reference := 'IFC-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
      || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
      || upper(substr(md5(gen_random_uuid()::text), 1, 4));
    exit when not exists (select 1 from public.certificates c where c.reference = v_reference);
  end loop;

  insert into public.certificates
    (reference, user_id, course_id, course_version_id, department_id, recipient_name, course_title,
     department_name, level_number, version_number)
  select v_reference, v_user, p_course_id, v_version.id, v_course.department_id, p.display_name,
         v_version.title, d.name, l.number, v_version.version_number
    from public.profiles p, public.departments d, public.levels l
   where p.id = v_user and d.id = v_course.department_id and l.id = v_course.level_id;
  return v_reference;
end;
$$;

-- Checks a certificate by its reference (SRS-CERT-004). For signed-in people: shows only what is
-- printed on the certificate and whether it is still valid.
create function public.verify_certificate(p_reference text)
returns table (
  reference text, recipient_name text, course_title text, department_name text,
  level_number integer, version_number integer, issued_at timestamptz, revoked boolean,
  is_mine boolean, can_revoke boolean, department_id uuid, course_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.reference, c.recipient_name, c.course_title, c.department_name, c.level_number,
         c.version_number, c.issued_at, c.revoked_at is not null,
         c.user_id = (select auth.uid()),
         private.has_capability('competency.approve', c.department_id),
         c.department_id, c.course_id
  from public.certificates c
  where c.reference = upper(trim(p_reference))
    and private.is_active_user();
$$;

-- Revokes a certificate (SRS-CERT-005). Restricted, reasoned, and audited.
create function public.revoke_certificate(p_reference text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_certificate public.certificates;
begin
  select * into v_certificate from public.certificates c where c.reference = upper(trim(p_reference)) for update;
  if v_certificate.id is null or not private.has_capability('competency.approve', v_certificate.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 1 and 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  update public.certificates c
     set revoked_at = now(), revoked_by = (select auth.uid()), revoke_reason = trim(p_reason)
   where c.id = v_certificate.id and c.revoked_at is null;
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.issue_certificate(uuid)',
    'public.verify_certificate(text)',
    'public.revoke_certificate(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;
