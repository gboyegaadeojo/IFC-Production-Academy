-- Admin screen support: sign-in emails, account status, and role grant guards.
-- SRS-AUTH-004, SRS-AUTH-007, SRS-RBAC-001, SRS-RBAC-004, SRS-AUDIT-001.
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
--   Volunteer A     30000000-0000-4000-8000-000000000001  (asked to join Audio)
--   Volunteer B     30000000-0000-4000-8000-000000000002  (no memberships)
--   Audio Leader    30000000-0000-4000-8000-000000000003
--   Director        30000000-0000-4000-8000-000000000005
--   Platform Admin  30000000-0000-4000-8000-000000000006
select pg_temp.new_user('30000000-0000-4000-8000-000000000001', 'Test Volunteer A');
select pg_temp.new_user('30000000-0000-4000-8000-000000000002', 'Test Volunteer B');
select pg_temp.new_user('30000000-0000-4000-8000-000000000003', 'Test Audio Leader');
select pg_temp.new_user('30000000-0000-4000-8000-000000000005', 'Test Director');
select pg_temp.new_user('30000000-0000-4000-8000-000000000006', 'Test Platform Admin');
insert into public.user_roles (user_id, role_id, department_id) values
  ('30000000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'),
  ('30000000-0000-4000-8000-000000000005', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null),
  ('30000000-0000-4000-8000-000000000006', 'd8b78629-6772-4a39-8c9f-be33ba201e05', null);
insert into public.department_memberships (department_id, user_id, status) values
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', '30000000-0000-4000-8000-000000000001', 'requested');

-- ---------------------------------------------------------------------------
-- profile_emails: only for people you may already see
-- ---------------------------------------------------------------------------
select pg_temp.act_as('30000000-0000-4000-8000-000000000002');
select results_eq(
  $$ select user_id from public.profile_emails(array[
       '30000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ values ('30000000-0000-4000-8000-000000000002'::uuid) $$,
  'a volunteer gets only their own email'
);
reset role;

select pg_temp.act_as('30000000-0000-4000-8000-000000000003');
select results_eq(
  $$ select user_id from public.profile_emails(array[
       '30000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ values ('30000000-0000-4000-8000-000000000001'::uuid) $$,
  'a leader gets the email of someone asking to join their department, and nobody else''s'
);
reset role;

select pg_temp.act_as('30000000-0000-4000-8000-000000000006');
select is(
  (select count(*)::int from public.profile_emails(array[
     '30000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000002']::uuid[])),
  2,
  'an account administrator gets the emails of everyone asked for'
);
reset role;

-- ---------------------------------------------------------------------------
-- set_account_status (SRS-AUTH-004)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('30000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.set_account_status('30000000-0000-4000-8000-000000000002', 'suspended', 'test') $$,
  '42501',
  'not_authorized',
  'without user.manage, nobody can suspend an account'
);
reset role;

select pg_temp.act_as('30000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.set_account_status('30000000-0000-4000-8000-000000000006', 'suspended', null) $$,
  '42501',
  'cannot_change_own_status',
  'administrators cannot suspend themselves'
);
select lives_ok(
  $$ select public.set_account_status('30000000-0000-4000-8000-000000000002', 'suspended', 'Stepped back for a season') $$,
  'an account administrator can suspend an account'
);
reset role;
select results_eq(
  $$ select status::text, status_reason, status_changed_by from public.profiles
      where id = '30000000-0000-4000-8000-000000000002' $$,
  $$ values ('suspended'::text, 'Stepped back for a season'::text, '30000000-0000-4000-8000-000000000006'::uuid) $$,
  'suspension records the reason and who did it'
);
select is(
  (select count(*)::int from public.audit_events
    where action = 'profile.updated'
      and target_id = '30000000-0000-4000-8000-000000000002'
      and actor_id = '30000000-0000-4000-8000-000000000006'
      and metadata -> 'status' ->> 'to' = 'suspended'),
  1,
  'suspending an account writes an audit event'
);
select is(
  (select count(*)::int from public.user_roles where user_id = '30000000-0000-4000-8000-000000000002'),
  1,
  'suspension keeps the person''s roles'
);
select pg_temp.act_as('30000000-0000-4000-8000-000000000006');
select lives_ok(
  $$ select public.set_account_status('30000000-0000-4000-8000-000000000002', 'active', null) $$,
  'an account administrator can reactivate an account'
);
reset role;

-- ---------------------------------------------------------------------------
-- Role grant guards
-- ---------------------------------------------------------------------------
select pg_temp.act_as('30000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ insert into public.user_roles (user_id, role_id)
     values ('30000000-0000-4000-8000-000000000005', 'd8b78629-6772-4a39-8c9f-be33ba201e05') $$,
  '42501',
  'role_needs_user_manage',
  'the Production Director cannot make themselves a Platform Admin'
);
select throws_ok(
  $$ update public.user_roles set revoked_at = now()
      where user_id = '30000000-0000-4000-8000-000000000006'
        and role_id = 'd8b78629-6772-4a39-8c9f-be33ba201e05' $$,
  '42501',
  'role_needs_user_manage',
  'the Production Director cannot remove a Platform Admin'
);
select lives_ok(
  $$ insert into public.user_roles (user_id, role_id, department_id)
     values ('30000000-0000-4000-8000-000000000002', 'b028d677-5e3f-44bd-bd65-4142cefe148f',
             '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73') $$,
  'the Production Director can delegate a department role'
);
select throws_ok(
  $$ update public.user_roles set revoked_at = now()
      where user_id = '30000000-0000-4000-8000-000000000005'
        and role_id = 'bb83337d-c513-4ed9-b348-e2df0aad280b' $$,
  '42501',
  'cannot_revoke_own_role',
  'nobody can revoke their own role'
);
reset role;

select pg_temp.act_as('30000000-0000-4000-8000-000000000006');
select lives_ok(
  $$ insert into public.user_roles (user_id, role_id)
     values ('30000000-0000-4000-8000-000000000005', 'd8b78629-6772-4a39-8c9f-be33ba201e05') $$,
  'a Platform Admin can make someone else a Platform Admin'
);
reset role;

select * from finish();
rollback;
