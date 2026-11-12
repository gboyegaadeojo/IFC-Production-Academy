-- Video and graphics approvals (ADD-COPY-01..10). The public form works only with the switch on;
-- the tables are closed to everyone but admins; Quality control and outside reviewers act only
-- through their private links, Academy reviewers only on what's sent to them; every step queues
-- the right emails, and a decided request's links stop working.
--
-- Visitors can't read the queue or the requests, so secrets and ids are kept in session settings
-- (test.*) by the owner, then read back while acting as a visitor.
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_email, jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.act_as_visitor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;
-- Keeps the secret at the end of the latest queued link of a kind, to one address.
create function pg_temp.keep_secret(p_name text, p_template text, p_to text) returns void language sql as $$
  select set_config('test.' || p_name, (
    select regexp_replace(o.link, '^.*/', '') from public.copyright_outbox o
    where o.template = p_template and o.to_email = p_to order by o.created_at desc limit 1), true);
$$;
create function pg_temp.keep_request(p_name text, p_description text) returns void language sql as $$
  select set_config('test.' || p_name,
    (select r.id::text from public.copyright_requests r where r.description = p_description), true);
$$;

-- The deadline rule matches lib/domain/copyright.ts.
select is(private.copyright_lead_days('2026-11-12', '2026-11-22', 'calendar'), 10, 'calendar days');
select is(private.copyright_lead_days('2026-11-12', '2026-11-22', 'business'), 6, 'business days');
select is(private.copyright_lead_days('2026-11-22', '2026-11-22', 'calendar'), 0, 'none on the day');

select pg_temp.new_user('a9000000-0000-4000-8000-000000000001', 'Test Copyright Admin', 'copyright.admin@example.com');
select pg_temp.new_user('a9000000-0000-4000-8000-000000000002', 'Test Media Reviewer', 'media.reviewer@example.com');
select pg_temp.new_user('a9000000-0000-4000-8000-000000000003', 'Test Volunteer', 'copyright.volunteer@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a9000000-0000-4000-8000-000000000001', (select id from public.roles where key = 'platform_admin' limit 1), null),
  ('a9000000-0000-4000-8000-000000000002', (select id from public.roles where key = 'copyright_reviewer' limit 1), null);

insert into public.events (id, organization_id, title, starts_at, ends_at) values
  ('a9000000-0000-4000-8000-0000000000e1', (select id from public.organizations order by created_at limit 1),
   'Test Sunday Service', now() + interval '10 days', now() + interval '10 days 2 hours');
insert into public.service_plan_items (event_id, external_id, position, item_type, title) values
  ('a9000000-0000-4000-8000-0000000000e1', 'test-offering', 3, 'item', 'Offering');

-- Off by default: the form is closed.
select pg_temp.act_as_visitor();
select is((public.copyright_form() ->> 'open')::boolean, false, 'the form is closed while the switch is off');
select throws_ok(
  $$ select public.submit_copyright_request('Sam', 'Test', 'sam.test@example.com', 'video',
       'https://example.com/v', null, 'a9000000-0000-4000-8000-0000000000e1', null, 'Missions moment', '') $$,
  'P0001', 'copyright_off', 'and refuses requests');
reset role;

update public.feature_flags set enabled = true where key = 'copyright';
insert into public.copyright_contacts (id, organization_id, kind, name, email) values
  ('a9000000-0000-4000-8000-0000000000c1', (select id from public.organizations order by created_at limit 1),
   'quality_control', 'Morgan QC', 'morgan.qc@example.com'),
  ('a9000000-0000-4000-8000-0000000000c2', (select id from public.organizations order by created_at limit 1),
   'reviewer', 'Robin Outside', 'robin.outside@example.com');
update public.copyright_settings set media_inbox_email = 'media.inbox@example.com';

-- A visitor sends a request.
select pg_temp.act_as_visitor();
select is((public.copyright_form() ->> 'open')::boolean, true, 'the form opens with the switch on');
select ok(jsonb_array_length(public.copyright_form() -> 'services') >= 1, 'and lists upcoming services');
select is(
  public.submit_copyright_request('Bot', '', 'bot@example.com', 'video', 'https://example.com/b', null,
    'a9000000-0000-4000-8000-0000000000e1', null, 'Spam', 'https://spam.example'),
  null, 'a bot filling the hidden field gets nothing back');
select is(
  (public.submit_copyright_request('Sam', 'Test', 'Sam.Test@example.com', 'video', 'https://example.com/v',
     null, 'a9000000-0000-4000-8000-0000000000e1', null, 'Missions moment', '') ->> 'isLate')::boolean,
  false, 'a request with 10 days'' notice is on time');
select throws_ok(
  $$ select public.submit_copyright_request('Sam', 'Test', 'sam.test@example.com', 'video', 'ftp://bad',
       null, 'a9000000-0000-4000-8000-0000000000e1', null, 'Bad link', '') $$,
  '22023', 'invalid_request', 'a link that isn''t https is refused');
select throws_ok($$ select count(*) from public.copyright_requests $$, '42501', null,
  'a visitor cannot read the requests table');
reset role;

select is((select count(*)::int from public.copyright_requests where description = 'Spam'), 0,
  'the bot''s request was not kept');
select is((select count(*)::int from public.copyright_outbox where template = 'received' and to_email = 'sam.test@example.com'),
  1, 'the requester is emailed, at their address in lower case');
select ok(
  (select link like '/copyright/qc/%' from public.copyright_outbox
   where template = 'new_request' and to_email = 'morgan.qc@example.com'),
  'Quality control is emailed a private link');
select pg_temp.keep_secret('qc', 'new_request', 'morgan.qc@example.com');
select pg_temp.keep_secret('status', 'received', 'sam.test@example.com');
select pg_temp.keep_request('missions', 'Missions moment');
select is(
  (select count(*)::int from public.copyright_access_links
   where token_hash = convert_to(current_setting('test.qc'), 'UTF8')),
  0, 'the link itself is not stored, only its hash');

-- A signed-in volunteer can't see requests; an admin can.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.copyright_requests), 0, 'a volunteer sees no requests');
select throws_ok($$ select public.copyright_my_reviews() $$, '42501', null, 'and has no Copyright list');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.copyright_requests), 1, 'an admin sees every request');
reset role;

-- Quality control opens it from the link, and sends it to an outside reviewer.
select pg_temp.act_as_visitor();
select is(public.copyright_qc_requests('not-a-real-secret'), null, 'a made-up link opens nothing');
select is(jsonb_array_length(public.copyright_qc_requests(current_setting('test.qc')) -> 'requests'), 1,
  'Quality control''s link lists the request');
select is(
  public.copyright_qc_open(current_setting('test.qc'), current_setting('test.missions')::uuid) ->> 'claimedBy',
  'Morgan QC', 'opening it puts their name on it');
select throws_ok(
  $$ select public.copyright_qc_send_for_review(current_setting('test.qc'), current_setting('test.missions')::uuid,
       '{}', '{}', 'Is the song licensed?') $$,
  '22023', 'reviewer_needed', 'sending for review needs a reviewer');
select lives_ok(
  $$ select public.copyright_qc_send_for_review(current_setting('test.qc'), current_setting('test.missions')::uuid,
       '{}', '{a9000000-0000-4000-8000-0000000000c2}', 'Is the song licensed?', 'test-offering') $$,
  'and sends it to an outside reviewer, placed at the offering');
reset role;
select is((select status from public.copyright_requests where description = 'Missions moment'),
  'with_copyright_review', 'it is with the copyright review');
select ok(
  (select link like '/copyright/review/%' from public.copyright_outbox
   where template = 'review_needed' and to_email = 'robin.outside@example.com'),
  'the outside reviewer is emailed a link to it');
select pg_temp.keep_secret('review', 'review_needed', 'robin.outside@example.com');

-- The outside reviewer approves from their link.
select pg_temp.act_as_visitor();
select is(public.copyright_review_open(current_setting('test.review')) ->> 'question', 'Is the song licensed?',
  'the reviewer sees Quality control''s question');
select throws_ok(
  $$ select public.copyright_qc_decide(current_setting('test.qc'), current_setting('test.missions')::uuid, true, 'x') $$,
  'P0001', 'already_decided', 'Quality control cannot decide while it''s with a reviewer');
select lives_ok(
  $$ select public.copyright_review_decide(current_setting('test.review'), true, 'Covered by our licence.') $$,
  'the reviewer approves it');
select is(public.copyright_review_open(current_setting('test.review')), null,
  'the link stops working once it''s decided');
select throws_ok(
  $$ select public.copyright_review_decide(current_setting('test.review'), false, 'Changed my mind') $$,
  '42501', 'link_expired', 'and cannot decide again');
select is(public.copyright_request_status(current_setting('test.status')) ->> 'status', 'approved',
  'the requester''s status page shows it approved');
reset role;

select is((select plan_item_id from public.copyright_requests where description = 'Missions moment'),
  'test-offering', 'it keeps its place in the order of service');
select is((select count(*)::int from public.copyright_outbox where template = 'approved' and to_email = 'sam.test@example.com'),
  1, 'the requester is told');
select is((select count(*)::int from public.copyright_outbox where template = 'approved' and to_email = 'morgan.qc@example.com'),
  1, 'Quality control is copied on a reviewer''s decision');
select is((select count(*)::int from public.copyright_outbox where template = 'cleared' and to_email = 'media.inbox@example.com'),
  1, 'the media inbox gets the cleared-to-show email');

-- An Academy reviewer sees only what's sent to them, and decides in the app.
select pg_temp.act_as_visitor();
select public.submit_copyright_request('Jo', 'Test', 'jo.test@example.com', 'graphic', 'https://example.com/slide',
  null, null, (current_date + 2), 'Youth retreat slide', '');
reset role;
select pg_temp.keep_request('slide', 'Youth retreat slide');
select is((select is_late from public.copyright_requests where description = 'Youth retreat slide'), true,
  'two days'' notice is marked late');
select pg_temp.act_as('a9000000-0000-4000-8000-000000000002');
select is(public.copyright_my_review_count(), 0, 'nothing is waiting for the Academy reviewer yet');
reset role;
select pg_temp.act_as_visitor();
select lives_ok(
  $$ select public.copyright_qc_send_for_review(current_setting('test.qc'), current_setting('test.slide')::uuid,
       '{a9000000-0000-4000-8000-000000000002}', '{}', 'Is this image ours?') $$,
  'Quality control sends one to an Academy reviewer');
select throws_ok(
  $$ select public.copyright_qc_send_for_review(current_setting('test.qc'), current_setting('test.missions')::uuid,
       '{a9000000-0000-4000-8000-000000000002}', '{}', 'Is this ours?') $$,
  'P0001', 'already_decided', 'but not one that''s already decided');
reset role;
select is(
  (select link from public.copyright_outbox where template = 'review_needed' and to_email = 'media.reviewer@example.com'),
  '/copyright/requests/' || current_setting('test.slide'),
  'the Academy reviewer''s email opens the request in the app');

select pg_temp.act_as('a9000000-0000-4000-8000-000000000002');
select is(public.copyright_my_review_count(), 1, 'it shows in their side bar count');
select is(jsonb_array_length(public.copyright_my_reviews()), 1, 'and their Copyright list');
select is(public.copyright_member_open(current_setting('test.missions')::uuid), null,
  'they cannot open a request that wasn''t sent to them');
select lives_ok(
  $$ select public.copyright_member_decide(current_setting('test.slide')::uuid, false, 'Stock photo, not licensed.') $$,
  'they decline it in the app');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.copyright_member_decide(current_setting('test.slide')::uuid, true, 'x') $$,
  '42501', null, 'someone without the permission cannot decide');
reset role;
select is((select decided_by_name from public.copyright_requests where description = 'Youth retreat slide'),
  'Test Media Reviewer', 'the decision is recorded under the reviewer''s name');
select is((select count(*)::int from public.copyright_outbox where template = 'cleared'
           and request_id = current_setting('test.slide')::uuid),
  0, 'a declined item is not sent to the media inbox');

-- The email job: service role only, nothing while the switch is off, and links cleared once sent.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.claim_copyright_emails(5) $$, '42501', null, 'people cannot claim emails');
reset role;
update public.feature_flags set enabled = false where key = 'copyright';
select is((select count(*)::int from public.claim_copyright_emails(50)), 0, 'nothing is handed over while it''s off');
update public.feature_flags set enabled = true where key = 'copyright';
select ok((select count(*)::int from public.claim_copyright_emails(200)) > 5, 'emails are handed over when it''s on');
select public.complete_copyright_email(o.id, true) from public.copyright_outbox o where o.status = 'pending';
select is((select count(*)::int from public.copyright_outbox where link is not null), 0,
  'every link is cleared once its email is sent');

-- Removing someone from Quality control turns their link off.
update public.copyright_contacts set removed_at = now() where id = 'a9000000-0000-4000-8000-0000000000c1';
select pg_temp.act_as_visitor();
select is(public.copyright_qc_requests(current_setting('test.qc')), null,
  'a removed person''s Quality control link opens nothing');
reset role;

select * from finish();
rollback;
