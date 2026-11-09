-- Messaging polish: earlier messages, who's in a chat, and changing who's in a chosen group.
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

--   L  Camera leader (makes the group)  a8700000-0000-4000-8000-000000000001
--   A  Member of the group              a8700000-0000-4000-8000-000000000002
--   B  Added later                      a8700000-0000-4000-8000-000000000003
--   P  Platform admin                   a8700000-0000-4000-8000-000000000004
select pg_temp.new_user('a8700000-0000-4000-8000-000000000001', 'Test Polish Leader');
select pg_temp.new_user('a8700000-0000-4000-8000-000000000002', 'Test Polish Alpha');
select pg_temp.new_user('a8700000-0000-4000-8000-000000000003', 'Test Polish Bravo');
select pg_temp.new_user('a8700000-0000-4000-8000-000000000004', 'Test Polish Admin');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8700000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.user_roles (user_id, role_id)
select 'a8700000-0000-4000-8000-000000000004', r.id from public.roles r where r.key = 'platform_admin';

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select pg_temp.act_as('a8700000-0000-4000-8000-000000000004');
select public.set_feature_flag('messaging', true);

select pg_temp.act_as('a8700000-0000-4000-8000-000000000001');
insert into ctx values ('group', public.create_group_conversation('Fake crew', false,
  array['a8700000-0000-4000-8000-000000000002'::uuid]));
select public.send_message((select id from ctx where key = 'group'), gen_random_uuid(), 'Fake: older');
reset role;
update public.messages set created_at = now() - interval '1 hour' where body = 'Fake: older';
select pg_temp.act_as('a8700000-0000-4000-8000-000000000001');
select public.send_message((select id from ctx where key = 'group'), gen_random_uuid(), 'Fake: newer');

select is((select count(*)::int from public.conversation_messages_before((select id from ctx where key = 'group'), now() - interval '1 minute')),
  1, 'earlier messages come back on request');
select is((select count(*)::int from public.conversation_people((select id from ctx where key = 'group'))), 2,
  'the people in a chat are listed');

select is(public.add_group_members((select id from ctx where key = 'group'), array['a8700000-0000-4000-8000-000000000003'::uuid]), 1,
  'the person who made a group can add someone');
select is(public.add_group_members((select id from ctx where key = 'group'), array['a8700000-0000-4000-8000-000000000003'::uuid]), 0,
  'adding them again changes nothing');
select pg_temp.act_as('a8700000-0000-4000-8000-000000000003');
select ok(private.can_read_conversation((select id from ctx where key = 'group')), 'and they can read it');
select throws_ok($$ select public.remove_group_member((select id from ctx where key = 'group'), 'a8700000-0000-4000-8000-000000000002') $$,
  '42501', 'not_authorized', 'a member can''t remove others');
select lives_ok($$ select public.leave_group((select id from ctx where key = 'group')) $$, 'but can leave');
select ok(not private.can_read_conversation((select id from ctx where key = 'group')), 'and then can''t read it');

select pg_temp.act_as('a8700000-0000-4000-8000-000000000001');
select lives_ok($$ select public.remove_group_member((select id from ctx where key = 'group'), 'a8700000-0000-4000-8000-000000000002') $$,
  'the person who made it can remove someone');
select pg_temp.act_as('a8700000-0000-4000-8000-000000000002');
select ok(not private.can_read_conversation((select id from ctx where key = 'group')), 'who then can''t read it');
select is((select count(*)::int from public.conversation_people((select id from ctx where key = 'group'))), 0,
  'or see who''s in it');
reset role;
select is((select count(*)::int from public.audit_events where target_id = (select id from ctx where key = 'group')
  and action in ('conversation.members_added', 'conversation.left', 'conversation.member_removed')), 3,
  'adding, leaving and removing are audited');

select * from finish();
rollback;
