-- Notifications: SRS-NOTIF-001..006, SOP review reminders, SRS-RBAC-004.
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

--   Volunteer  92000000-0000-4000-8000-000000000001
--   Other      92000000-0000-4000-8000-000000000002
--   Leader     92000000-0000-4000-8000-000000000004
select pg_temp.new_user('92000000-0000-4000-8000-000000000001', 'Test Volunteer');
select pg_temp.new_user('92000000-0000-4000-8000-000000000002', 'Test Other');
select pg_temp.new_user('92000000-0000-4000-8000-000000000004', 'Test Camera Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('92000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

-- Joining a department notifies the volunteer (once).
select pg_temp.act_as('92000000-0000-4000-8000-000000000001');
select public.request_membership('b7ba9dae-cab5-43e0-a996-8ae9d2436855');
reset role;
select pg_temp.act_as('92000000-0000-4000-8000-000000000004');
select public.decide_membership(
  (select id from public.department_memberships where user_id = '92000000-0000-4000-8000-000000000001'),
  'active');
reset role;
select is(
  (select count(*)::int from public.notifications where user_id = '92000000-0000-4000-8000-000000000001' and kind = 'membership_approved'),
  1, 'joining a department notifies the volunteer'
);
select is(
  (select link from public.notifications where user_id = '92000000-0000-4000-8000-000000000001' and kind = 'membership_approved'),
  '/departments/camera-operations', 'the notification links into the Academy'
);

-- A practical assessment notifies the learner.
select pg_temp.act_as('92000000-0000-4000-8000-000000000004');
select public.record_practical_assessment('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000044',
  '92000000-0000-4000-8000-000000000001', '{}', 'Fake feedback');
reset role;
select is(
  (select title from public.notifications where user_id = '92000000-0000-4000-8000-000000000001' and kind = 'assessment_recorded'),
  'Assessment feedback: Sample practical (seed data)', 'an assessment result notifies the learner, without the feedback text'
);

-- People read only their own, and mark them read.
select pg_temp.act_as('92000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.notifications $$, 'nobody reads someone else''s notifications');
reset role;
select pg_temp.act_as('92000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.notifications), 2, 'the volunteer reads their own');
select public.mark_notifications_read();
select is((select count(*)::int from public.notifications where read_at is null), 0, 'and marks them read');
select throws_ok($$ update public.notifications set title = 'x' $$, '42501', null, 'notifications are not edited directly');
select lives_ok($$ select public.set_notification_email('assessment_recorded', false) $$, 'a volunteer turns off one kind of email');
select throws_ok(
  $$ select * from public.claim_email_notifications(10) $$,
  '42501', null, 'only the email job can claim emails'
);
reset role;

-- The email job (service role): turned-off kinds are skipped, the rest are claimed with an address.
set local role service_role;
select results_eq(
  $$ select email from public.claim_email_notifications(50) where email = '92000000-0000-4000-8000-000000000001@example.com' $$,
  $$ values ('92000000-0000-4000-8000-000000000001@example.com'::text) $$,
  'the job claims the email that is still wanted'
);
reset role;
select is(
  (select email_status::text from public.notifications where user_id = '92000000-0000-4000-8000-000000000001' and kind = 'assessment_recorded'),
  'skipped', 'a turned-off kind is skipped'
);
set local role service_role;
select public.complete_email_notification(
  (select id from public.notifications where user_id = '92000000-0000-4000-8000-000000000001' and kind = 'membership_approved'), true);
reset role;
select is(
  (select email_status::text from public.notifications where user_id = '92000000-0000-4000-8000-000000000001' and kind = 'membership_approved'),
  'sent', 'a sent email is recorded'
);

-- SOP review reminders reach the owner once per due date.
insert into public.sops (id, department_id, owner_id, review_interval_months, last_reviewed_at)
values ('93000000-0000-4000-8000-000000000001', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855',
        '92000000-0000-4000-8000-000000000004', 3, now() - interval '4 months');
insert into public.sop_versions (sop_id, department_id, version_number, status, title, file_path, file_name, file_size, file_type, published_at)
values ('93000000-0000-4000-8000-000000000001', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 1, 'published', 'Fake overdue SOP',
        'b7ba9dae-cab5-43e0-a996-8ae9d2436855/93000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.pdf',
        'f.pdf', 10, 'application/pdf', now());
set local role service_role;
select public.queue_sop_review_reminders();
select public.queue_sop_review_reminders();
reset role;
select is(
  (select count(*)::int from public.notifications where user_id = '92000000-0000-4000-8000-000000000004' and kind = 'sop_review_due'),
  1, 'an overdue SOP reminds its owner once'
);

select * from finish();
rollback;
