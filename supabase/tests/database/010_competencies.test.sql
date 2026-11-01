-- Competencies, serving roles, and Approved to Serve: SRS-COMP-001..004, -008, -009, SRS-RBAC-004.
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
--   Camera member     a0000000-0000-4000-8000-000000000001
--   Second member     a0000000-0000-4000-8000-000000000002
--   Outsider          a0000000-0000-4000-8000-000000000003
--   Camera Leader     a0000000-0000-4000-8000-000000000004
--   Audio Leader      a0000000-0000-4000-8000-000000000005
select pg_temp.new_user('a0000000-0000-4000-8000-000000000001', 'Test Camera Member');
select pg_temp.new_user('a0000000-0000-4000-8000-000000000002', 'Test Second Member');
select pg_temp.new_user('a0000000-0000-4000-8000-000000000003', 'Test Outsider');
select pg_temp.new_user('a0000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('a0000000-0000-4000-8000-000000000005', 'Test Audio Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a0000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('a0000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a0000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a0000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- ---------------------------------------------------------------------------
-- Leaders define competencies and roles (data, never code)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
insert into public.competencies (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake framing'),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake presets'),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake handheld');
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake camera 2');
insert into ctx values
  ('a', (select id from public.competencies where name = 'Fake framing')),
  ('b', (select id from public.competencies where name = 'Fake presets')),
  ('c', (select id from public.competencies where name = 'Fake handheld')),
  ('role', (select id from public.serving_roles where name = 'Fake camera 2'));
select throws_ok(
  $$ insert into public.competencies (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', ' fake FRAMING') $$,
  '23505', null, 'names are unique in a department, ignoring case'
);
select throws_ok(
  $$ insert into public.competencies (department_id, name) values ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'Not mine') $$,
  '42501', null, 'a leader cannot add competencies to another department'
);
select lives_ok(
  $$ select public.set_role_competencies((select id from ctx where key = 'role'),
       array[(select id from ctx where key = 'a'), (select id from ctx where key = 'b')]) $$,
  'the leader sets what the role needs'
);
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
insert into public.competencies (department_id, name) values ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'Fake mixing');
insert into ctx values ('audio', (select id from public.competencies where name = 'Fake mixing'));
select throws_ok(
  $$ select public.set_role_competencies((select id from ctx where key = 'role'), array[(select id from ctx where key = 'a')]) $$,
  '42501', 'not_authorized', 'another department''s leader cannot change camera roles'
);
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.set_role_competencies((select id from ctx where key = 'role'), array[(select id from ctx where key = 'audio')]) $$,
  'P0001', 'competency_not_in_department', 'a role only needs its own department''s competencies (SRS-ASSESS-008)'
);
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.competencies where name like 'Fake %'), 3, 'members read their department''s competencies');
select is((select count(*)::int from public.serving_role_competencies where role_id = (select id from ctx where key = 'role')), 2,
  'and what each role needs');
select throws_ok(
  $$ select public.set_role_competencies((select id from ctx where key = 'role'), '{}') $$,
  '42501', 'not_authorized', 'members cannot change roles'
);
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
select isnt_empty($$ select 1 from public.competencies $$, 'anyone in the Academy can see what a role needs');
reset role;

-- ---------------------------------------------------------------------------
-- The system grants and approves (decided 2026-10-30)
-- ---------------------------------------------------------------------------
select isnt(private.grant_competency('a0000000-0000-4000-8000-000000000001', (select id from ctx where key = 'a'), null), null,
  'a passed practical grants the first competency');
select is_empty(
  $$ select 1 from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001' $$,
  'one of two competencies is not enough to serve'
);
select private.grant_competency('a0000000-0000-4000-8000-000000000001', (select id from ctx where key = 'b'), null);
select is(
  (select status::text from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'approved', 'Approved to Serve follows automatically once every competency is approved'
);

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.competency_records), 2, 'a member reads their own competencies');
select is((select count(*)::int from public.serving_approvals), 1, 'and their own approval');
select throws_ok(
  $$ select public.suspend_competency((select id from public.competency_records limit 1), 'No') $$,
  '42501', 'not_authorized', 'members cannot suspend competencies'
);
select throws_ok(
  $$ update public.serving_approvals set status = 'approved' $$,
  '42501', null, 'approvals cannot be written directly'
);
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.competency_records $$, 'a volunteer cannot read another volunteer''s competencies');
select is_empty($$ select 1 from public.serving_approvals $$, 'or their approvals');
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
select is_empty($$ select 1 from public.competency_records $$, 'another department''s leader cannot read camera records');
reset role;

-- ---------------------------------------------------------------------------
-- Suspension withdraws, reinstatement restores (SRS-COMP-003, -004, -008)
-- ---------------------------------------------------------------------------
insert into ctx values ('rec_b', (select id from public.competency_records
  where user_id = 'a0000000-0000-4000-8000-000000000001' and competency_id = (select id from ctx where key = 'b')));
select pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.competency_records), 2, 'the leader reads the department''s records');
select throws_ok(
  $$ select public.suspend_competency((select id from ctx where key = 'rec_b'), '  ') $$,
  '22023', 'reason_required', 'suspending needs a reason'
);
select lives_ok(
  $$ select public.suspend_competency((select id from ctx where key = 'rec_b'), 'Missed the safety check') $$,
  'the leader suspends a competency'
);
reset role;
select results_eq(
  $$ select status::text, withdraw_reason from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001' $$,
  $$ values ('withdrawn'::text, 'competency_suspended'::text) $$,
  'Approved to Serve is withdrawn when a needed competency is suspended'
);
select ok(
  exists (select 1 from public.audit_events where action = 'competency_record.updated'
            and actor_id = 'a0000000-0000-4000-8000-000000000004'),
  'suspending is audited'
);
select pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
select lives_ok($$ select public.reinstate_competency((select id from ctx where key = 'rec_b')) $$, 'the leader reinstates it');
reset role;
select is((select status::text from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'approved', 'reinstating restores Approved to Serve');

-- Expiry (SRS-COMP-009): off by default, and an expired competency withdraws approval.
select is((select expires_at from public.competency_records where id = (select id from ctx where key = 'rec_b')), null,
  'competencies never expire by default');
update public.competencies set expiry_months = 12 where id = (select id from ctx where key = 'b');
select private.grant_competency('a0000000-0000-4000-8000-000000000001', (select id from ctx where key = 'b'), null);
select ok((select expires_at > now() + interval '11 months' from public.competency_records where id = (select id from ctx where key = 'rec_b')),
  'a competency with expiry gets an expiry date when granted');
update public.competency_records set expires_at = now() - interval '1 day' where id = (select id from ctx where key = 'rec_b');
select private.refresh_serving_approvals('a0000000-0000-4000-8000-000000000001', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
select is((select withdraw_reason from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'competency_expired', 'an expired competency withdraws Approved to Serve');
select private.grant_competency('a0000000-0000-4000-8000-000000000001', (select id from ctx where key = 'b'), null);
select is((select status::text from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'approved', 'passing again restores it');

-- Requirement changes and archived roles.
select pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
select public.set_role_competencies((select id from ctx where key = 'role'),
  array[(select id from ctx where key = 'a'), (select id from ctx where key = 'b'), (select id from ctx where key = 'c')]);
reset role;
select results_eq(
  $$ select status::text, withdraw_reason from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001' $$,
  $$ values ('withdrawn'::text, 'requirements_changed'::text) $$,
  'a new requirement withdraws approval until it is met'
);
select pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
update public.competencies set archived_at = now() where id = (select id from ctx where key = 'c');
reset role;
select is((select status::text from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'approved', 'archiving a competency removes it from roles and approvals are worked out again');
select pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
update public.serving_roles set archived_at = now() where id = (select id from ctx where key = 'role');
reset role;
select is((select withdraw_reason from public.serving_approvals where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'role_archived', 'archiving a role withdraws its approvals');

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.competency_records (user_id, competency_id, department_id)
     values ('a0000000-0000-4000-8000-000000000001', (select id from ctx where key = 'c'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501', null, 'nobody grants themselves a competency'
);
reset role;

select * from finish();
rollback;
