-- Department membership: requests, approval, history, and department-scoped visibility.
-- SRS-MEM-001, SRS-MEM-003, SRS-MEM-004, SRS-RBAC-002, SRS-PROG-004 (idempotent writes).
begin;
select no_plan();

-- Helpers (temporary, gone after rollback). Every person here is fake.
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

-- Departments from the reference data migration.
--   Camera Operations   b7ba9dae-cab5-43e0-a996-8ae9d2436855
--   Audio Engineering   8cd57d7d-1aab-4be6-b67b-e9bc606e0d73
--   Lighting Operations e15ed31d-af2b-48c6-b9b3-bbcda082c7c2 (coming soon)
-- Test people:
--   Volunteer One  10000000-0000-4000-8000-000000000001
--   Volunteer Two  10000000-0000-4000-8000-000000000002
--   Camera Leader  10000000-0000-4000-8000-000000000003
--   Audio Leader   10000000-0000-4000-8000-000000000004
--   Director       10000000-0000-4000-8000-000000000005
--   Platform Admin 10000000-0000-4000-8000-000000000006
select pg_temp.new_user('10000000-0000-4000-8000-000000000001', 'Test Volunteer One');
select pg_temp.new_user('10000000-0000-4000-8000-000000000002', 'Test Volunteer Two');
select pg_temp.new_user('10000000-0000-4000-8000-000000000003', 'Test Camera Leader');
select pg_temp.new_user('10000000-0000-4000-8000-000000000004', 'Test Audio Leader');
select pg_temp.new_user('10000000-0000-4000-8000-000000000005', 'Test Director');
select pg_temp.new_user('10000000-0000-4000-8000-000000000006', 'Test Platform Admin');

insert into public.user_roles (user_id, role_id, department_id) values
  ('10000000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('10000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'),
  ('10000000-0000-4000-8000-000000000005', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null),
  ('10000000-0000-4000-8000-000000000006', 'd8b78629-6772-4a39-8c9f-be33ba201e05', null);

-- ---------------------------------------------------------------------------
-- A volunteer requests to join
-- ---------------------------------------------------------------------------
select pg_temp.act_as('10000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select public.request_membership('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  'a volunteer can request to join an active department'
);
select is(
  (select status::text from public.department_memberships
    where user_id = '10000000-0000-4000-8000-000000000001'
      and department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  'requested',
  'the request is recorded as requested, not active'
);
select is(
  (select (public.request_membership('b7ba9dae-cab5-43e0-a996-8ae9d2436855')).id),
  (select id from public.department_memberships
    where user_id = '10000000-0000-4000-8000-000000000001'
      and department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  'asking again returns the same request'
);
select is(
  (select count(*)::int from public.department_memberships
    where user_id = '10000000-0000-4000-8000-000000000001'),
  1,
  'retrying never creates a duplicate request'
);
select throws_ok(
  $$ select public.request_membership('e15ed31d-af2b-48c6-b9b3-bbcda082c7c2') $$,
  'P0001',
  'department_not_open',
  'a volunteer cannot join a Coming Soon department'
);
select throws_ok(
  $$ insert into public.department_memberships (department_id, user_id, status)
     values ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', '10000000-0000-4000-8000-000000000001', 'active') $$,
  '42501',
  null,
  'a volunteer cannot insert a membership directly'
);
select throws_ok(
  $$ update public.department_memberships set status = 'active'
      where user_id = '10000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a volunteer cannot change a membership status directly'
);
select throws_ok(
  $$ select public.decide_membership(
       (select id from public.department_memberships
         where user_id = '10000000-0000-4000-8000-000000000001'),
       'active') $$,
  '42501',
  'not_authorized',
  'a volunteer cannot approve their own request'
);

-- Volunteer Two asks to join Audio and Camera.
reset role;
select pg_temp.act_as('10000000-0000-4000-8000-000000000002');
select public.request_membership('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');
select public.request_membership('b7ba9dae-cab5-43e0-a996-8ae9d2436855');
reset role;

-- Remember row ids so later checks don't depend on what the acting user can see.
select set_config('tests.v1_camera', (select id::text from public.department_memberships
  where user_id = '10000000-0000-4000-8000-000000000001' and department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'), true);
select set_config('tests.v2_audio', (select id::text from public.department_memberships
  where user_id = '10000000-0000-4000-8000-000000000002' and department_id = '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'), true);

-- ---------------------------------------------------------------------------
-- Volunteers cannot read other people's restricted rows
-- ---------------------------------------------------------------------------
select pg_temp.act_as('10000000-0000-4000-8000-000000000001');

select is_empty(
  $$ select 1 from public.department_memberships
      where user_id = '10000000-0000-4000-8000-000000000002'
        and department_id = '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73' $$,
  'a volunteer cannot read another department''s membership rows'
);
select is_empty(
  $$ select 1 from public.department_memberships
      where user_id = '10000000-0000-4000-8000-000000000002' $$,
  'a volunteer cannot read another volunteer''s memberships, even in a shared department'
);
select is_empty(
  $$ select 1 from public.department_membership_events
      where user_id = '10000000-0000-4000-8000-000000000002' $$,
  'a volunteer cannot read another volunteer''s membership history'
);
select is_empty(
  $$ select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000002' $$,
  'a volunteer cannot read another volunteer''s profile'
);
select isnt_empty(
  $$ select 1 from public.department_memberships where user_id = '10000000-0000-4000-8000-000000000001' $$,
  'a volunteer can read their own membership'
);
reset role;

-- ---------------------------------------------------------------------------
-- Leaders see and decide only within their department
-- ---------------------------------------------------------------------------
select pg_temp.act_as('10000000-0000-4000-8000-000000000003');

select is(
  (select count(*)::int from public.department_memberships
    where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'
      and user_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')),
  2,
  'the Camera leader sees both Camera requests'
);
select is_empty(
  $$ select 1 from public.department_memberships
      where department_id = '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'
        and user_id = '10000000-0000-4000-8000-000000000002' $$,
  'the Camera leader cannot see Audio requests'
);
select isnt_empty(
  $$ select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000001' $$,
  'the Camera leader can see the profile of someone asking to join Camera'
);
select throws_ok(
  $$ select public.decide_membership(current_setting('tests.v2_audio')::uuid, 'active') $$,
  '42501',
  'not_authorized',
  'the Camera leader cannot approve an Audio request'
);
select lives_ok(
  $$ select public.decide_membership(current_setting('tests.v1_camera')::uuid, 'active', 'Welcome aboard') $$,
  'the Camera leader can approve a Camera request'
);
select throws_ok(
  $$ select public.decide_membership(current_setting('tests.v1_camera')::uuid, 'declined') $$,
  'P0001',
  'invalid_membership_transition',
  'an active membership cannot be declined'
);
reset role;

select is(
  (select status::text from public.department_memberships where id = current_setting('tests.v1_camera')::uuid),
  'active',
  'the approved membership is active'
);
select is(
  (select decided_by from public.department_memberships where id = current_setting('tests.v1_camera')::uuid),
  '10000000-0000-4000-8000-000000000003'::uuid,
  'the approver is recorded'
);
select results_eq(
  $$ select from_status::text, to_status::text, actor_id
       from public.department_membership_events
      where membership_id = current_setting('tests.v1_camera')::uuid
      order by created_at, to_status $$,
  $$ values (null::text, 'requested'::text, '10000000-0000-4000-8000-000000000001'::uuid),
            ('requested', 'active', '10000000-0000-4000-8000-000000000003'::uuid) $$,
  'membership history keeps the request and the approval with their actors'
);
select is(
  (select count(*)::int from public.audit_events
    where target_id = current_setting('tests.v1_camera')::uuid
      and action = 'department_membership.updated'
      and actor_id = '10000000-0000-4000-8000-000000000003'
      and metadata -> 'status' ->> 'to' = 'active'),
  1,
  'the approval writes an audit event'
);

-- ---------------------------------------------------------------------------
-- Organization-wide roles
-- ---------------------------------------------------------------------------
select pg_temp.act_as('10000000-0000-4000-8000-000000000005');
select isnt_empty(
  $$ select 1 from public.department_memberships where id = current_setting('tests.v2_audio')::uuid $$,
  'the Production Director sees requests in every department'
);
select lives_ok(
  $$ select public.decide_membership(current_setting('tests.v2_audio')::uuid, 'declined', 'Not this season') $$,
  'the Production Director can decide in any department'
);
reset role;

select pg_temp.act_as('10000000-0000-4000-8000-000000000006');
select is_empty(
  $$ select 1 from public.department_memberships
      where user_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002') $$,
  'the Platform Admin cannot read memberships without member.approve'
);
reset role;

-- A declined volunteer may ask again; the declined row stays as history.
select pg_temp.act_as('10000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.request_membership('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73') $$,
  'a declined volunteer can request again'
);
select is(
  -- Ordered by status because both rows share the transaction's timestamp.
  (select array_agg(status::text order by status) from public.department_memberships
    where user_id = '10000000-0000-4000-8000-000000000002'
      and department_id = '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'),
  array['requested', 'declined'],
  'the earlier declined request is kept'
);
reset role;

select * from finish();
rollback;
