-- Alerts on devices (web push): people manage only their own devices, a notification is claimed
-- once and only with the database's token, and nobody else can read anyone's device keys.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- These check sending, whatever time of day the tests run.
insert into private.app_settings (key, value) values ('quiet_hours_off', '1');

-- Test people (fake): Pia (alerts on) ad…01; Quinn (no devices) ad…02.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pia.push@example.com', '{"full_name": "Test Pia"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'quinn.push@example.com', '{"full_name": "Test Quinn"}', now(), now());

create temporary table ctx (key text primary key, value text);
grant all on ctx to authenticated, anon;
insert into ctx values
  ('endpoint', 'https://push.example.net/send/fake-device-1'),
  ('p256dh', repeat('B', 87)),
  ('auth', repeat('a', 22));

-- Pia turns alerts on for one device.
select pg_temp.act_as('ad000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.save_push_subscription((select value from ctx where key = 'endpoint'), (select value from ctx where key = 'p256dh'), (select value from ctx where key = 'auth'), 'Fake phone') $$,
  'someone turns alerts on for their device');
select throws_ok(
  $$ select public.save_push_subscription('http://push.example.net/insecure', (select value from ctx where key = 'p256dh'), (select value from ctx where key = 'auth'), '') $$,
  '23514', null, 'only https push services are accepted');
select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('ad000000-0000-4000-8000-000000000001', 'https://x.example/1', repeat('B', 87), repeat('a', 22)) $$,
  '42501', null, 'devices cannot be inserted directly');
select is((select count(*)::int from public.push_subscriptions), 1, 'they see their own device');
reset role;

select pg_temp.act_as('ad000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.push_subscriptions $$, 'nobody sees anyone else''s devices');
select lives_ok($$ select public.remove_push_subscription((select value from ctx where key = 'endpoint')) $$,
  'removing someone else''s device does nothing');
reset role;
select is((select count(*)::int from public.push_subscriptions where user_id = 'ad000000-0000-4000-8000-000000000001'), 1,
  'and their device is still there');

set local role anon;
select throws_ok($$ select * from public.push_subscriptions $$, '42501', null, 'visitors cannot read devices');
select throws_ok($$ select * from public.claim_push_batch(10) $$, '42501', null, 'nor run the job''s claim');
reset role;

-- These tests are about sending, so the launch switch is on (058 tests the switch).
update public.organizations set notifications_live = true;

-- A notification for Pia waits for an alert; one for Quinn, with no devices, needs none.
select private.notify('ad000000-0000-4000-8000-000000000001', 'membership_approved', 'Fake: you''re in', 'Fake body', '/home', 'test-push-pia');
select private.notify('ad000000-0000-4000-8000-000000000002', 'membership_approved', 'Fake: you''re in', 'Fake body', '/home', 'test-push-quinn');
select is((select push_status from public.notifications where dedupe_key = 'test-push-pia'), 'pending',
  'a notification for someone with alerts on waits to be sent');
select is((select push_status from public.notifications where dedupe_key = 'test-push-quinn'), 'none',
  'one for someone without devices needs no alert');

-- Claiming needs the database's own token, and works once.
insert into ctx values ('nid', (select id::text from public.notifications where dedupe_key = 'test-push-pia'));
insert into ctx values ('token', (select value from private.app_settings where key = 'push_dispatch_token'));
set local role anon;
select throws_ok($$ select * from public.claim_push((select value::uuid from ctx where key = 'nid'), 'wrong-token') $$,
  '42501', null, 'a wrong token is refused');
select is((select count(*)::int from public.claim_push((select value::uuid from ctx where key = 'nid'), (select value from ctx where key = 'token'))), 1,
  'the right token gets the notification and the device to send it to');
select is_empty($$ select * from public.claim_push((select value::uuid from ctx where key = 'nid'), (select value from ctx where key = 'token')) $$,
  'a second claim gets nothing, so an alert is never sent twice');
select lives_ok($$ select public.push_subscription_gone((select value from ctx where key = 'endpoint'), (select value from ctx where key = 'token')) $$,
  'a device the push service says is gone is removed');
reset role;
select is((select count(*)::int from public.push_subscriptions where user_id = 'ad000000-0000-4000-8000-000000000001'), 0,
  'and it is gone');

select * from finish();
rollback;
