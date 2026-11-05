-- The launch switch: nothing is emailed or pushed until go-live, except to testers, and nothing
-- held is sent later. Notifications still show in the app.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

--   Volunteer  a8000000-0000-4000-8000-000000000001
--   Tester     a8000000-0000-4000-8000-000000000002
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'held.volunteer@example.com', '{"full_name": "Test Volunteer"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'held.tester@example.com', '{"full_name": "Test Tester"}', now(), now());
insert into public.notification_testers (user_id) values ('a8000000-0000-4000-8000-000000000002');

-- Both have a device, so a device alert would otherwise wait to be sent.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('a8000000-0000-4000-8000-000000000001', 'https://push.example.net/send/fake-held-1', repeat('B', 87), repeat('a', 22)),
  ('a8000000-0000-4000-8000-000000000002', 'https://push.example.net/send/fake-held-2', repeat('B', 87), repeat('a', 22));

select is((select bool_or(notifications_live) from public.organizations), false, 'the switch starts off');

select private.notify('a8000000-0000-4000-8000-000000000001', 'learning_nudge', 'Fake', 'Fake', '/home', 'held-volunteer');
select private.notify('a8000000-0000-4000-8000-000000000002', 'learning_nudge', 'Fake', 'Fake', '/home', 'held-tester');

select is((select email_status::text from public.notifications where dedupe_key = 'held-volunteer'), 'skipped',
  'a volunteer gets no email before launch');
select is((select push_status from public.notifications where dedupe_key = 'held-volunteer'), 'none',
  'and no device alert');
select is((select email_status::text from public.notifications where dedupe_key = 'held-tester'), 'pending',
  'a tester still gets the email');
select is((select push_status from public.notifications where dedupe_key = 'held-tester'), 'pending',
  'and the device alert');

set local role service_role;
select is((select array_agg(email) from public.claim_email_notifications(50)), array['held.tester@example.com'],
  'the email job only ever gets the tester''s');
select is((select array_agg(endpoint) from public.claim_push_batch(50)), null::text[],
  'and a new notification waits a minute for the device job, as before');
reset role;

-- It still shows in the app.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.notifications), 1, 'the volunteer still sees it in the app');
select throws_ok($$ select * from public.notification_testers $$, '42501', null, 'nobody reads the testers from the app');
select throws_ok($$ insert into public.notification_testers (user_id) values ('a8000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'or adds themselves');
select throws_ok($$ update public.organizations set notifications_live = true $$, '42501', null, 'or flips the switch');
reset role;

select is((select count(*)::int from public.audit_events where target_table = 'notification_testers'
  and target_id = (select id from public.notification_testers)), 1, 'adding a tester goes in the audit log');

-- Launch.
update public.organizations set notifications_live = true;
-- Not a learning reminder: those are limited to one a day, and one was written above.
select private.notify('a8000000-0000-4000-8000-000000000001', 'course_assigned', 'Fake', 'Fake', '/home', 'live-volunteer');
select is((select email_status::text from public.notifications where dedupe_key = 'live-volunteer'), 'pending',
  'after launch, a volunteer gets the email');
select is((select push_status from public.notifications where dedupe_key = 'live-volunteer'), 'pending',
  'and the device alert');
select is((select email_status::text from public.notifications where dedupe_key = 'held-volunteer'), 'skipped',
  'what was held before launch is never sent');

select * from finish();
rollback;
