-- Instant message alerts: who gets one, and who doesn't. Only people who can read the chat, have a
-- device, haven't muted it, aren't looking at it, aren't in the 20-second cooldown, and have the
-- Messages phone choice on; testers only before launch; nothing while messaging is off. Message
-- notices from the 15-minute job never go to phones.
begin;
select no_plan();
-- Start with the launch switch off, as it was before go-live.
update public.organizations set notifications_live = false;

create function pg_temp.new_user(p_id uuid, p_name text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_id::text || '@example.com', jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.device(p_id uuid, p_n int) returns void language sql as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label)
  values (p_id, 'https://push.example.com/fake-' || p_n, repeat('B', 87), repeat('a', 22), 'Fake iPhone');
$$;

--   S  Sender                 a8800000-0000-4000-8000-000000000001
--   A  Member with a phone    a8800000-0000-4000-8000-000000000002
--   N  Member with no device  a8800000-0000-4000-8000-000000000003
--   O  Audio member, phone    a8800000-0000-4000-8000-000000000004 (not in the chat)
--   P  Platform admin         a8800000-0000-4000-8000-000000000005
select pg_temp.new_user('a8800000-0000-4000-8000-000000000001', 'Test Alert Sender');
select pg_temp.new_user('a8800000-0000-4000-8000-000000000002', 'Test Alert Alpha');
select pg_temp.new_user('a8800000-0000-4000-8000-000000000003', 'Test Alert None');
select pg_temp.new_user('a8800000-0000-4000-8000-000000000004', 'Test Alert Other');
select pg_temp.new_user('a8800000-0000-4000-8000-000000000005', 'Test Alert Admin');
update public.profiles set display_name = 'Test Alert Sender' where id = 'a8800000-0000-4000-8000-000000000001';
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8800000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8800000-0000-4000-8000-000000000002', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8800000-0000-4000-8000-000000000003', 'active', now()),
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'a8800000-0000-4000-8000-000000000004', 'active', now());
insert into public.user_roles (user_id, role_id)
select 'a8800000-0000-4000-8000-000000000005', r.id from public.roles r where r.key = 'platform_admin';
select pg_temp.device('a8800000-0000-4000-8000-000000000002', 1);
select pg_temp.device('a8800000-0000-4000-8000-000000000004', 2);
-- Outside quiet hours, whatever time the test runs.
insert into private.app_settings (key, value) values ('quiet_hours_off', 'true') on conflict (key) do nothing;

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values ('camera', (select id from public.conversations where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'));

select pg_temp.act_as('a8800000-0000-4000-8000-000000000005');
select public.set_feature_flag('messaging', true);

-- Before launch, only named testers get alerts.
select pg_temp.act_as('a8800000-0000-4000-8000-000000000001');
insert into ctx values ('m1', public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: doors at 9'));
reset role;
select is((select count(*)::int from public.claim_message_alerts((select id from ctx where key = 'm1'))), 0,
  'before launch, nobody but testers is alerted');
insert into public.notification_testers (user_id) values ('a8800000-0000-4000-8000-000000000002');

select pg_temp.act_as('a8800000-0000-4000-8000-000000000001');
insert into ctx values ('m2', public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: doors at 9:15'));
reset role;
create temporary table got as select * from public.claim_message_alerts((select id from ctx where key = 'm2'));
select is((select count(*)::int from got), 1, 'a tester with a phone in the chat is alerted');
select is((select preview from got), 'Fake: doors at 9:15', 'with a short preview in a department chat');
select is((select chat_name from got), 'Camera Operations', 'and where it''s from');
select is((select unread_count from got), 2, 'and how many are waiting');
select is((select count(*)::int from public.claim_message_alerts((select id from ctx where key = 'm2'))), 0,
  'the same message never alerts twice');

-- Cooldown: another message straight away doesn't buzz again.
select pg_temp.act_as('a8800000-0000-4000-8000-000000000001');
insert into ctx values ('m3', public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: and coffee'));
reset role;
select is((select count(*)::int from public.claim_message_alerts((select id from ctx where key = 'm3'))), 0,
  'a busy chat waits 20 seconds between alerts');

-- Looking at the chat now means no alert.
update public.conversation_members set alerted_at = now() - interval '1 minute'
 where user_id = 'a8800000-0000-4000-8000-000000000002';
update public.conversation_members set last_read_at = now()
 where user_id = 'a8800000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.claim_message_alerts((select id from ctx where key = 'm3'))), 0,
  'someone reading the chat right now isn''t alerted');

-- Muted, or the Messages phone choice off, means no alert.
update public.conversation_members set last_read_at = now() - interval '1 minute', muted = true
 where user_id = 'a8800000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.claim_message_alerts((select id from ctx where key = 'm3'))), 0,
  'a muted chat doesn''t alert');
update public.conversation_members set muted = false where user_id = 'a8800000-0000-4000-8000-000000000002';
insert into public.notification_preferences (user_id, kind, email, push)
values ('a8800000-0000-4000-8000-000000000002', 'message', true, false);
select is((select count(*)::int from public.claim_message_alerts((select id from ctx where key = 'm3'))), 0,
  'nor does turning Messages off for the phone');
delete from public.notification_preferences where user_id = 'a8800000-0000-4000-8000-000000000002';

-- A direct message says who it's from, never the words.
update public.organizations set notifications_live = true;
select pg_temp.act_as('a8800000-0000-4000-8000-000000000001');
insert into ctx values ('dm', public.start_direct_conversation('a8800000-0000-4000-8000-000000000004'));
insert into ctx values ('d1', public.send_message((select id from ctx where key = 'dm'), gen_random_uuid(), 'Fake: private'));
reset role;
create temporary table dm_got as select * from public.claim_message_alerts((select id from ctx where key = 'd1'));
select is((select count(*)::int from dm_got), 1, 'after launch, anyone with a phone is alerted');
select is((select preview from dm_got), null, 'a direct message carries no words');
select is((select sender_name from dm_got), 'Test Alert Sender', 'only who it''s from');

-- Quiet hours and the messaging switch still hold.
delete from private.app_settings where key = 'quiet_hours_off';
select pg_temp.act_as('a8800000-0000-4000-8000-000000000005');
select public.set_feature_flag('messaging', false);
reset role;
select is((select count(*)::int from public.claim_message_alerts((select id from ctx where key = 'm3'))), 0,
  'nothing while messaging is off');

-- Message notices from the 15-minute job show under the bell, and never go to phones.
select private.notify('a8800000-0000-4000-8000-000000000002', 'message', 'Fake notice', 'Fake', '/messages', 'fake-message-notice');
select is((select push_status::text from public.notifications where dedupe_key = 'fake-message-notice'), 'none',
  'a message notice never sends a second phone alert');
select is((select email_status::text from public.notifications where dedupe_key = 'fake-message-notice'), 'skipped',
  'or an email');

-- Only the Worker's service role can claim alerts.
select pg_temp.act_as('a8800000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.claim_message_alerts(gen_random_uuid()) $$, '42501', null,
  'nobody signed in can claim alerts');

select * from finish();
rollback;
