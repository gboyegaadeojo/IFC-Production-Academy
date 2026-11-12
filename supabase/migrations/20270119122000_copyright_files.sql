-- Graphics uploaded with a video and graphics request (ADD-COPY-01, ADD-COPY-10). The bucket is
-- private with no storage policies: the server hands a visitor a one-time signed upload slot, and
-- opens a file with a one-minute signed link only after one of these functions says the caller may
-- see that request. Those calls use the visitor's or person's own access; only the signing uses
-- the server's storage key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('copyright', 'copyright', false, 20971520,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Quality control, from its private link.
create function public.copyright_qc_file(p_token text, p_request uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.file_path
  from public.copyright_requests r
  where r.id = p_request
    and r.organization_id = (private.copyright_qc_contact(p_token)).organization_id;
$$;

-- An outside reviewer, from the private link to the one request.
create function public.copyright_review_file(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.file_path
  from public.copyright_requests r
  where r.id = (private.copyright_outside_assignment(p_token)).request_id;
$$;

-- Someone signed in: an admin, an Academy reviewer it was sent to, or anyone on duty for the
-- service it's approved for.
create function public.copyright_member_file(p_request uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.file_path
  from public.copyright_requests r
  where r.id = p_request
    and private.is_active_user()
    and r.organization_id = private.current_organization_id()
    and (
      private.has_capability('copyright.manage')
      or exists (select 1 from public.copyright_review_assignments a
                 where a.request_id = r.id and a.user_id = (select auth.uid()))
      or (r.status = 'approved' and exists (
            select 1 from public.event_assignments a
            where a.event_id = r.event_id and a.user_id = (select auth.uid())
              and a.cancelled_at is null and a.status <> 'declined'))
    );
$$;

revoke all on function public.copyright_qc_file(text, uuid) from public;
revoke all on function public.copyright_review_file(text) from public;
revoke all on function public.copyright_member_file(uuid) from public, anon;
grant execute on function public.copyright_qc_file(text, uuid) to anon, authenticated;
grant execute on function public.copyright_review_file(text) to anon, authenticated;
grant execute on function public.copyright_member_file(uuid) to authenticated;
