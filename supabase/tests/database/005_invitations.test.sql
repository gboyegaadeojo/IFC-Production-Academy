-- Invitations: SRS-AUTH-003, SRS-MEM-002, ADD-AUTH-01, SRS-RBAC-001, SRS-AUDIT-001.
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
--   Volunteer A     40000000-0000-4000-8000-000000000001
--   Volunteer B     40000000-0000-4000-8000-000000000002
--   Volunteer C     40000000-0000-4000-8000-000000000004  (has an open request to Audio)
--   Audio Leader    40000000-0000-4000-8000-000000000003
select pg_temp.new_user('40000000-0000-4000-8000-000000000001', 'Test Volunteer A');
select pg_temp.new_user('40000000-0000-4000-8000-000000000002', 'Test Volunteer B');
select pg_temp.new_user('40000000-0000-4000-8000-000000000003', 'Test Audio Leader');
select pg_temp.new_user('40000000-0000-4000-8000-000000000004', 'Test Volunteer C');
insert into public.user_roles (user_id, role_id, department_id) values
  ('40000000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');
insert into public.department_memberships (department_id, user_id, status) values
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', '40000000-0000-4000-8000-000000000004', 'requested');

create temporary table tokens (label text primary key, token text, invitation_id uuid);
grant all on tokens to authenticated;

-- ---------------------------------------------------------------------------
-- Creating
-- ---------------------------------------------------------------------------
select pg_temp.act_as('40000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.create_invitation('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 1, 14) $$,
  '42501',
  'not_authorized',
  'a volunteer cannot create invitations'
);
reset role;

select pg_temp.act_as('40000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select * from public.create_invitation('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 1, 14) $$,
  '42501',
  'not_authorized',
  'a leader cannot invite to another department'
);
select throws_ok(
  $$ select * from public.create_invitation(null, 1, 14) $$,
  '42501',
  'not_authorized',
  'a department leader cannot create an Academy-only invitation'
);
select throws_ok(
  $$ select * from public.create_invitation('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 500, 14) $$,
  '22023',
  'invalid_invitation_settings',
  'an invitation is limited to 200 people'
);
insert into tokens
  select 'single', token, invitation_id
  from public.create_invitation('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 1, 14, 'For one person');
insert into tokens
  select 'group', token, invitation_id
  from public.create_invitation('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 2, 14, 'Volunteer night');
select is(
  (select length(token) from tokens where label = 'single'),
  32,
  'the token is 32 URL-safe characters'
);
select is(
  (select count(*)::int from public.invitations),
  2,
  'the leader reads their department''s invitations'
);
reset role;

select is(
  (select count(*)::int from public.invitations i join tokens t on t.invitation_id = i.id
    where i.token_hash = extensions.digest(convert_to(t.token, 'UTF8'), 'sha256')),
  2,
  'only a hash of each token is stored'
);
select ok(
  not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT'),
  'the token hash is not readable through the API'
);
select is(
  (select count(*)::int from public.audit_events where action = 'invitation.created'
     and actor_id = '40000000-0000-4000-8000-000000000003'),
  2,
  'creating an invitation writes an audit event'
);

select pg_temp.act_as('40000000-0000-4000-8000-000000000001');
select is_empty($$ select 1 from public.invitations $$, 'volunteers cannot list invitations');

-- ---------------------------------------------------------------------------
-- Previewing and accepting
-- ---------------------------------------------------------------------------
select is(
  (select status from public.invitation_preview('not-a-real-token-not-a-real-tok')),
  'not_found',
  'an unknown token reads as not found'
);
select is(
  (select status || ':' || department_name from public.invitation_preview((select token from tokens where label = 'single'))),
  'valid:Audio Engineering',
  'a valid invitation shows its department'
);
select is(
  (select outcome from public.accept_invitation((select token from tokens where label = 'single'))),
  'joined',
  'accepting joins the department'
);
reset role;
select results_eq(
  $$ select status::text, decided_by, decision_reason from public.department_memberships
      where user_id = '40000000-0000-4000-8000-000000000001' $$,
  $$ values ('active'::text, '40000000-0000-4000-8000-000000000003'::uuid, 'Accepted an invitation'::text) $$,
  'the membership is active and credited to the inviter'
);
select is(
  (select count(*)::int from public.audit_events where action = 'invitation_acceptance.created'
     and actor_id = '40000000-0000-4000-8000-000000000001'),
  1,
  'accepting writes an audit event'
);

select pg_temp.act_as('40000000-0000-4000-8000-000000000001');
select is(
  (select outcome from public.accept_invitation((select token from tokens where label = 'single'))),
  'joined',
  'accepting again is safe and gives the same result'
);
reset role;
select is(
  (select use_count from public.invitations i join tokens t on t.invitation_id = i.id where t.label = 'single'),
  1,
  'accepting again does not use another place'
);

select pg_temp.act_as('40000000-0000-4000-8000-000000000002');
select is(
  (select status from public.invitation_preview((select token from tokens where label = 'single'))),
  'used_up',
  'a single-use invitation is used up after one person'
);
select throws_ok(
  $$ select * from public.accept_invitation((select token from tokens where label = 'single')) $$,
  'P0001',
  'invitation_used_up',
  'nobody else can accept a used-up invitation'
);
select is(
  (select outcome from public.accept_invitation((select token from tokens where label = 'group'))),
  'joined',
  'a group invitation lets several people join'
);
reset role;

-- An open request becomes membership when the person accepts an invitation.
select pg_temp.act_as('40000000-0000-4000-8000-000000000004');
select is(
  (select outcome from public.accept_invitation((select token from tokens where label = 'group'))),
  'joined',
  'someone with an open request can accept'
);
reset role;
select is(
  (select count(*)::int from public.department_memberships
    where user_id = '40000000-0000-4000-8000-000000000004'),
  1,
  'their request became the membership, with no duplicate'
);
select is(
  (select status::text from public.department_memberships
    where user_id = '40000000-0000-4000-8000-000000000004'),
  'active',
  'and it is active'
);

-- ---------------------------------------------------------------------------
-- Revoking, expiry, and an inviter losing their role
-- ---------------------------------------------------------------------------
select pg_temp.act_as('40000000-0000-4000-8000-000000000003');
insert into tokens
  select 'revoked', token, invitation_id
  from public.create_invitation('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 5, 14);
select lives_ok(
  $$ select public.revoke_invitation((select invitation_id from tokens where label = 'revoked')) $$,
  'a leader can revoke their department''s invitation'
);
insert into tokens
  select 'expired', token, invitation_id
  from public.create_invitation('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 5, 1);
insert into tokens
  select 'orphaned', token, invitation_id
  from public.create_invitation('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 5, 14);
reset role;

-- Move one invitation into the past. updated_at and audit triggers don't matter for this test.
update public.invitations set expires_at = now() - interval '1 minute'
 where id = (select invitation_id from tokens where label = 'expired');

select pg_temp.act_as('40000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.accept_invitation((select token from tokens where label = 'revoked')) $$,
  'P0001',
  'invitation_revoked',
  'a revoked invitation cannot be accepted'
);
select throws_ok(
  $$ select * from public.accept_invitation((select token from tokens where label = 'expired')) $$,
  'P0001',
  'invitation_expired',
  'an expired invitation cannot be accepted'
);
reset role;

-- The leader steps down: their open invitations stop working.
update public.user_roles set revoked_at = now()
 where user_id = '40000000-0000-4000-8000-000000000003';
select pg_temp.act_as('40000000-0000-4000-8000-000000000002');
select is(
  (select status from public.invitation_preview((select token from tokens where label = 'orphaned'))),
  'revoked',
  'an invitation from someone who lost member.invite reads as revoked'
);
select throws_ok(
  $$ select * from public.accept_invitation((select token from tokens where label = 'orphaned')) $$,
  'P0001',
  'invitation_revoked',
  'and cannot be accepted'
);
reset role;

-- Suspended people cannot accept anything.
update public.profiles set status = 'suspended' where id = '40000000-0000-4000-8000-000000000002';
select pg_temp.act_as('40000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.invitation_preview('anything') $$,
  '42501',
  'not_authorized',
  'a suspended person cannot preview invitations'
);
reset role;

select * from finish();
rollback;
