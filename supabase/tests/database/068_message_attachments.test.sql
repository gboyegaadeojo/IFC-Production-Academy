-- Photos, GIFs and documents in chats: only files in the chat's own folder, never reused, the
-- right mix, GIPHY addresses only, and only the chat's members open the files.
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

--   A  Camera member   a8400000-0000-4000-8000-000000000001
--   C  Audio member    a8400000-0000-4000-8000-000000000002
--   P  Platform admin  a8400000-0000-4000-8000-000000000003
select pg_temp.new_user('a8400000-0000-4000-8000-000000000001', 'Test Files Member');
select pg_temp.new_user('a8400000-0000-4000-8000-000000000002', 'Test Files Audio');
select pg_temp.new_user('a8400000-0000-4000-8000-000000000003', 'Test Files Admin');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a8400000-0000-4000-8000-000000000001', 'active', now()),
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'a8400000-0000-4000-8000-000000000002', 'active', now());
insert into public.user_roles (user_id, role_id)
select 'a8400000-0000-4000-8000-000000000003', r.id from public.roles r where r.key = 'platform_admin';

create temporary table ctx (key text primary key, id uuid, path text);
grant all on ctx to authenticated;
insert into ctx (key, id) values
  ('camera', (select id from public.conversations where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855')),
  ('audio', (select id from public.conversations where department_id = '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'));
update ctx set path = id::text || '/' where key in ('camera', 'audio');

-- Files already uploaded, as the browser would.
insert into storage.objects (bucket_id, name) values
  ('chat-files', (select path from ctx where key = 'camera') || 'p1/full.webp'),
  ('chat-files', (select path from ctx where key = 'camera') || 'p1/thumb.webp'),
  ('chat-files', (select path from ctx where key = 'camera') || 'd1/file.pdf'),
  ('chat-files', (select path from ctx where key = 'audio') || 'p2/full.webp'),
  ('chat-files', (select path from ctx where key = 'audio') || 'p2/thumb.webp');

select pg_temp.act_as('a8400000-0000-4000-8000-000000000003');
select public.set_feature_flag('messaging', true);

select pg_temp.act_as('a8400000-0000-4000-8000-000000000001');
insert into ctx (key, id) values ('photo', public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), null, null,
  jsonb_build_array(jsonb_build_object('kind', 'photo',
    'full_path', (select path from ctx where key = 'camera') || 'p1/full.webp',
    'thumb_path', (select path from ctx where key = 'camera') || 'p1/thumb.webp',
    'width', 1600, 'height', 1200, 'bytes', 268000))));
select ok((select id from ctx where key = 'photo') is not null, 'a photo sends without words');
select is((select attachments -> 0 ->> 'kind' from public.conversation_messages((select id from ctx where key = 'camera'))
  where id = (select id from ctx where key = 'photo')), 'photo', 'and comes back with the message');

select throws_ok(format($$ select public.send_message(%L, gen_random_uuid(), null, null,
  jsonb_build_array(jsonb_build_object('kind', 'photo', 'full_path', %L, 'thumb_path', %L, 'width', 10, 'height', 10))) $$,
  (select id from ctx where key = 'camera'),
  (select path from ctx where key = 'camera') || 'p1/full.webp', (select path from ctx where key = 'camera') || 'p1/thumb.webp'),
  'P0001', 'invalid_attachment', 'a file already sent can''t be sent again');
select throws_ok(format($$ select public.send_message(%L, gen_random_uuid(), null, null,
  jsonb_build_array(jsonb_build_object('kind', 'photo', 'full_path', %L, 'thumb_path', %L, 'width', 10, 'height', 10))) $$,
  (select id from ctx where key = 'camera'),
  (select path from ctx where key = 'audio') || 'p2/full.webp', (select path from ctx where key = 'audio') || 'p2/thumb.webp'),
  'P0001', 'invalid_attachment', 'nor a file from another chat');
select throws_ok(format($$ select public.send_message(%L, gen_random_uuid(), null, null,
  jsonb_build_array(jsonb_build_object('kind', 'photo', 'full_path', %L, 'thumb_path', %L, 'width', 10, 'height', 10))) $$,
  (select id from ctx where key = 'camera'),
  (select path from ctx where key = 'camera') || 'nothing/full.webp', (select path from ctx where key = 'camera') || 'nothing/thumb.webp'),
  'P0001', 'invalid_attachment', 'nor a file that was never uploaded');
select throws_ok(format($$ select public.send_message(%L, gen_random_uuid(), 'x', null,
  (select jsonb_agg(jsonb_build_object('kind', 'gif', 'gif_id', 'abc', 'gif_url', 'https://media.giphy.com/media/abc/giphy.gif'))
   from generate_series(1, 2))) $$, (select id from ctx where key = 'camera')),
  'P0001', 'invalid_message', 'only photos come several at a time');
select throws_ok(format($$ select public.send_message(%L, gen_random_uuid(), null, null,
  jsonb_build_array(jsonb_build_object('kind', 'gif', 'gif_id', 'abc', 'gif_url', 'https://evil.example.com/a.gif'))) $$,
  (select id from ctx where key = 'camera')),
  'P0001', 'invalid_attachment', 'a GIF must come from GIPHY');
select lives_ok(format($$ select public.send_message(%L, gen_random_uuid(), null, null,
  jsonb_build_array(jsonb_build_object('kind', 'gif', 'gif_id', 'abc123', 'gif_url', 'https://media2.giphy.com/media/abc123/200w.webp',
    'width', 200, 'height', 150))) $$, (select id from ctx where key = 'camera')),
  'a GIPHY GIF sends');
select throws_ok(format($$ select public.send_message(%L, gen_random_uuid(), null, null,
  jsonb_build_array(jsonb_build_object('kind', 'document', 'full_path', %L, 'file_name', 'run.exe', 'mime_type', 'application/x-msdownload'))) $$,
  (select id from ctx where key = 'camera'), (select path from ctx where key = 'camera') || 'd1/file.pdf'),
  'P0001', 'invalid_attachment', 'a program is refused');
insert into ctx (key, id) values ('doc', public.send_message((select id from ctx where key = 'camera'), gen_random_uuid(), 'Fake run sheet', null,
  jsonb_build_array(jsonb_build_object('kind', 'document', 'full_path', (select path from ctx where key = 'camera') || 'd1/file.pdf',
    'file_name', 'Fake run sheet.pdf', 'mime_type', 'application/pdf', 'bytes', 240000))));
select ok((select id from ctx where key = 'doc') is not null, 'a PDF sends');
-- Everything here happens in one instant, so make the document clearly the latest.
reset role;
update public.messages set created_at = now() + interval '1 second' where id = (select id from ctx where key = 'doc');
select pg_temp.act_as('a8400000-0000-4000-8000-000000000001');
select is((select last_attachment_kind from public.my_conversations() where id = (select id from ctx where key = 'camera')),
  'document', 'and the list knows the last message carried a document');

-- Only the chat's members open its files.
select is((select count(*)::int from storage.objects where bucket_id = 'chat-files'
  and name like (select path from ctx where key = 'camera') || '%'), 3, 'a member can open the chat''s files');
select pg_temp.act_as('a8400000-0000-4000-8000-000000000002');
select is((select count(*)::int from storage.objects where bucket_id = 'chat-files'
  and name like (select path from ctx where key = 'camera') || '%'), 0, 'someone outside the chat can''t');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('chat-files', %L) $$,
  (select path from ctx where key = 'camera') || 'x/full.webp'), '42501', null, 'or upload into it');

-- Deleting a message marks its files for removal and stops handing out their paths.
select pg_temp.act_as('a8400000-0000-4000-8000-000000000001');
select public.delete_message((select id from ctx where key = 'photo'));
select is((select attachments -> 0 ->> 'full_path' from public.conversation_messages((select id from ctx where key = 'camera'))
  where id = (select id from ctx where key = 'photo')), null, 'a deleted photo''s file is no longer offered');
reset role;
select ok((select removed_at from public.message_attachments where message_id = (select id from ctx where key = 'photo')) is not null,
  'and is marked for the cleanup job');

select * from finish();
rollback;
