-- Academy copyright reviewers get a notification when a request is sent to them (G, 2026-11-13),
-- linking to it, and never a notification email: the copyright email already goes. Outside
-- reviewers, who have no account, get none.
begin;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a9500000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'alert.reviewer@example.com', jsonb_build_object('full_name', 'Fake Reviewer'), now(), now());

insert into public.copyright_requests
  (id, organization_id, first_name, email, kind, media_url, service_day, description, status, review_question)
values ('a9500000-0000-4000-8000-0000000000a1', (select id from public.organizations order by created_at limit 1),
        'Sam', 'sam.alert@example.com', 'video', 'https://example.com/v', current_date + 10,
        'Fake alert video', 'with_copyright_review', 'Check the music');
insert into public.copyright_contacts (id, organization_id, kind, name, email)
values ('a9500000-0000-4000-8000-0000000000c1', (select id from public.organizations order by created_at limit 1),
        'reviewer', 'Fake Outside', 'outside.alert@example.com');

insert into public.copyright_review_assignments (request_id, user_id, expires_at)
values ('a9500000-0000-4000-8000-0000000000a1', 'a9500000-0000-4000-8000-000000000001', now() + interval '14 days');
insert into public.copyright_review_assignments (request_id, contact_id, token_hash, expires_at)
values ('a9500000-0000-4000-8000-0000000000a1', 'a9500000-0000-4000-8000-0000000000c1',
        private.copyright_hash('fake-secret'), now() + interval '14 days');

select is(
  (select count(*)::int from public.notifications
   where user_id = 'a9500000-0000-4000-8000-000000000001' and kind = 'copyright_review'),
  1, 'the Academy reviewer gets a notification');
select is(
  (select link from public.notifications
   where user_id = 'a9500000-0000-4000-8000-000000000001' and kind = 'copyright_review'),
  '/copyright/requests/a9500000-0000-4000-8000-0000000000a1', 'that opens the request');
select is(
  (select email_status::text from public.notifications
   where user_id = 'a9500000-0000-4000-8000-000000000001' and kind = 'copyright_review'),
  'skipped', 'and never a notification email, since the copyright email goes');
select is((select count(*)::int from public.notifications where kind = 'copyright_review'), 1,
  'the outside reviewer, with no account, gets none');

select * from finish();
rollback;
