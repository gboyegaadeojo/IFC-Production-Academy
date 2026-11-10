-- Onboarding pathway version history: saved as people edit, read only by those who look after the
-- pathway, never written directly, and restored without deleting anything.
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

-- Test people (fake): Director A c3…01 and Director B c3…02 (onboarding, organisation-wide);
-- Camera Leader c3…03 (department leader, Camera); Volunteer c3…04.
select pg_temp.new_user('c3000000-0000-4000-8000-000000000001', 'Test Director A');
select pg_temp.new_user('c3000000-0000-4000-8000-000000000002', 'Test Director B');
select pg_temp.new_user('c3000000-0000-4000-8000-000000000003', 'Test Camera Leader');
select pg_temp.new_user('c3000000-0000-4000-8000-000000000004', 'Test Volunteer');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated, anon;
insert into public.roles (organization_id, key, name, department_scoped)
select id, 'test_versions_lead', 'Test versions lead', false from public.organizations order by created_at limit 1;
insert into ctx values ('role', (select id from public.roles where key = 'test_versions_lead'));
insert into public.role_capabilities (role_id, capability_id)
select (select id from ctx where key = 'role'), c.id from public.capabilities c where c.key = 'onboarding.manage';
insert into public.user_roles (user_id, role_id) values
  ('c3000000-0000-4000-8000-000000000001', (select id from ctx where key = 'role')),
  ('c3000000-0000-4000-8000-000000000002', (select id from ctx where key = 'role'));
insert into public.user_roles (user_id, role_id, department_id) values
  ('c3000000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

-- Director A builds a general pathway in one sitting.
select pg_temp.act_as('c3000000-0000-4000-8000-000000000001');
insert into public.onboarding_pathways (organization_id, name)
select id, 'Test versions pathway' from public.organizations order by created_at limit 1;
insert into ctx values ('path', (select id from public.onboarding_pathways where name = 'Test versions pathway'));
insert into public.onboarding_stages (pathway_id, name, timing, sort_order)
values ((select id from ctx where key = 'path'), 'Interested', 'Day 0', 10);
insert into ctx values ('stage', (select id from public.onboarding_stages where pathway_id = (select id from ctx where key = 'path')));
insert into public.onboarding_steps (pathway_id, stage_id, kind, title, config, sort_order) values
  ((select id from ctx where key = 'path'), (select id from ctx where key = 'stage'), 'trigger_form', 'Form', '{}', 10),
  ((select id from ctx where key = 'path'), (select id from ctx where key = 'stage'), 'finish', 'Done', '{}', 20);
reset role;

select is((select count(*)::int from public.onboarding_pathway_versions where pathway_id = (select id from ctx where key = 'path')), 1,
  'one sitting of changes is one version');
select is((select jsonb_array_length(snapshot -> 'steps') from public.onboarding_pathway_versions
            where pathway_id = (select id from ctx where key = 'path') and number = 1), 2,
  'the version holds the pathway as it was after the changes');

-- Director B changes it: a new version.
select pg_temp.act_as('c3000000-0000-4000-8000-000000000002');
update public.onboarding_steps set title = 'Renamed form' where pathway_id = (select id from ctx where key = 'path') and kind = 'trigger_form';
insert into public.onboarding_steps (pathway_id, stage_id, kind, title, config, sort_order)
values ((select id from ctx where key = 'path'), (select id from ctx where key = 'stage'), 'notify', 'Extra', '{}', 15);
select is((select count(*)::int from public.onboarding_pathway_versions where pathway_id = (select id from ctx where key = 'path')), 2,
  'someone else''s changes are the next version');
select is((select count(*)::int from public.onboarding_pathway_versions where pathway_id = (select id from ctx where key = 'path')), 2,
  'whoever looks after the pathway can read its history');
select throws_ok(
  $$ insert into public.onboarding_pathway_versions (pathway_id, number, snapshot)
     values ((select id from ctx where key = 'path'), 9, '{}') $$,
  '42501', null, 'nobody writes a version directly');
select throws_ok(
  $$ update public.onboarding_pathway_versions set number = 99 where pathway_id = (select id from ctx where key = 'path') $$,
  '42501', null, 'nobody can change a saved version');
reset role;
select is((select count(*)::int from public.onboarding_pathway_versions where number = 99), 0,
  'so history is unchanged');

-- The Camera leader and a volunteer can't see or restore it.
select pg_temp.act_as('c3000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.onboarding_pathway_versions where pathway_id = (select id from ctx where key = 'path')), 0,
  'a department leader cannot read the general pathway''s history');
select throws_ok(
  $$ select public.restore_onboarding_pathway_version(
       (select id from public.onboarding_pathway_versions where number = 1 and pathway_id = (select id from ctx where key = 'path'))) $$,
  '42501', null, 'or restore it (they cannot even find the version)');
reset role;
insert into ctx values ('v1', (select id from public.onboarding_pathway_versions where number = 1 and pathway_id = (select id from ctx where key = 'path')));
select pg_temp.act_as('c3000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.restore_onboarding_pathway_version((select id from ctx where key = 'v1')) $$,
  '42501', 'not_authorized', 'a department leader cannot restore it by its id either');
reset role;
select pg_temp.act_as('c3000000-0000-4000-8000-000000000004');
select throws_ok($$ select public.restore_onboarding_pathway_version((select id from ctx where key = 'v1')) $$,
  '42501', 'not_authorized', 'a volunteer cannot restore it');
reset role;

-- Director A restores version 1.
select pg_temp.act_as('c3000000-0000-4000-8000-000000000001');
select is(public.restore_onboarding_pathway_version((select id from ctx where key = 'v1')), 3,
  'restoring saves a new version');
reset role;
select is((select restored_from from public.onboarding_pathway_versions where pathway_id = (select id from ctx where key = 'path') and number = 3), 1,
  'which says what it was restored from');
select is((select title from public.onboarding_steps where pathway_id = (select id from ctx where key = 'path') and kind = 'trigger_form'), 'Form',
  'the step is named as it was');
select isnt((select archived_at from public.onboarding_steps where pathway_id = (select id from ctx where key = 'path') and title = 'Extra'), null,
  'the step added since is archived, not deleted');
select is((select count(*)::int from public.onboarding_pathway_versions where pathway_id = (select id from ctx where key = 'path')), 3,
  'the whole restore is one version');
select ok(exists (select 1 from public.audit_events where action = 'onboarding_pathway_version.created'),
  'saving a version is audited');

select * from finish();
rollback;
