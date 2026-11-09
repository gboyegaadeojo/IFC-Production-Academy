-- What the Messages screens read: names only for chats you're in, the Leader label, and who may
-- delete. Nothing while messaging is off.
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

--   A  Camera member   a8300000-0000-4000-8000-000000000001
--   L  Camera leader   a8300000-0000-4000-8000-000000000002
--   C  Audio member    a8300000-0000-4000-8000-000000000003
--   P  Platform admin  a8300000-0000-4000-8000-000000000004
select pg_temp.new_user('a8300000-0000-4000-8000-000000000001', 'Test Reads Member');
select pg_temp.new_user('a8300000-0000-4000-8000-000000000002', 'Test Reads Leader');
select pg_temp.new_user('a8300000-0000-4000-8000-000000000003', 'Test Reads Audio');
select pg_temp.new_user('a8300000-0000-4000-8000-000000000004', 'Test Reads Admin');
update public.profiles set display_name = 'Test Reads Member' where id = 'a8300000-0000-4000-8000-000000000001';
update public.profiles set display_name = 'Test Reads Leader' where id = 'a8300000-0000-4000-8000-000000000002';
update public.profiles set display_name = 'Test Reads Audio' where id = 'a8300000-0000-4000-8000-000000000003';
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8300000-0000-4000-8000-000000000001', 'active', now()),
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'a8300000-0000-4000-8000-000000000003', 'active', now());
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8300000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.user_roles (user_id, role_id)
select 'a8300000-0000-4000-8000-000000000004', r.id from public.roles r where r.key = 'platform_admin';

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values
  ('camera', (select id from public.conversations where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'));

select pg_temp.act_as('a8300000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.messaging_people()), 0, 'while messaging is off, nobody is listed');

select pg_temp.act_as('a8300000-0000-4000-8000-000000000004');
select public.set_feature_flag('messaging', true);

select pg_temp.act_as('a8300000-0000-4000-8000-000000000002');
insert into ctx values ('q', public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake: lock focus'));

select pg_temp.act_as('a8300000-0000-4000-8000-000000000001');
insert into ctx values ('a', public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(),
  'Fake: got it', (select id from ctx where key = 'q')));
select is((select title from public.my_conversations() where id = (select id from ctx where key = 'camera')),
  'Camera Operations', 'a department chat is named after its department');
select ok((select last_sender_name from public.my_conversations() where id = (select id from ctx where key = 'camera'))
  in ('Test Reads Member', 'Test Reads Leader'), 'with who sent the last message');
select is((select sender_is_leader from public.conversation_messages((select id from ctx where key = 'camera'))
  where id = (select id from ctx where key = 'q')), true, 'a department leader''s messages carry Leader');
select is((select sender_is_leader from public.conversation_messages((select id from ctx where key = 'camera'))
  where id = (select id from ctx where key = 'a')), false, 'a member''s don''t');
select is((select reply_sender_name from public.conversation_messages((select id from ctx where key = 'camera'))
  where id = (select id from ctx where key = 'a')), 'Test Reads Leader', 'a reply shows what it answers');
select is((select can_moderate from public.conversation_details((select id from ctx where key = 'camera'))), false,
  'a member can''t delete others'' messages');
select ok((select member_count from public.conversation_details((select id from ctx where key = 'camera'))) >= 1,
  'and sees how many people are in it');
select ok(not exists (select 1 from public.messaging_people() where user_id = 'a8300000-0000-4000-8000-000000000001'),
  'you aren''t offered yourself');
select ok(exists (select 1 from public.messaging_people() where user_id = 'a8300000-0000-4000-8000-000000000003'),
  'but anyone else active is');

select pg_temp.act_as('a8300000-0000-4000-8000-000000000002');
select is((select can_moderate from public.conversation_details((select id from ctx where key = 'camera'))), true,
  'the department''s leader can');

select pg_temp.act_as('a8300000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.conversation_messages((select id from ctx where key = 'camera'))), 0,
  'someone outside the chat reads none of it');
select is((select count(*)::int from public.conversation_details((select id from ctx where key = 'camera'))), 0,
  'or its details');
select ok(not exists (select 1 from public.my_conversations() where id = (select id from ctx where key = 'camera')),
  'and it isn''t in their list');

select * from finish();
rollback;
