-- The checklist activity log (checklist app US-07a, US-13b): every attempt and every edit,
-- append-only, readable only by checklist managers.
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_id::text || '@example.com', jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated', 'session_id', 'fake-session')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Test people (all fake):
--   Leader     a7000000-0000-4000-8000-000000000001  (Department Leader, Camera: checklist.manage)
--   Operator   a7000000-0000-4000-8000-000000000002  (scheduled)
--   Outsider   a7000000-0000-4000-8000-000000000003  (signed in, not on the team)
select pg_temp.new_user('a7000000-0000-4000-8000-000000000001', 'Test Log Leader');
select pg_temp.new_user('a7000000-0000-4000-8000-000000000002', 'Test Log Operator');
select pg_temp.new_user('a7000000-0000-4000-8000-000000000003', 'Test Log Outsider');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7000000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Log Cam');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake Log Cam'));
insert into public.serving_team_members (role_id, department_id, user_id) values
  ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7000000-0000-4000-8000-000000000002');

-- The leader builds a checklist: each step is logged as an edit.
select pg_temp.act_as('a7000000-0000-4000-8000-000000000001');
insert into public.checklists (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Log List');
insert into ctx values ('list', (select id from public.checklists where name = 'Fake Log List'));
insert into public.checklist_sections (checklist_id, name, sort_order) values ((select id from ctx where key = 'list'), 'Setup', 10);
insert into public.checklist_items (section_id, text, sort_order)
  values ((select id from public.checklist_sections where checklist_id = (select id from ctx where key = 'list')), 'Fake power on', 10);
insert into ctx values ('item', (select id from public.checklist_items where text = 'Fake power on'));
update public.checklist_items set text = 'Fake power on everything' where id = (select id from ctx where key = 'item');
insert into public.events (title, starts_at, ends_at)
  values ('Fake log service', now() + interval '1 day', now() + interval '1 day 2 hours');
insert into ctx values ('event', (select id from public.events where title = 'Fake log service'));
select public.assign_to_position(public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam')),
  'a7000000-0000-4000-8000-000000000002');
reset role;

select is(
  (select count(*)::int from public.checklist_log where kind = 'edit' and action = 'add'
     and target_id in ((select id from ctx where key = 'list'), (select id from ctx where key = 'item'))),
  2, 'adding a checklist and a task is logged'
);
select is(
  (select before ->> 'text' || ' → ' || (after ->> 'text') from public.checklist_log
    where action = 'edit' and target_id = (select id from ctx where key = 'item')),
  'Fake power on → Fake power on everything', 'an edit keeps the before and after text'
);
select is(
  (select actor_name from public.checklist_log where action = 'edit' and target_id = (select id from ctx where key = 'item')),
  'Test Log Leader', 'and who made it'
);

-- Check-offs: done, unchanged, and refused are all logged.
select pg_temp.act_as('a7000000-0000-4000-8000-000000000002');
select is(public.checklist_tick((select id from ctx where key = 'event'), (select id from ctx where key = 'item'), true, 'tab-a'), 'ok', 'a tick');
select is(public.checklist_tick((select id from ctx where key = 'event'), (select id from ctx where key = 'item'), true, 'tab-a'), 'ok', 'the same tick again');
select is(public.checklist_reset((select id from ctx where key = 'event'), 'tab-a') ->> 'reason', 'not_authorized', 'a refused reset');
select throws_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'item'), false) $$,
  '42501', null, 'the unlogged function can''t be called directly'
);
select is((select count(*)::int from public.checklist_log), 0, 'volunteers cannot read the log');
reset role;

select pg_temp.act_as('a7000000-0000-4000-8000-000000000003');
select is(public.checklist_tick((select id from ctx where key = 'event'), (select id from ctx where key = 'item'), false, 'tab-b'),
  'not_authorized', 'someone not on the team is refused');
reset role;

select is(
  (select array_agg(action || ':' || outcome order by happened_at) from public.checklist_log
    where kind = 'checkoff' and event_id = (select id from ctx where key = 'event')),
  array['check:ok', 'check:unchanged', 'reset:refused', 'uncheck:refused'],
  'every attempt is logged: done, unchanged, and refused'
);
select is(
  (select reason from public.checklist_log where kind = 'checkoff' and action = 'uncheck'),
  'not_authorized', 'with why it was refused'
);
select is(
  (select tab_id || ' ' || session_id from public.checklist_log where kind = 'checkoff' and outcome = 'ok'),
  'tab-a fake-session', 'with the browser tab and sign-in session'
);

-- Managers read it.
select pg_temp.act_as('a7000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.checklist_log) >= 7, 'checklist managers read the log');
reset role;

-- Nobody can change or delete it, not even directly in the database.
select throws_ok(
  $$ update public.checklist_log set actor_name = 'someone else' $$,
  '42501', 'checklist_log is append-only', 'entries cannot be edited'
);
select throws_ok(
  $$ delete from public.checklist_log $$,
  '42501', 'checklist_log is append-only', 'or deleted'
);

select * from finish();
rollback;
