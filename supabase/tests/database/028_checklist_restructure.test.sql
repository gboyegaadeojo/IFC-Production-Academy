-- Restructuring checklists (checklist app US-12, US-12a, US-13, US-13a): order, Move to…,
-- hiding, and restoring.
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
--   Director     aa000000-0000-4000-8000-000000000001  (Production Director: every department)
--   Cam Leader   aa000000-0000-4000-8000-000000000002  (Department Leader, Camera only)
--   Volunteer    aa000000-0000-4000-8000-000000000003
select pg_temp.new_user('aa000000-0000-4000-8000-000000000001', 'Test Move Director');
select pg_temp.new_user('aa000000-0000-4000-8000-000000000002', 'Test Move Leader');
select pg_temp.new_user('aa000000-0000-4000-8000-000000000003', 'Test Move Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('aa000000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null),
  ('aa000000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- Two department checklists (Camera, Audio), and a role linked to the camera one.
insert into public.checklists (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Move Camera'),
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'Fake Move Audio');
insert into ctx values
  ('cam', (select id from public.checklists where name = 'Fake Move Camera')),
  ('aud', (select id from public.checklists where name = 'Fake Move Audio'));
select ok(
  (select sort_order from public.checklists where id = (select id from ctx where key = 'aud'))
    > (select sort_order from public.checklists where id = (select id from ctx where key = 'cam')),
  'new checklists go at the end of their list'
);
insert into public.checklist_sections (checklist_id, name, sort_order) values
  ((select id from ctx where key = 'cam'), 'Fake Setup', 10),
  ((select id from ctx where key = 'cam'), 'Fake After', 20),
  ((select id from ctx where key = 'aud'), 'Fake Mics', 10);
insert into ctx values
  ('setup', (select id from public.checklist_sections where name = 'Fake Setup')),
  ('after', (select id from public.checklist_sections where name = 'Fake After')),
  ('mics', (select id from public.checklist_sections where name = 'Fake Mics'));
insert into public.checklist_items (section_id, text, sort_order) values
  ((select id from ctx where key = 'setup'), 'Fake power', 10),
  ((select id from ctx where key = 'setup'), 'Fake lens', 20),
  ((select id from ctx where key = 'after'), 'Fake cap', 10),
  ((select id from ctx where key = 'mics'), 'Fake batteries', 10);
insert into ctx values
  ('power', (select id from public.checklist_items where text = 'Fake power')),
  ('lens', (select id from public.checklist_items where text = 'Fake lens')),
  ('cap', (select id from public.checklist_items where text = 'Fake cap'));
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Move Cam');
insert into public.checklist_positions (checklist_id, role_id)
  values ((select id from ctx where key = 'cam'), (select id from public.serving_roles where name = 'Fake Move Cam'));

-- Moving needs checklist.manage in both departments.
select pg_temp.act_as('aa000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.move_checklist_item((select id from ctx where key = 'power'), (select id from ctx where key = 'after')) $$,
  '42501', 'not_authorized', 'volunteers cannot move tasks');
select pg_temp.act_as('aa000000-0000-4000-8000-000000000002');
select public.move_checklist_item((select id from ctx where key = 'power'), (select id from ctx where key = 'after'));
select is((select section_id from public.checklist_items where id = (select id from ctx where key = 'power')),
  (select id from ctx where key = 'after'), 'a leader moves a task to another section of their department');
select ok(
  (select sort_order from public.checklist_items where id = (select id from ctx where key = 'power'))
    > (select sort_order from public.checklist_items where id = (select id from ctx where key = 'cap')),
  'it goes at the end'
);
select throws_ok($$ select public.move_checklist_item((select id from ctx where key = 'lens'), (select id from ctx where key = 'mics')) $$,
  '42501', 'not_authorized', 'but not into a department they do not manage');

-- The director moves a task, and a whole section, to Audio.
select pg_temp.act_as('aa000000-0000-4000-8000-000000000001');
select public.move_checklist_item((select id from ctx where key = 'lens'), (select id from ctx where key = 'mics'));
select is((select department_id from public.checklist_items where id = (select id from ctx where key = 'lens')),
  '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'::uuid, 'a task moves to a section in another department');
select public.move_checklist_section((select id from ctx where key = 'after'), (select id from ctx where key = 'aud'));
select is(
  (select array_agg(distinct checklist_id) from public.checklist_items where section_id = (select id from ctx where key = 'after')),
  array[(select id from ctx where key = 'aud')], 'a section moves with its tasks'
);
select is((select department_id from public.checklist_sections where id = (select id from ctx where key = 'after')),
  '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'::uuid, 'to the other department');

-- Only to live places in the same list.
update public.checklist_sections set archived_at = now() where id = (select id from ctx where key = 'setup');
select throws_ok($$ select public.move_checklist_item((select id from ctx where key = 'cap'), (select id from ctx where key = 'setup')) $$,
  'P0001', 'move_not_allowed', 'nothing moves into a hidden section');
insert into ctx values ('other', public.create_checklist_set('Fake Move Other', '', null));
insert into public.checklists (department_id, name, set_id)
  values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Other Camera', (select id from ctx where key = 'other'));
select throws_ok($$ select public.move_checklist_section((select id from ctx where key = 'mics'), (select id from public.checklists where name = 'Fake Other Camera')) $$,
  'P0001', 'move_not_allowed', 'nor to another task list');

-- Hiding a department checklist removes its position links.
update public.checklists set archived_at = now() where id = (select id from ctx where key = 'cam');
select is((select count(*)::integer from public.checklist_positions where checklist_id = (select id from ctx where key = 'cam')),
  0, 'a hidden checklist loses its position links');

-- Hidden items, newest first, with where they were.
select ok(
  (select array_agg(kind order by hidden_at desc, kind) from public.checklist_hidden_items(private.default_checklist_set())
    where name in ('Fake Move Camera', 'Fake Setup')) = array['checklist', 'section'],
  'hidden items list checklists and sections, newest first'
);
select is(
  (select parent_hidden from public.checklist_hidden_items(private.default_checklist_set()) where name = 'Fake Setup'),
  true, 'and say when the parent is hidden too'
);

-- Restoring.
select throws_ok($$ select public.restore_checklist_part('section', (select id from ctx where key = 'setup'), false) $$,
  'P0001', 'parent_hidden', 'a section is not restored into a hidden checklist');
select throws_ok($$ update public.checklist_sections set archived_at = null where id = (select id from ctx where key = 'setup') $$,
  'P0001', 'parent_hidden', 'not even directly');
select public.restore_checklist_part('section', (select id from ctx where key = 'setup'), true);
select ok(
  (select c.archived_at is null and s.archived_at is null
     from public.checklist_sections s join public.checklists c on c.id = s.checklist_id
    where s.id = (select id from ctx where key = 'setup')),
  'with its parent, both come back'
);
select is((select count(*)::integer from public.checklist_positions where checklist_id = (select id from ctx where key = 'cam')),
  0, 'position links are not restored');
reset role;

-- Every move and restore is logged.
select ok(exists (select 1 from public.checklist_log where action = 'move' and target_id = (select id from ctx where key = 'after')),
  'moving a section is logged');
select ok(exists (select 1 from public.checklist_log where action = 'move' and target_id = (select id from ctx where key = 'lens')),
  'moving a task is logged');
select ok(exists (select 1 from public.checklist_log where action = 'restore' and target_id = (select id from ctx where key = 'setup')),
  'restoring is logged');
select ok(exists (select 1 from public.checklist_log where action = 'unlink_position' and subject like 'Fake Move Camera%'),
  'removing position links is logged');

select * from finish();
rollback;
