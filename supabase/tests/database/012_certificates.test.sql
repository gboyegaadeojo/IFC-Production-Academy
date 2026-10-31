-- Certificates: SRS-CERT-001..005, SRS-RBAC-004.
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
--   Camera member     c0000000-0000-4000-8000-000000000001
--   Second member     c0000000-0000-4000-8000-000000000002
--   Camera Leader     c0000000-0000-4000-8000-000000000004
--   Audio Leader      c0000000-0000-4000-8000-000000000005
select pg_temp.new_user('c0000000-0000-4000-8000-000000000001', 'Test Camera Member');
select pg_temp.new_user('c0000000-0000-4000-8000-000000000002', 'Test Second Member');
select pg_temp.new_user('c0000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('c0000000-0000-4000-8000-000000000005', 'Test Audio Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('c0000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('c0000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'c0000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'c0000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid, value text);
grant all on ctx to authenticated, anon;

-- A course with one required lesson, one optional lesson, and a required practical.
select pg_temp.act_as('c0000000-0000-4000-8000-000000000004');
insert into ctx (key, id) values ('course', public.create_course(
  (select id from public.levels where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1),
  'Certificate test course'));
insert into ctx (key, id) values ('v1', (select id from public.course_versions where course_id = (select id from ctx where key = 'course')));
insert into public.course_modules (course_version_id, title) values ((select id from ctx where key = 'v1'), 'Module');
insert into public.lessons (course_version_id, module_id, title, is_required, sort_order) values
  ((select id from ctx where key = 'v1'), (select id from public.course_modules where course_version_id = (select id from ctx where key = 'v1')), 'Required', true, 10),
  ((select id from ctx where key = 'v1'), (select id from public.course_modules where course_version_id = (select id from ctx where key = 'v1')), 'Optional', false, 20);
insert into public.practicals (course_version_id, title) values ((select id from ctx where key = 'v1'), 'Fake check');
insert into public.practical_criteria (practical_id, course_version_id, label)
  values ((select id from public.practicals where course_version_id = (select id from ctx where key = 'v1')), (select id from ctx where key = 'v1'), 'Fake step');
insert into ctx (key, id) values
  ('key_required', (select lesson_key from public.lessons where course_version_id = (select id from ctx where key = 'v1') and title = 'Required')),
  ('pkey', (select practical_key from public.practicals where course_version_id = (select id from ctx where key = 'v1'))),
  ('crit', (select id from public.practical_criteria where label = 'Fake step'));
select public.publish_course_version((select id from ctx where key = 'v1'), 'First');
reset role;

-- ---------------------------------------------------------------------------
-- Issued only when the requirements are met (SRS-CERT-001)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.issue_certificate((select id from ctx where key = 'course')) $$,
  'P0001', 'requirements_not_met', 'no certificate before anything is done'
);
select public.complete_lesson((select id from ctx where key = 'course'), (select id from ctx where key = 'key_required'));
select throws_ok(
  $$ select public.issue_certificate((select id from ctx where key = 'course')) $$,
  'P0001', 'requirements_not_met', 'lessons alone are not enough while a practical is required'
);
reset role;

select pg_temp.act_as('c0000000-0000-4000-8000-000000000004');
select public.record_practical_assessment((select id from ctx where key = 'course'), (select id from ctx where key = 'pkey'),
  'c0000000-0000-4000-8000-000000000001', array[(select id from ctx where key = 'crit')], '');
reset role;

select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
insert into ctx (key, value) values ('ref', public.issue_certificate((select id from ctx where key = 'course')));
select matches((select value from ctx where key = 'ref'), '^IFC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$',
  'the certificate has a unique printed reference (SRS-CERT-002)');
select is(public.issue_certificate((select id from ctx where key = 'course')), (select value from ctx where key = 'ref'),
  'asking again returns the same certificate');
select results_eq(
  $$ select recipient_name, course_title, level_number, version_number, course_version_id
       from public.certificates $$,
  $$ values ('Test Camera Member'::text, 'Certificate test course'::text, 1, 1, (select id from ctx where key = 'v1')) $$,
  'it records the recipient, course, level, and the version earned (SRS-CERT-003)'
);
select throws_ok(
  $$ insert into public.certificates (reference, user_id, course_id, course_version_id, department_id, recipient_name, course_title, department_name, level_number, version_number)
     values ('IFC-AAAA-BBBB-CCCC', 'c0000000-0000-4000-8000-000000000001', (select id from ctx where key = 'course'),
             (select id from ctx where key = 'v1'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'x', 'x', 'x', 1, 1) $$,
  '42501', null, 'nobody writes certificates directly'
);
select throws_ok(
  $$ select public.revoke_certificate((select value from ctx where key = 'ref'), 'Mine') $$,
  '42501', 'not_authorized', 'the recipient cannot revoke it'
);
reset role;

-- ---------------------------------------------------------------------------
-- Verification and visibility (SRS-CERT-004)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('c0000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.certificates $$, 'another volunteer cannot list someone''s certificates');
select results_eq(
  $$ select recipient_name, revoked, is_mine, can_revoke from public.verify_certificate(lower((select value from ctx where key = 'ref'))) $$,
  $$ values ('Test Camera Member'::text, false, false, false) $$,
  'anyone signed in can check a certificate by its reference'
);
select is_empty($$ select 1 from public.verify_certificate('IFC-0000-0000-0000') $$, 'an unknown reference finds nothing');
select is((select department_hue from public.verify_certificate((select value from ctx where key = 'ref'))), 'blue',
  'the certificate carries its department''s hue for the colour band');
reset role;

-- The public check behind the QR code: anyone, signed in or not, sees initials only (decision 8).
set local role anon;
select results_eq(
  $$ select recipient_initials, course_title, level_number, revoked
       from public.check_certificate(lower((select value from ctx where key = 'ref'))) $$,
  $$ values ('T. C. M.'::text, 'Certificate test course'::text, 1, false) $$,
  'signed out, a reference shows initials, course, level, and validity'
);
select is_empty($$ select 1 from public.check_certificate('IFC-0000-0000-0000') $$,
  'signed out, an unknown reference finds nothing');
select throws_ok($$ select * from public.verify_certificate((select value from ctx where key = 'ref')) $$,
  '42501', null, 'signed out, the full-name check is refused');
select throws_ok($$ select * from public.certificates $$, '42501', null, 'signed out, the table stays closed');
reset role;
select pg_temp.act_as('c0000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.issue_certificate((select id from ctx where key = 'course')) $$,
  'P0001', 'requirements_not_met', 'another member has not met the requirements'
);
reset role;

select pg_temp.act_as('c0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.revoke_certificate((select value from ctx where key = 'ref'), 'Not mine') $$,
  '42501', 'not_authorized', 'another department''s leader cannot revoke it'
);
reset role;

-- ---------------------------------------------------------------------------
-- Revocation (SRS-CERT-005)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('c0000000-0000-4000-8000-000000000004');
select is((select can_revoke from public.verify_certificate((select value from ctx where key = 'ref'))), true,
  'the department''s leader may revoke');
select throws_ok(
  $$ select public.revoke_certificate((select value from ctx where key = 'ref'), ' ') $$,
  '22023', 'reason_required', 'revoking needs a reason'
);
select lives_ok(
  $$ select public.revoke_certificate((select value from ctx where key = 'ref'), 'Issued by mistake') $$,
  'the leader revokes the certificate'
);
reset role;
select ok(
  exists (select 1 from public.audit_events where action = 'certificate.updated'
            and actor_id = 'c0000000-0000-4000-8000-000000000004'),
  'revoking is audited'
);
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
select is((select revoked from public.verify_certificate((select value from ctx where key = 'ref'))), true,
  'a revoked certificate shows as withdrawn');
select throws_ok(
  $$ select public.issue_certificate((select id from ctx where key = 'course')) $$,
  'P0001', 'certificate_revoked', 'a revoked certificate is not silently reissued'
);
reset role;

select * from finish();
rollback;
