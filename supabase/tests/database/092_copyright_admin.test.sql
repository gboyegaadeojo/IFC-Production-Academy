-- Admin → Copyright (ADD-COPY-09): only copyright.manage holders read and change it; settings and
-- list changes are audited; removing someone stops their links; test emails go even while it's off.
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_email, jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

select pg_temp.new_user('a9200000-0000-4000-8000-000000000001', 'Test Approvals Admin', 'approvals.admin@example.com');
select pg_temp.new_user('a9200000-0000-4000-8000-000000000002', 'Test Approvals Volunteer', 'approvals.volunteer@example.com');
select pg_temp.new_user('a9200000-0000-4000-8000-000000000003', 'Test Media Member', 'media.member@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a9200000-0000-4000-8000-000000000001', (select id from public.roles where key = 'platform_admin' limit 1), null),
  ('a9200000-0000-4000-8000-000000000003', (select id from public.roles where key = 'copyright_reviewer' limit 1), null);

select pg_temp.act_as('a9200000-0000-4000-8000-000000000002');
select throws_ok($$ select public.copyright_admin_overview() $$, '42501', null, 'a volunteer cannot open it');
select throws_ok($$ select public.add_copyright_contact('quality_control', 'X', 'x@example.com') $$, '42501', null,
  'or change the lists');
reset role;

select pg_temp.act_as('a9200000-0000-4000-8000-000000000001');
select is((public.copyright_admin_overview() ->> 'on')::boolean, false, 'an admin sees it''s off');
select ok(
  public.copyright_admin_overview() -> 'members' @> '[{"name": "Test Media Member"}]'::jsonb,
  'and the Academy members with the Copyright Reviewer role');
select lives_ok(
  $$ select public.save_copyright_settings(3, 'business', 'block', 'Send it {deadline} ahead.',
       'Media.Inbox@example.com', true, true, array['Licensed', '  ', 'Music covered']) $$,
  'saves the settings');
select is((public.copyright_admin_overview() -> 'settings' ->> 'mediaInboxEmail'), 'media.inbox@example.com',
  'the media inbox is kept in lower case');
select is((public.copyright_admin_overview() -> 'settings' -> 'checks'), '["Licensed", "Music covered"]'::jsonb,
  'blank checks are dropped');
select throws_ok(
  $$ select public.save_copyright_settings(99, 'calendar', 'accept', '', null, true, false, '{}') $$,
  '22023', 'invalid_settings', 'a deadline over 60 days is refused');
select lives_ok($$ select public.add_copyright_contact('quality_control', 'Morgan QC', 'Morgan@example.com') $$,
  'adds someone to Quality control');
select throws_ok($$ select public.add_copyright_contact('quality_control', 'Morgan again', 'morgan@example.com') $$,
  'P0001', 'already_listed', 'but not twice');
select lives_ok($$ select public.save_copyright_template('approved', 'Yes for {service date}', 'Go ahead, {first name}.') $$,
  'saves an email');
select is(public.copyright_admin_overview() -> 'settings' -> 'templates' -> 'approved' ->> 'subject',
  'Yes for {service date}', 'it''s kept');
select lives_ok($$ select public.save_copyright_template('approved', null, null) $$, 'puts back the original');
select is(public.copyright_admin_overview() -> 'settings' -> 'templates' -> 'approved', null, 'the saved one is gone');
select throws_ok($$ select public.save_copyright_template('nonsense', 'a', 'b') $$, '22023', 'unknown_template',
  'only the six emails exist');
select lives_ok($$ select public.send_copyright_test_email('received') $$, 'sends itself a test');
reset role;

select is(
  (select count(*)::int from public.copyright_outbox
   where request_id is null and template = 'received' and to_email = 'approvals.admin@example.com'),
  1, 'the test goes to the admin''s own address');
select is((select count(*)::int from public.claim_copyright_emails(50) where email = 'approvals.admin@example.com'),
  1, 'and is handed over even while approvals are off');
select ok(
  (select count(*) from public.audit_events where target_table = 'copyright_contacts'
     or action like 'copyright_contact%') >= 1,
  'adding someone is in the audit log');

-- Removing someone stops their links straight away.
update public.feature_flags set enabled = true where key = 'copyright';
select set_config('test.qc', regexp_replace(
  private.copyright_qc_link((select id from public.copyright_contacts where email = 'morgan@example.com')),
  '^.*/', ''), true);
select ok(public.copyright_qc_requests(current_setting('test.qc')) is not null, 'the link works');
select pg_temp.act_as('a9200000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.remove_copyright_contact((select id from public.copyright_contacts where email = 'morgan@example.com')) $$,
  'the admin removes them');
reset role;
select is(public.copyright_qc_requests(current_setting('test.qc')), null, 'and the link stops working');

select * from finish();
rollback;
