-- Chat cleanup: old and deleted files are listed for removal, GIFs never are, old messages go once
-- their files have, only Platform Admins change the limits, and only the job can run it.
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

--   A  Camera member   a8500000-0000-4000-8000-000000000001
--   P  Platform admin  a8500000-0000-4000-8000-000000000002
select pg_temp.new_user('a8500000-0000-4000-8000-000000000001', 'Test Cleanup Member');
select pg_temp.new_user('a8500000-0000-4000-8000-000000000002', 'Test Cleanup Admin');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8500000-0000-4000-8000-000000000001', 'active', now());
insert into public.user_roles (user_id, role_id)
select 'a8500000-0000-4000-8000-000000000002', r.id from public.roles r where r.key = 'platform_admin';

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values ('camera', (select id from public.conversations where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'));

-- Three messages from the past, as if sent long ago: a photo, a GIF, and words only.
insert into public.messages (id, conversation_id, sender_id, client_id, body, created_at) values
  ('a8500000-0000-4000-8000-0000000000a1', (select id from ctx where key = 'camera'), 'a8500000-0000-4000-8000-000000000001', gen_random_uuid(), null, now() - interval '100 days'),
  ('a8500000-0000-4000-8000-0000000000a2', (select id from ctx where key = 'camera'), 'a8500000-0000-4000-8000-000000000001', gen_random_uuid(), null, now() - interval '100 days'),
  ('a8500000-0000-4000-8000-0000000000a3', (select id from ctx where key = 'camera'), 'a8500000-0000-4000-8000-000000000001', gen_random_uuid(), 'Fake: long ago', now() - interval '4 years'),
  ('a8500000-0000-4000-8000-0000000000a4', (select id from ctx where key = 'camera'), 'a8500000-0000-4000-8000-000000000001', gen_random_uuid(), 'Fake: recent', now());
insert into public.message_attachments (message_id, conversation_id, kind, full_path, thumb_path, width, height, gif_id, gif_url, created_at) values
  ('a8500000-0000-4000-8000-0000000000a1', (select id from ctx where key = 'camera'), 'photo', 'x/old/full.webp', 'x/old/thumb.webp', 10, 10, null, null, now() - interval '100 days'),
  ('a8500000-0000-4000-8000-0000000000a2', (select id from ctx where key = 'camera'), 'gif', null, null, 10, 10, 'abc', 'https://media.giphy.com/media/abc/200w.webp', now() - interval '100 days');

select is((select count(*)::int from public.chat_files_to_delete(100)), 1, 'a photo older than 90 days is listed for removal');
select ok(not exists (select 1 from public.chat_files_to_delete(100) f
  join public.message_attachments a on a.id = f.id where a.kind = 'gif'), 'a GIF never is');
select is(public.mark_chat_files_deleted(array(select id from public.chat_files_to_delete(100))), 1, 'the job marks it removed');
select ok((select removed_at is not null and files_deleted_at is not null from public.message_attachments
  where message_id = 'a8500000-0000-4000-8000-0000000000a1'), 'so the chat says the photo is no longer available');
select is((select count(*)::int from public.chat_files_to_delete(100)), 0, 'and it isn''t listed again');

select is(public.purge_old_messages(100), 1, 'text older than 3 years goes');
select ok(not exists (select 1 from public.messages where id = 'a8500000-0000-4000-8000-0000000000a3'), 'that message is gone');
select ok(exists (select 1 from public.messages where id = 'a8500000-0000-4000-8000-0000000000a4'), 'recent ones stay');
select ok(exists (select 1 from public.messages where id = 'a8500000-0000-4000-8000-0000000000a1'),
  'and a 100-day-old message stays, saying its photo is gone');
select ok((select database_bytes from public.platform_usage()) > 0, 'usage reports the database size');

-- Only Platform Admins change the limits, within bounds. Only the job runs the cleanup.
select pg_temp.act_as('a8500000-0000-4000-8000-000000000001');
select throws_ok($$ select public.set_messaging_retention(60, 2) $$, '42501', 'not_authorized', 'a member can''t change how long things are kept');
select throws_ok($$ select * from public.chat_files_to_delete(10) $$, '42501', null, 'or run the cleanup');
select throws_ok($$ select * from public.platform_usage() $$, '42501', null, 'or read usage');
select pg_temp.act_as('a8500000-0000-4000-8000-000000000002');
select throws_ok($$ select public.set_messaging_retention(10, 2) $$, 'P0001', 'invalid_retention', 'fewer than 30 days is refused');
select lives_ok($$ select public.set_messaging_retention(60, 2) $$, 'a platform admin can change it');
select is((select chat_file_days from public.messaging_settings()), 60, 'and everyone sees the new limit');
reset role;
select ok(exists (select 1 from public.audit_events where target_table = 'organizations'
  and metadata -> 'changed' ? 'chat_file_days'), 'the change is audited');

select * from finish();
rollback;
