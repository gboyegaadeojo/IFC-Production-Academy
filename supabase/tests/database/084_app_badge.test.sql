-- The number on the app's icon: unread notifications and messages together, a message counted
-- once, and the alert senders' lookup only with the database's own token.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Test person (fake): Rae ae…01, with one device.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rae.badge@example.com', '{"full_name": "Test Rae"}', now(), now());

create temporary table ctx (key text primary key, value text);
grant all on ctx to authenticated, anon;
insert into ctx values ('endpoint', 'https://push.example.net/send/fake-badge-device');
select pg_temp.act_as('ae000000-0000-4000-8000-000000000001');
select public.save_push_subscription((select value from ctx where key = 'endpoint'), repeat('B', 87), repeat('a', 22), 'Fake phone');
reset role;
-- A new account may already have something unread (a welcome), so the test counts from here.
insert into ctx values ('before', (select private.app_badge_count('ae000000-0000-4000-8000-000000000001')::text));

-- Two unread, one read, one cleared, and a message notice.
select private.notify('ae000000-0000-4000-8000-000000000001', 'membership_approved', 'Fake one', '', '/home', 'test-badge-1');
select private.notify('ae000000-0000-4000-8000-000000000001', 'course_assigned', 'Fake two', '', '/home', 'test-badge-2');
select private.notify('ae000000-0000-4000-8000-000000000001', 'new_course', 'Fake read', '', '/home', 'test-badge-3');
select private.notify('ae000000-0000-4000-8000-000000000001', 'sop_updated', 'Fake cleared', '', '/home', 'test-badge-4');
select private.notify('ae000000-0000-4000-8000-000000000001', 'message', 'Fake message notice', '', '/messages', 'test-badge-5');
update public.notifications set read_at = now() where dedupe_key = 'test-badge-3';
update public.notifications set cleared_at = now() where dedupe_key = 'test-badge-4';

select pg_temp.act_as('ae000000-0000-4000-8000-000000000001');
select is(public.my_app_badge(), (select value::int from ctx where key = 'before') + 2,
  'unread notifications count, read and cleared ones don''t, and a message notice isn''t counted twice');
reset role;

insert into ctx values ('token', (select value from private.app_settings where key = 'push_dispatch_token'));
set local role anon;
select throws_ok($$ select * from public.push_badges(array[(select value from ctx where key = 'endpoint')]) $$,
  '42501', null, 'a visitor without the token gets nothing');
select throws_ok($$ select * from public.push_badges(array[(select value from ctx where key = 'endpoint')], 'wrong-token') $$,
  '42501', null, 'nor with a wrong one');
select is((select badge from public.push_badges(array[(select value from ctx where key = 'endpoint')], (select value from ctx where key = 'token'))), (select value::int from ctx where key = 'before') + 2,
  'the alert sender gets the number for the device');
reset role;

select pg_temp.act_as('ae000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.push_badges(array[(select value from ctx where key = 'endpoint')]) $$,
  '42501', null, 'someone signed in can''t look up devices either');
reset role;

select * from finish();
rollback;
