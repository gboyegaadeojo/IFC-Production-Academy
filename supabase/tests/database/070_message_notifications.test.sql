-- Message notifications: one per person per chat, never for your own messages, not while muted or
-- read, not for brand-new messages, private wording for direct messages, never emailed, and nothing
-- while messaging is off.
begin;
select no_plan();

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

--   A  Camera member   a8600000-0000-4000-8000-000000000001
--   B  Camera member   a8600000-0000-4000-8000-000000000002
--   P  Platform admin  a8600000-0000-4000-8000-000000000003
select pg_temp.new_user('a8600000-0000-4000-8000-000000000001', 'Test Notify Alpha');
select pg_temp.new_user('a8600000-0000-4000-8000-000000000002', 'Test Notify Bravo');
select pg_temp.new_user('a8600000-0000-4000-8000-000000000003', 'Test Notify Admin');
update public.profiles set display_name = 'Test Notify Bravo' where id = 'a8600000-0000-4000-8000-000000000002';
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8600000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8600000-0000-4000-8000-000000000002', 'active', now());
insert into public.user_roles (user_id, role_id)
select 'a8600000-0000-4000-8000-000000000003', r.id from public.roles r where r.key = 'platform_admin';
-- With the launch switch on (ADD-NOTIF-02), so a held email can't pass for a skipped one.
update public.organizations set notifications_live = true;

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values ('camera', (select id from public.conversations where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'));

select pg_temp.act_as('a8600000-0000-4000-8000-000000000003');
select public.set_feature_flag('messaging', true);

-- Bravo sends three messages, five minutes ago.
select pg_temp.act_as('a8600000-0000-4000-8000-000000000002');
select public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: one');
select public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: two');
select public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: three');
reset role;
update public.messages set created_at = now() - interval '5 minutes'
 where conversation_id = (select id from ctx where key = 'camera');
update public.conversation_members set last_read_at = now() - interval '6 minutes'
 where user_id = 'a8600000-0000-4000-8000-000000000002';

select ok(public.queue_message_notifications() >= 1, 'the job writes notices');
select is((select count(*)::int from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'), 1,
  'one notice for the chat, not one per message');
select is((select title from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'),
  '3 new messages in Camera Operations', 'saying how many, and where');
select is((select count(*)::int from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000002' and kind = 'message'), 0,
  'nobody hears about their own messages');
select public.queue_message_notifications();
select is((select count(*)::int from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'), 1,
  'the same messages never notify twice');

-- A brand-new message waits, in case they're reading it now.
select pg_temp.act_as('a8600000-0000-4000-8000-000000000002');
select public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: just now');
reset role;
select public.queue_message_notifications();
select is((select count(*)::int from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'), 1,
  'a message under two minutes old waits');

-- A second batch makes a new notice in the app. Message notices are never emailed (G, 2026-11-09).
update public.messages set created_at = now() - interval '3 minutes' where body = 'Fake: just now';
select public.queue_message_notifications();
select is((select count(*)::int from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'), 2,
  'later messages make a new notice');
select is((select count(*)::int from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'
  and email_status = 'pending'), 0, 'and no message notice is emailed');

-- Muted chats stay quiet.
select pg_temp.act_as('a8600000-0000-4000-8000-000000000001');
select public.set_conversation_muted((select id from ctx where key = 'camera'), true);
select pg_temp.act_as('a8600000-0000-4000-8000-000000000002');
select public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: muted');
reset role;
update public.messages set created_at = now() - interval '3 minutes' where body = 'Fake: muted';
select public.queue_message_notifications();
select is((select count(*)::int from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'), 2,
  'a muted chat doesn''t notify');

-- A direct message says who it's from, never the words.
select pg_temp.act_as('a8600000-0000-4000-8000-000000000002');
insert into ctx values ('dm', public.start_direct_conversation('a8600000-0000-4000-8000-000000000001'));
select public.send_message((select id from ctx where key = 'dm'), gen_random_uuid(), 'Fake: private words');
reset role;
update public.messages set created_at = now() - interval '3 minutes' where body = 'Fake: private words';
select public.queue_message_notifications();
select is((select title from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'
  and link = '/messages/' || (select id from ctx where key = 'dm')), 'New message from Test Notify Bravo', 'a direct message says who');
select ok((select body from public.notifications where user_id = 'a8600000-0000-4000-8000-000000000001' and kind = 'message'
  and link = '/messages/' || (select id from ctx where key = 'dm')) not like '%private words%', 'but not what they wrote');

-- Off means off.
select pg_temp.act_as('a8600000-0000-4000-8000-000000000003');
select public.set_feature_flag('messaging', false);
reset role;
update public.conversation_members set muted = false;
select pg_temp.act_as('a8600000-0000-4000-8000-000000000002');
reset role;
insert into public.messages (conversation_id, sender_id, client_id, body, created_at)
values ((select id from ctx where key = 'camera'), 'a8600000-0000-4000-8000-000000000002', gen_random_uuid(), 'Fake: while off', now() - interval '3 minutes');
update public.conversations set last_message_at = now() where id = (select id from ctx where key = 'camera');
select is(public.queue_message_notifications(), 0, 'nothing is sent while messaging is off');

select * from finish();
rollback;
