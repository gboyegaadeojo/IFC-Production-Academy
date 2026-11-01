-- Pre-service checklists (decision record 9, stage 2): editing, ticking per service, resets.
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

-- Test people (all fake):
--   Camera Leader   a4000000-0000-4000-8000-000000000001  (Department Leader, Camera)
--   Operator        a4000000-0000-4000-8000-000000000002  (scheduled as Fake Cam)
--   Director        a4000000-0000-4000-8000-000000000003  (scheduled as Fake TD, which leads)
--   Bystander       a4000000-0000-4000-8000-000000000004  (Camera member, not scheduled)
select pg_temp.new_user('a4000000-0000-4000-8000-000000000001', 'Test Camera Leader');
select pg_temp.new_user('a4000000-0000-4000-8000-000000000002', 'Test Operator');
select pg_temp.new_user('a4000000-0000-4000-8000-000000000003', 'Test Director');
select pg_temp.new_user('a4000000-0000-4000-8000-000000000004', 'Test Bystander');
select pg_temp.new_user('a4000000-0000-4000-8000-000000000005', 'Test Sub');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a4000000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a4000000-0000-4000-8000-000000000002', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a4000000-0000-4000-8000-000000000003', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a4000000-0000-4000-8000-000000000004', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a4000000-0000-4000-8000-000000000005', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Cam'),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake TD');
insert into ctx values
  ('cam', (select id from public.serving_roles where name = 'Fake Cam')),
  ('td', (select id from public.serving_roles where name = 'Fake TD'));
insert into public.serving_team_members (role_id, department_id, user_id) values
  ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a4000000-0000-4000-8000-000000000002'),
  ((select id from ctx where key = 'td'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a4000000-0000-4000-8000-000000000003'),
  ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a4000000-0000-4000-8000-000000000005');

-- Volunteers can't edit checklists.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ insert into public.checklists (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Nope') $$,
  '42501', null, 'volunteers cannot add checklists'
);
reset role;

-- The leader builds a checklist, links it to Fake Cam, and marks Fake TD as leading.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
insert into public.checklists (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Camera Operators');
insert into ctx values ('list', (select id from public.checklists where name = 'Fake Camera Operators'));
insert into public.checklist_sections (checklist_id, name, sort_order) values ((select id from ctx where key = 'list'), 'Setup', 10);
insert into ctx values ('setup', (select id from public.checklist_sections where name = 'Setup' and checklist_id = (select id from ctx where key = 'list')));
insert into public.checklist_items (section_id, text, sort_order) values
  ((select id from ctx where key = 'setup'), 'Power on', 10),
  ((select id from ctx where key = 'setup'), 'Check batteries', 20);
insert into ctx values
  ('power', (select id from public.checklist_items where text = 'Power on' and section_id = (select id from ctx where key = 'setup'))),
  ('batt', (select id from public.checklist_items where text = 'Check batteries' and section_id = (select id from ctx where key = 'setup')));
select public.set_checklist_positions((select id from ctx where key = 'list'), array[(select id from ctx where key = 'cam')]);
select public.set_role_leads_service((select id from ctx where key = 'td'), true);
reset role;
select is(
  (select department_id from public.checklist_items where id = (select id from ctx where key = 'power')),
  'b7ba9dae-cab5-43e0-a996-8ae9d2436855'::uuid, 'items carry their checklist''s department'
);

-- A second checklist, for the leading position only.
insert into public.checklists (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake TD list');
insert into ctx values ('tdlist', (select id from public.checklists where name = 'Fake TD list'));
insert into public.checklist_sections (checklist_id, name, sort_order) values ((select id from ctx where key = 'tdlist'), 'Overview', 10);
insert into public.checklist_items (section_id, text, sort_order) values
  ((select id from public.checklist_sections where checklist_id = (select id from ctx where key = 'tdlist')), 'Walk every position', 10);
insert into ctx values ('walk', (select id from public.checklist_items where text = 'Walk every position'));
insert into public.checklist_positions (checklist_id, role_id) values ((select id from ctx where key = 'tdlist'), (select id from ctx where key = 'td'));

-- A service tomorrow, with both scheduled.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at)
  values ('Fake checklist service', now() + interval '1 day', now() + interval '1 day 2 hours');
insert into ctx values ('event', (select id from public.events where title = 'Fake checklist service'));
select public.assign_to_position(public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam')),
  'a4000000-0000-4000-8000-000000000002');
select public.assign_to_position(public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'td')),
  'a4000000-0000-4000-8000-000000000003');
reset role;

-- The operator sees their checklist first and ticks.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000002');
select ok(
  (select bool_and(is_mine) from public.event_checklists((select id from ctx where key = 'event'))
    where checklist_id = (select id from ctx where key = 'list')),
  'the operator''s checklist is marked as theirs'
);
select is(
  (select count(distinct checklist_id)::int from public.event_checklists((select id from ctx where key = 'event'))
    where is_mine),
  1, 'one checklist is the operator''s own; the page shows it by default'
);
select lives_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'walk'), true) $$,
  'they can still help with another department''s'
);
select lives_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'walk'), false) $$,
  'and untick it'
);
select lives_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'power'), true) $$,
  'the operator ticks an item'
);
select lives_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'power'), true) $$,
  'ticking again is harmless'
);
select is(
  (select checked_by_name from public.event_checklists((select id from ctx where key = 'event'))
    where item_id = (select id from ctx where key = 'power')),
  'Test Operator', 'the tick shows who did it'
);
select throws_ok(
  $$ select public.reset_service_checklists((select id from ctx where key = 'event')) $$,
  '42501', 'not_authorized', 'an operator cannot reset'
);
reset role;

-- Someone not scheduled sees nothing and can't tick.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.event_checklists((select id from ctx where key = 'event')) $$,
  '42501', 'not_authorized', 'someone not scheduled cannot see the service''s checklists'
);
select throws_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'batt'), true) $$,
  '42501', 'not_authorized', 'or tick them'
);
reset role;

-- A team member who isn't scheduled can still help.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000005');
select is(
  (select bool_or(is_mine) from public.event_checklists((select id from ctx where key = 'event'))),
  false, 'someone not scheduled has no checklist of their own'
);
select lives_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'batt'), true) $$,
  'but a team member can still tick'
);
select lives_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'batt'), false) $$,
  'and untick'
);
reset role;

-- History keeps the text as it was.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
update public.checklist_items set text = 'Power on everything' where id = (select id from ctx where key = 'power');
reset role;
select is(
  (select item_text from public.checklist_checkoffs where item_id = (select id from ctx where key = 'power')),
  'Power on', 'a tick keeps the item''s text as it was'
);

-- The director (leading position) sees every checklist, ticks any, resets, and undoes.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000003');
select is(
  (select count(distinct checklist_id)::int from public.event_checklists((select id from ctx where key = 'event'))),
  2, 'whoever leads the service sees every checklist'
);
select lives_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'batt'), true) $$,
  'and can tick anyone''s'
);
select lives_ok(
  $$ select public.set_checklist_item((select id from ctx where key = 'event'), (select id from ctx where key = 'batt'), false) $$,
  'or untick it'
);
select is(public.reset_service_checklists((select id from ctx where key = 'event')), 1, 'the director resets');
select is(
  (select count(*)::int from public.event_checklists((select id from ctx where key = 'event')) where checked_at is not null),
  0, 'after a reset nothing is ticked'
);
select throws_ok(
  $$ select public.reset_service_checklists((select id from ctx where key = 'event')) $$,
  'P0001', 'nothing_to_reset', 'a reset with nothing ticked is refused, so the undo is kept'
);
select is(public.undo_checklist_reset((select id from ctx where key = 'event')), 1, 'and undoes it');
select is(
  (select count(*)::int from public.event_checklists((select id from ctx where key = 'event')) where checked_at is not null),
  1, 'the tick is back'
);
select throws_ok(
  $$ select public.undo_checklist_reset((select id from ctx where key = 'event')) $$,
  'P0001', 'nothing_to_undo', 'one undo per reset'
);
reset role;
select ok(
  exists (select 1 from public.audit_events where action = 'checklist.reset'),
  'resets are audited'
);

-- Closed long before the service.
select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
insert into public.events (title, starts_at, ends_at)
  values ('Fake far service', now() + interval '10 days', now() + interval '10 days 2 hours');
select public.assign_to_position(public.add_event_position((select id from public.events where title = 'Fake far service'), (select id from ctx where key = 'cam')),
  'a4000000-0000-4000-8000-000000000002');
reset role;
select pg_temp.act_as('a4000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.set_checklist_item((select id from public.events where title = 'Fake far service'), (select id from ctx where key = 'batt'), true) $$,
  'P0001', 'checklist_closed', 'ticking opens two days before the service'
);
reset role;

select * from finish();
rollback;
