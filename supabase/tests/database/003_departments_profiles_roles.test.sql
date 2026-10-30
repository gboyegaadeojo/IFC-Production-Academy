-- Departments as data, profiles, roles, suspension, and the append-only audit log.
-- SRS-CUR-009, SRS-AUTH-004, SRS-AUTH-006, SRS-AUTH-007, SRS-RBAC-002, SRS-RBAC-005, SRS-AUDIT-001.
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

-- Test people:
--   Volunteer      20000000-0000-4000-8000-000000000001
--   Other person   20000000-0000-4000-8000-000000000002
--   Camera Leader  20000000-0000-4000-8000-000000000003
--   Platform Admin 20000000-0000-4000-8000-000000000006
select pg_temp.new_user('20000000-0000-4000-8000-000000000001', 'Test Volunteer');
select pg_temp.new_user('20000000-0000-4000-8000-000000000002', 'Test Other Person');
select pg_temp.new_user('20000000-0000-4000-8000-000000000003', 'Test Camera Leader');
select pg_temp.new_user('20000000-0000-4000-8000-000000000006', 'Test Platform Admin');
insert into public.user_roles (user_id, role_id, department_id) values
  ('20000000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('20000000-0000-4000-8000-000000000006', 'd8b78629-6772-4a39-8c9f-be33ba201e05', null);

-- An inactive department nobody should browse.
insert into public.departments (id, organization_id, slug, name, status, hue, icon, sort_order) values
  ('20000000-0000-4000-8000-0000000000d1', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'test-inactive',
   'Test Inactive Department', 'inactive', 'blue', 'camera', 999);

-- ---------------------------------------------------------------------------
-- Sign-up creates a profile and the baseline Volunteer role
-- ---------------------------------------------------------------------------
select is(
  (select display_name from public.profiles where id = '20000000-0000-4000-8000-000000000001'),
  'Test Volunteer',
  'a new sign-in gets a profile named from their account'
);
select is(
  (select r.key from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = '20000000-0000-4000-8000-000000000001'),
  'volunteer',
  'a new sign-in gets the Volunteer role'
);

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
select pg_temp.act_as('20000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select slug, status::text from public.departments order by sort_order $$,
  $$ values ('camera-operations', 'active'),
            ('audio-engineering', 'active'),
            ('computer-graphics-propresenter', 'active'),
            ('camera-directing', 'active'),
            ('lighting-operations', 'coming_soon') $$,
  'a volunteer sees the five departments, with Lighting Operations coming soon'
);
select lives_ok(
  $$ update public.departments set status = 'active' where slug = 'lighting-operations' $$,
  'an update without department.manage runs but matches no rows'
);
select throws_ok(
  $$ insert into public.departments (organization_id, slug, name, hue, icon)
     values ('fb45e05a-0afd-4170-aeab-622886acfc17', 'test-new', 'Test New', 'blue', 'camera') $$,
  '42501',
  null,
  'a volunteer cannot create a department'
);
reset role;
select is(
  (select status::text from public.departments where slug = 'lighting-operations'),
  'coming_soon',
  'a volunteer cannot activate a department'
);

-- Activating Lighting Operations is a data change, not a deploy (SRS-CUR-009).
select pg_temp.act_as('20000000-0000-4000-8000-000000000006');
select isnt_empty(
  $$ select 1 from public.departments where slug = 'test-inactive' $$,
  'a department manager can see inactive departments'
);
update public.departments set status = 'active' where slug = 'lighting-operations';
reset role;
select is(
  (select status::text from public.departments where slug = 'lighting-operations'),
  'active',
  'a department manager can activate Lighting Operations'
);
select is(
  (select count(*)::int from public.audit_events
    where action = 'department.updated'
      and target_id = 'e15ed31d-af2b-48c6-b9b3-bbcda082c7c2'
      and actor_id = '20000000-0000-4000-8000-000000000006'
      and metadata -> 'status' ->> 'from' = 'coming_soon'
      and metadata -> 'status' ->> 'to' = 'active'),
  1,
  'activating a department writes an audit event with the status change'
);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
select pg_temp.act_as('20000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ update public.profiles set display_name = 'Test Volunteer Renamed'
      where id = '20000000-0000-4000-8000-000000000001' $$,
  'people can change their own display name'
);
select throws_ok(
  $$ update public.profiles set status = 'active' where id = '20000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'people cannot change their own account status'
);
update public.profiles set display_name = 'Hijacked' where id = '20000000-0000-4000-8000-000000000002';
reset role;
select is(
  (select display_name from public.profiles where id = '20000000-0000-4000-8000-000000000002'),
  'Test Other Person',
  'people cannot change someone else''s profile'
);

-- ---------------------------------------------------------------------------
-- Roles and capabilities
-- ---------------------------------------------------------------------------
select pg_temp.act_as('20000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.user_roles (user_id, role_id)
     values ('20000000-0000-4000-8000-000000000001', 'bb83337d-c513-4ed9-b348-e2df0aad280b') $$,
  '42501',
  null,
  'a volunteer cannot grant themselves a role'
);
select is_empty(
  $$ select 1 from public.user_roles where user_id = '20000000-0000-4000-8000-000000000003' $$,
  'a volunteer cannot read other people''s roles'
);
select is_empty(
  $$ select 1 from public.audit_events $$,
  'a volunteer cannot read the audit log'
);
reset role;

select pg_temp.act_as('20000000-0000-4000-8000-000000000003');
select results_eq(
  $$ select capability, department_id from public.my_capabilities() where capability = 'member.approve' $$,
  $$ values ('member.approve'::text, 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'::uuid) $$,
  'a department leader''s capabilities are scoped to their department'
);
select is_empty(
  $$ select 1 from public.my_capabilities() where capability in ('course.publish', 'audit.view', 'role.assign') $$,
  'a department leader cannot publish, read the audit log, or assign roles by default'
);
reset role;

select pg_temp.act_as('20000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ insert into public.user_roles (user_id, role_id)
     values ('20000000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384') $$,
  '23514',
  'role_requires_department',
  'a department-scoped role must name a department'
);
select lives_ok(
  $$ insert into public.user_roles (user_id, role_id, department_id)
     values ('20000000-0000-4000-8000-000000000001', 'b028d677-5e3f-44bd-bd65-4142cefe148f',
             '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73') $$,
  'a role manager can grant a department-scoped role'
);
select isnt_empty(
  $$ select 1 from public.audit_events where action = 'user_role.created'
      and actor_id = '20000000-0000-4000-8000-000000000006' $$,
  'granting a role writes an audit event the admin can read'
);
update public.user_roles set revoked_at = now()
 where user_id = '20000000-0000-4000-8000-000000000001'
   and role_id = 'b028d677-5e3f-44bd-bd65-4142cefe148f';
reset role;
select is(
  (select revoked_by from public.user_roles
    where user_id = '20000000-0000-4000-8000-000000000001'
      and role_id = 'b028d677-5e3f-44bd-bd65-4142cefe148f'),
  '20000000-0000-4000-8000-000000000006'::uuid,
  'revoking a role records who revoked it'
);

-- ---------------------------------------------------------------------------
-- Suspended accounts keep their history but lose access (SRS-AUTH-004)
-- ---------------------------------------------------------------------------
update public.profiles set status = 'suspended' where id = '20000000-0000-4000-8000-000000000003';
select pg_temp.act_as('20000000-0000-4000-8000-000000000003');
select is_empty(
  $$ select 1 from public.departments $$,
  'a suspended person cannot browse departments'
);
select is_empty(
  $$ select 1 from public.my_capabilities() $$,
  'a suspended leader has no capabilities'
);
select throws_ok(
  $$ select public.request_membership('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501',
  'not_authorized',
  'a suspended person cannot request membership'
);
select isnt_empty(
  $$ select 1 from public.profiles where id = '20000000-0000-4000-8000-000000000003' $$,
  'a suspended person can still read their own profile'
);
reset role;
select isnt_empty(
  $$ select 1 from public.user_roles where user_id = '20000000-0000-4000-8000-000000000003' and revoked_at is null $$,
  'suspension keeps role history intact'
);

-- ---------------------------------------------------------------------------
-- The audit log is append-only, even for the database owner
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.audit_events set action = 'tampered.event' $$,
  '42501',
  'audit_events is append-only',
  'audit events cannot be edited'
);
select throws_ok(
  $$ delete from public.audit_events $$,
  '42501',
  'audit_events is append-only',
  'audit events cannot be deleted'
);

select * from finish();
rollback;
