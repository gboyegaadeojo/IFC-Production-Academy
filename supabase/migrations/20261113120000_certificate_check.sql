-- Certificate template and public check: SRS-CERT-002, SRS-CERT-004 (decision 8,
-- docs/decisions/2026-10-31-open-decisions.md).
--
-- * public.check_certificate lets anyone holding a reference, signed in or not, confirm a printed
--   certificate is genuine and still valid. It is what the certificate's QR code opens. It shows
--   only the recipient's initials, never their full name, so a reference found on paper exposes no
--   one (SPEC §6 privacy; some volunteers are minors).
-- * References are 48 random bits (IFC-XXXX-XXXX-XXXX), so guessing one isn't practical.
-- * verify_certificate (signed in) also returns the department's hue, for the certificate's
--   colour band.

-- "Gboyega Test Adeojo" -> "G. T. A."; at most three initials.
create function private.initials(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(upper(left(part, 1)) || '.', ' ' order by ord), '')
  from (
    select part, ord
    from regexp_split_to_table(trim(coalesce(p_name, '')), '\s+') with ordinality as t (part, ord)
    where part <> ''
    order by ord
    limit 3
  ) words;
$$;

create function public.check_certificate(p_reference text)
returns table (
  reference text, recipient_initials text, course_title text, department_name text,
  level_number integer, issued_at timestamptz, revoked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.reference, private.initials(c.recipient_name), c.course_title, c.department_name,
         c.level_number, c.issued_at, c.revoked_at is not null
  from public.certificates c
  where c.reference = upper(trim(p_reference));
$$;

revoke all on function public.check_certificate(text) from public;
grant execute on function public.check_certificate(text) to anon, authenticated;
revoke all on function private.initials(text) from public, anon, authenticated;

drop function public.verify_certificate(text);
create function public.verify_certificate(p_reference text)
returns table (
  reference text, recipient_name text, course_title text, department_name text,
  level_number integer, version_number integer, issued_at timestamptz, revoked boolean,
  is_mine boolean, can_revoke boolean, department_id uuid, course_id uuid, department_hue text
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
         c.department_id, c.course_id, d.hue
  from public.certificates c
  join public.departments d on d.id = c.department_id
  where c.reference = upper(trim(p_reference))
    and private.is_active_user();
$$;

revoke all on function public.verify_certificate(text) from public, anon;
grant execute on function public.verify_certificate(text) to authenticated;
