-- Team messaging: only a chat's members see it, deletions are audited and never record content, and
-- direct messages are private to the two people. Off unless the flag is on.
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

--   A  Camera member        a8200000-0000-4000-8000-000000000001
--   B  Camera position team a8200000-0000-4000-8000-000000000002 (not a member)
--   C  Audio member         a8200000-0000-4000-8000-000000000003
--   L  Camera leader        a8200000-0000-4000-8000-000000000004
--   P  Platform admin       a8200000-0000-4000-8000-000000000005
select pg_temp.new_user('a8200000-0000-4000-8000-000000000001', 'Test Msg Member');
select pg_temp.new_user('a8200000-0000-4000-8000-000000000002', 'Test Msg Team');
select pg_temp.new_user('a8200000-0000-4000-8000-000000000003', 'Test Msg Audio');
select pg_temp.new_user('a8200000-0000-4000-8000-000000000004', 'Test Msg Leader');
select pg_temp.new_user('a8200000-0000-4000-8000-000000000005', 'Test Msg Admin');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8200000-0000-4000-8000-000000000001', 'active', now()),
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'a8200000-0000-4000-8000-000000000003', 'active', now());
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake chat camera');
insert into public.serving_team_members (role_id, department_id, user_id)
select r.id, r.department_id, 'a8200000-0000-4000-8000-000000000002'
from public.serving_roles r where r.name = 'Fake chat camera';
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8200000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.user_roles (user_id, role_id)
select 'a8200000-0000-4000-8000-000000000005', r.id from public.roles r where r.key = 'platform_admin';

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values
  ('camera', (select id from public.conversations where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855')),
  ('audio', (select id from public.conversations where department_id = '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'));

select ok((select id from ctx where key = 'camera') is not null, 'an active department has a chat');
select is((select count(*)::int from public.conversations c join public.departments d on d.id = c.department_id
  where d.status <> 'active' or d.kind <> 'team'), 0, 'coming-soon departments and topics have none');

-- Off by default: nothing can be read or sent.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.conversations), 0, 'while messaging is off, no chats show');
select throws_ok(
  $$ select public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Hello') $$,
  'P0001', 'messaging_off', 'and nothing can be sent');

select pg_temp.act_as('a8200000-0000-4000-8000-000000000005');
select public.set_feature_flag('messaging', true);

-- Department chats follow membership, position teams, and leadership.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
select ok(private.can_read_conversation((select id from ctx where key = 'camera')), 'a member reads their department''s chat');
select ok(not private.can_read_conversation((select id from ctx where key = 'audio')), 'but not another department''s');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000002');
select ok(private.can_read_conversation((select id from ctx where key = 'camera')), 'someone on a position team reads it too');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000004');
select ok(private.can_read_conversation((select id from ctx where key = 'camera')), 'and so does its leader');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000003');
select ok(not private.can_read_conversation((select id from ctx where key = 'camera')), 'another department''s member doesn''t');

-- Sending is safe to retry.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
insert into ctx values ('m1', public.send_message((select id from ctx where key = 'camera'),
  'a8200000-0000-4000-8000-0000000000a1', 'Fake: camera 2 is on the long lens'));
select is(public.send_message((select id from ctx where key = 'camera'), 'a8200000-0000-4000-8000-0000000000a1', 'Fake: camera 2 is on the long lens'),
  (select id from ctx where key = 'm1'), 'sending again returns the same message');
select throws_ok(
  $$ select public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), '   ') $$,
  'P0001', 'invalid_message', 'an empty message is refused');
select throws_ok($$ insert into public.messages (conversation_id, client_id, body)
  values ((select id from ctx where key = 'camera'), gen_random_uuid(), 'x') $$, '42501', null,
  'nobody writes to the table directly');

select pg_temp.act_as('a8200000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.messages), 0, 'someone outside the chat reads none of it');
select throws_ok(
  $$ select public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Hi') $$,
  '42501', 'not_authorized', 'or sends to it');

-- Unread counts.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000002');
select is((select unread_count from public.my_conversations() where id = (select id from ctx where key = 'camera')), 1,
  'a new message counts as unread');
select public.mark_conversation_read((select id from ctx where key = 'camera'));
select is((select unread_count from public.my_conversations() where id = (select id from ctx where key = 'camera')), 0,
  'and not once read');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
select is((select unread_count from public.my_conversations() where id = (select id from ctx where key = 'camera')), 0,
  'your own messages are never unread');

-- Deleting: your own, or a leader in their department. The audit log never holds the words.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000002');
select throws_ok($$ select public.delete_message((select id from ctx where key = 'm1')) $$, '42501', 'not_authorized',
  'someone else can''t delete your message');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000004');
select lives_ok($$ select public.delete_message((select id from ctx where key = 'm1')) $$, 'the department''s leader can');
reset role;
select is((select body from public.messages where id = (select id from ctx where key = 'm1')), null, 'the words are gone');
select is((select deleted_by from public.messages where id = (select id from ctx where key = 'm1')),
  'a8200000-0000-4000-8000-000000000004'::uuid, 'and it says who deleted it');
select is((select count(*)::int from public.audit_events where action = 'message.deleted'
  and target_id = (select id from ctx where key = 'm1')), 1, 'deleting is audited');
select ok((select metadata::text from public.audit_events where action = 'message.deleted'
  and target_id = (select id from ctx where key = 'm1')) not like '%long lens%', 'without the message');

-- Direct messages: one per pair, seen by the two and nobody else.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
insert into ctx values ('dm', public.start_direct_conversation('a8200000-0000-4000-8000-000000000003'));
select is(public.start_direct_conversation('a8200000-0000-4000-8000-000000000003'), (select id from ctx where key = 'dm'),
  'a pair has one conversation');
insert into ctx values ('d1', public.send_message((select id from ctx where key = 'dm'), gen_random_uuid(), 'Fake: can you swap?'));
select throws_ok($$ select public.start_direct_conversation('a8200000-0000-4000-8000-000000000001') $$,
  'P0001', 'person_not_available', 'nobody messages themselves');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.messages where conversation_id = (select id from ctx where key = 'dm')), 1,
  'the other person reads it');
select throws_ok($$ select public.delete_message((select id from ctx where key = 'd1')) $$, '42501', 'not_authorized',
  'but can''t delete it');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.messages where conversation_id = (select id from ctx where key = 'dm')), 0,
  'a department leader can''t read it');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.messages where conversation_id = (select id from ctx where key = 'dm')), 0,
  'nor can a platform admin (G, 2026-11-09: direct messages are private)');
select is((select count(*)::int from public.conversation_messages((select id from ctx where key = 'dm'))), 0,
  'by any route');
reset role;
select hasnt_function('public', 'review_direct_conversation', 'there''s no way to open someone else''s direct messages');
select is((select count(*)::int from public.capabilities where key = 'message.review'), 0, 'and no capability for it');

-- Group chats: leaders make them, for chosen people or everyone.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
select throws_ok($$ select public.create_group_conversation('Fake group', true, null) $$, '42501', 'not_authorized',
  'a volunteer can''t make a group');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000004');
insert into ctx values ('everyone', public.create_group_conversation('Fake everyone', true, null));
insert into ctx values ('chosen', public.create_group_conversation('Fake chosen',
  false, array['a8200000-0000-4000-8000-000000000002'::uuid]));
select throws_ok($$ select public.create_group_conversation('Fake empty', false, '{}') $$, 'P0001', 'no_members',
  'a chosen group needs someone in it');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000003');
select ok(private.can_read_conversation((select id from ctx where key = 'everyone')), 'everyone reads the everyone chat');
select ok(not private.can_read_conversation((select id from ctx where key = 'chosen')), 'but only chosen people read a chosen group');
insert into ctx values ('g1', public.send_message((select id from ctx where key = 'everyone'), gen_random_uuid(), 'Fake: hello all'));
select pg_temp.act_as('a8200000-0000-4000-8000-000000000002');
select ok(private.can_read_conversation((select id from ctx where key = 'chosen')), 'someone chosen reads it');
select pg_temp.act_as('a8200000-0000-4000-8000-000000000004');
select lives_ok($$ select public.delete_message((select id from ctx where key = 'g1')) $$,
  'the person who made a group can delete messages in it');
select lives_ok($$ select public.rename_group_conversation((select id from ctx where key = 'chosen'), 'Fake renamed') $$,
  'and rename it');
reset role;
select is((select count(*)::int from public.audit_events where action = 'conversation.created'
  and target_id in (select id from ctx where key in ('everyone', 'chosen'))), 2, 'making groups is audited');
select is((select count(*)::int from public.audit_events where action = 'conversation.renamed'), 1, 'and renaming');

-- Switching messaging off hides everything again.
select pg_temp.act_as('a8200000-0000-4000-8000-000000000005');
select public.set_feature_flag('messaging', false);
select pg_temp.act_as('a8200000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.messages), 0, 'with messaging off again, nothing shows');

select * from finish();
rollback;
