-- Task lists (checklist app US-11): default, copy, hide, and a service's list.
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
--   Director    a9000000-0000-4000-8000-000000000001  (Production Director: church-wide checklist.manage)
--   Leader      a9000000-0000-4000-8000-000000000002  (Department Leader, Camera only)
--   Volunteer   a9000000-0000-4000-8000-000000000003
select pg_temp.new_user('a9000000-0000-4000-8000-000000000001', 'Test Lists Director');
select pg_temp.new_user('a9000000-0000-4000-8000-000000000002', 'Test Lists Leader');
select pg_temp.new_user('a9000000-0000-4000-8000-000000000003', 'Test Lists Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a9000000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null),
  ('a9000000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

select is((select count(*)::integer from public.checklist_sets where is_default), 1, 'there is one default list');
insert into ctx values ('default', (select id from public.checklist_sets where is_default));
select is((select name from public.checklist_sets where is_default), 'Pre-Service Checklist',
  'the checklists so far are in the Pre-Service Checklist');

-- A checklist in the default list: two tasks, one hidden, linked to a position.
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Lists Cam');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake Lists Cam'));
insert into public.checklists (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Lists Camera');
insert into ctx values ('list', (select id from public.checklists where name = 'Fake Lists Camera'));
select is((select set_id from public.checklists where id = (select id from ctx where key = 'list')),
  (select id from ctx where key = 'default'), 'new checklists go in the default list');
insert into public.checklist_sections (checklist_id, name, sort_order) values ((select id from ctx where key = 'list'), 'Setup', 10);
insert into public.checklist_items (section_id, text, sort_order, archived_at) values
  ((select id from public.checklist_sections where checklist_id = (select id from ctx where key = 'list')), 'Fake lists power', 10, null),
  ((select id from public.checklist_sections where checklist_id = (select id from ctx where key = 'list')), 'Fake lists lens', 20, null),
  ((select id from public.checklist_sections where checklist_id = (select id from ctx where key = 'list')), 'Fake lists hidden', 30, now());
insert into ctx values ('power', (select id from public.checklist_items where text = 'Fake lists power'));
insert into public.checklist_positions (checklist_id, role_id) values ((select id from ctx where key = 'list'), (select id from ctx where key = 'cam'));

-- Today's service is the current one; another in three days.
insert into public.events (organization_id, title, starts_at, ends_at)
select d.organization_id, 'Fake lists today',
       greatest(((now() at time zone 'America/Winnipeg')::date::timestamp at time zone 'America/Winnipeg'), now() - interval '1 hour'),
       greatest(((now() at time zone 'America/Winnipeg')::date::timestamp at time zone 'America/Winnipeg'), now() - interval '1 hour') + interval '2 hours'
from public.departments d where d.id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855';
insert into public.events (organization_id, title, starts_at, ends_at)
select d.organization_id, 'Fake lists later', now() + interval '3 days', now() + interval '3 days 2 hours'
from public.departments d where d.id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855';
insert into ctx values
  ('today', (select id from public.events where title = 'Fake lists today')),
  ('later', (select id from public.events where title = 'Fake lists later'));

-- Only church-wide checklist managers manage lists.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.create_checklist_set('Nope', '', null) $$, '42501', 'not_authorized',
  'volunteers cannot add task lists');
select throws_ok($$ insert into public.checklist_sets (organization_id, name) select organization_id, 'Nope' from public.profiles where id = auth.uid() $$,
  '42501', null, 'nor write the table directly');
select pg_temp.act_as('a9000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.create_checklist_set('Nope', '', null) $$, '42501', 'not_authorized',
  'a department leader cannot add task lists');
select ok(exists (select 1 from public.checklist_sets), 'but can see them');

-- Empty, and copied.
select pg_temp.act_as('a9000000-0000-4000-8000-000000000001');
insert into ctx values ('empty', public.create_checklist_set('Fake Christmas', 'For Christmas Eve', null));
select throws_ok($$ select public.create_checklist_set('  fake   CHRISTMAS ', '', null) $$, 'P0001', 'name_taken',
  'names are unique ignoring capitals and extra spaces');
insert into ctx values ('copy', public.create_checklist_set('Fake Copy', '', (select id from ctx where key = 'default')));
select is(
  (select count(*)::integer from public.checklist_items i join public.checklists c on c.id = i.checklist_id
    where c.set_id = (select id from ctx where key = 'copy') and c.name = 'Fake Lists Camera'),
  2, 'a copy has the live tasks, not hidden ones'
);
select is(
  (select count(*)::integer from public.checklist_positions cp join public.checklists c on c.id = cp.checklist_id
    where c.set_id = (select id from ctx where key = 'copy')),
  0, 'position links are not copied'
);
select is(
  (select array_agg(text order by sort_order) from public.checklist_items i join public.checklists c on c.id = i.checklist_id
    where c.set_id = (select id from ctx where key = 'copy') and c.name = 'Fake Lists Camera'),
  array['Fake lists power', 'Fake lists lens'], 'in the same order'
);

-- Switching the current service while nothing is ticked, then back.
select public.set_default_checklist_set((select id from ctx where key = 'copy'), true);
select is((select set_id from public.current_service_checklist_set()), (select id from ctx where key = 'copy'),
  'the current service can switch to the new default before anything is ticked');
select public.set_default_checklist_set((select id from ctx where key = 'default'), true);
select is((select set_id from public.current_service_checklist_set()), (select id from ctx where key = 'default'),
  'and back');

-- After a tick, it keeps its list.
select is(public.checklist_tick((select id from ctx where key = 'today'), (select id from ctx where key = 'power'), true), 'ok',
  'a task on the service''s list can be ticked');
select is(
  public.checklist_tick((select id from ctx where key = 'today'),
    (select i.id from public.checklist_items i join public.checklists c on c.id = i.checklist_id
      where c.set_id = (select id from ctx where key = 'copy') and i.text = 'Fake lists power'), true),
  'item_not_found', 'a task on another list cannot'
);
select throws_ok($$ select public.set_default_checklist_set((select id from ctx where key = 'copy'), true) $$,
  'P0001', 'service_has_checkoffs', 'once something is ticked, the current service keeps its list');
select public.set_default_checklist_set((select id from ctx where key = 'copy'), false);
select is((select id from public.checklist_sets where is_default), (select id from ctx where key = 'copy'),
  'the default changes');
select is((select set_id from public.current_service_checklist_set()), (select id from ctx where key = 'default'),
  'the current service keeps the list it started with');
select ok(
  (select count(*) > 0 from public.event_checklists((select id from ctx where key = 'later')) r
     join public.checklists c on c.id = r.checklist_id
    where c.set_id = (select id from ctx where key = 'copy')),
  'later services use the new default'
);
select is(
  (select count(*)::integer from public.event_checklists((select id from ctx where key = 'today')) r
     join public.checklists c on c.id = r.checklist_id
    where c.set_id <> (select id from ctx where key = 'default')),
  0, 'the current service shows only its own list'
);

-- Hiding.
select throws_ok($$ select public.set_checklist_set_hidden((select id from ctx where key = 'copy'), true) $$,
  'P0001', 'list_in_use', 'the default list cannot be hidden');
select throws_ok($$ select public.set_checklist_set_hidden((select id from ctx where key = 'default'), true) $$,
  'P0001', 'list_in_use', 'nor the list the current service uses');
select public.set_checklist_set_hidden((select id from ctx where key = 'empty'), true);
select ok((select archived_at is not null from public.checklist_sets where id = (select id from ctx where key = 'empty')),
  'another list can be hidden');
select throws_ok($$ insert into public.checklists (department_id, name, set_id) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Nope', (select id from ctx where key = 'empty')) $$,
  'P0001', 'list_hidden', 'a hidden list cannot be edited');
select throws_ok($$ select public.create_checklist_set('Fake From Hidden', '', (select id from ctx where key = 'empty')) $$,
  'P0001', 'list_not_found', 'or copied');
insert into ctx values ('reuse', public.create_checklist_set('Fake Christmas', '', null));
select ok((select id from ctx where key = 'reuse') is not null, 'a hidden list''s name is free to reuse');
select throws_ok($$ select public.set_checklist_set_hidden((select id from ctx where key = 'empty'), false) $$,
  'P0001', 'name_taken', 'so restoring it waits until the other is renamed');
select public.update_checklist_set((select id from ctx where key = 'reuse'), 'Fake Christmas 2', '');
select public.set_checklist_set_hidden((select id from ctx where key = 'empty'), false);
select ok((select archived_at is null from public.checklist_sets where id = (select id from ctx where key = 'empty')),
  'then it can be restored');
reset role;

-- Every list change is logged.
select ok(exists (select 1 from public.checklist_log where target_table = 'checklist_sets' and action = 'add' and subject = 'Task list › Fake Christmas'),
  'adding a list is logged');
select ok(exists (select 1 from public.checklist_log where target_table = 'checklist_sets' and action = 'set_default'),
  'changing the default is logged');
select ok(exists (select 1 from public.checklist_log where action = 'switch_service_list' and event_id = (select id from ctx where key = 'today')),
  'switching the current service''s list is logged');
select ok(exists (select 1 from public.checklist_log where target_table = 'checklist_sets' and action = 'hide'),
  'hiding is logged');
select ok(exists (select 1 from public.checklist_log where target_table = 'checklist_sets' and action = 'restore'),
  'restoring is logged');
select ok(exists (select 1 from public.checklist_log where target_table = 'checklist_sets' and action = 'rename'),
  'renaming is logged');

select * from finish();
rollback;
