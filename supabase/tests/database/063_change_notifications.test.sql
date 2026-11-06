-- People hear about changes a leader makes to them (G, 2026-11-06): a role removed, a request
-- declined, removal from a department, a paused skill, a withdrawn certificate, another quiz
-- attempt, being taken off a service, mentoring ending, and a course no longer assigned.
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

create function pg_temp.kinds(p_user uuid, p_kind text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = p_user and kind::text = p_kind;
$$;

--   Volunteer  93000000-0000-4000-8000-000000000001
--   Other      93000000-0000-4000-8000-000000000002
--   Leader     93000000-0000-4000-8000-000000000004 (Camera Operations)
select pg_temp.new_user('93000000-0000-4000-8000-000000000001', 'Test Volunteer');
select pg_temp.new_user('93000000-0000-4000-8000-000000000002', 'Test Other');
select pg_temp.new_user('93000000-0000-4000-8000-000000000004', 'Test Camera Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('93000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
update public.organizations set notifications_live = true;

-- A role removed tells the person; the automatic Volunteer role never does.
select set_config('request.jwt.claims', '', true);
insert into public.user_roles (user_id, role_id, department_id, granted_by) values
  ('93000000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384',
   'b7ba9dae-cab5-43e0-a996-8ae9d2436855', '93000000-0000-4000-8000-000000000004');
update public.user_roles set revoked_at = now(), revoked_by = '93000000-0000-4000-8000-000000000004'
 where user_id = '93000000-0000-4000-8000-000000000002' and role_id = '297464be-2cae-430d-94bf-6038bd745384';
select is(pg_temp.kinds('93000000-0000-4000-8000-000000000002', 'role_removed'), 1,
  'removing a role tells the person');
select ok(
  (select title like 'You''re no longer % for Camera Operations' from public.notifications
    where user_id = '93000000-0000-4000-8000-000000000002' and kind = 'role_removed'),
  'it says which role and where');
select is(pg_temp.kinds('93000000-0000-4000-8000-000000000001', 'role_granted'), 0,
  'the Volunteer role every new account gets sends nothing');

-- Declined and removed memberships; the reason a leader typed stays with leaders.
select pg_temp.act_as('93000000-0000-4000-8000-000000000002');
select public.request_membership('b7ba9dae-cab5-43e0-a996-8ae9d2436855');
reset role;
select pg_temp.act_as('93000000-0000-4000-8000-000000000004');
select public.decide_membership(
  (select id from public.department_memberships where user_id = '93000000-0000-4000-8000-000000000002'),
  'declined', 'Private leader note');
reset role;
select is(pg_temp.kinds('93000000-0000-4000-8000-000000000002', 'membership_declined'), 1,
  'a declined request tells the person');
select is_empty(
  $q$ select 1 from public.notifications where body like '%Private leader note%' $q$,
  'the leader''s reason is never sent');

select pg_temp.act_as('93000000-0000-4000-8000-000000000001');
select public.request_membership('b7ba9dae-cab5-43e0-a996-8ae9d2436855');
reset role;
select pg_temp.act_as('93000000-0000-4000-8000-000000000004');
select public.decide_membership(
  (select id from public.department_memberships where user_id = '93000000-0000-4000-8000-000000000001'),
  'active');
select public.decide_membership(
  (select id from public.department_memberships where user_id = '93000000-0000-4000-8000-000000000001'),
  'removed');
reset role;
select is(pg_temp.kinds('93000000-0000-4000-8000-000000000001', 'membership_removed'), 1,
  'removal from a department tells the person');

-- A course no longer assigned.
select set_config('request.jwt.claims', '', true);
insert into public.course_assignments (user_id, course_id, department_id, assigned_by) values
  ('93000000-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'b7ba9dae-cab5-43e0-a996-8ae9d2436855', '93000000-0000-4000-8000-000000000004');
update public.course_assignments set removed_at = now(), removed_by = '93000000-0000-4000-8000-000000000004'
 where user_id = '93000000-0000-4000-8000-000000000001';
select is(pg_temp.kinds('93000000-0000-4000-8000-000000000001', 'course_unassigned'), 1,
  'a course no longer assigned tells the person');

-- Another quiz attempt.
insert into public.quiz_attempt_allowances (user_id, course_id, quiz_key, department_id, reason, granted_by)
values ('93000000-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
        'cccccccc-0000-4000-8000-000000000032', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', '',
        '93000000-0000-4000-8000-000000000004');
select ok(
  (select title = 'Another try: Sample quiz (seed data)' and body like 'Test Camera Leader gave you another attempt%'
     from public.notifications
    where user_id = '93000000-0000-4000-8000-000000000001' and kind = 'quiz_attempt_granted'),
  'another quiz attempt says which quiz and who gave it');

-- Mentoring ends: both people hear.
insert into public.mentor_relationships (department_id, mentor_id, mentee_id) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '93000000-0000-4000-8000-000000000002',
   '93000000-0000-4000-8000-000000000001');
update public.mentor_relationships set ended_at = now()
 where mentee_id = '93000000-0000-4000-8000-000000000001';
select is(
  pg_temp.kinds('93000000-0000-4000-8000-000000000001', 'mentoring_ended')
    + pg_temp.kinds('93000000-0000-4000-8000-000000000002', 'mentoring_ended'),
  2, 'when mentoring ends, mentor and mentee both hear');

-- A paused skill.
insert into public.competency_records (user_id, competency_id, department_id) values
  ('93000000-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000041',
   'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
update public.competency_records
   set status = 'suspended', suspended_at = now(), suspend_reason = 'Fake reason'
 where user_id = '93000000-0000-4000-8000-000000000001';
select is(pg_temp.kinds('93000000-0000-4000-8000-000000000001', 'skill_suspended'), 1,
  'pausing a skill tells the person');

-- A withdrawn certificate.
insert into public.certificates
  (reference, user_id, course_id, course_version_id, department_id, recipient_name, course_title,
   department_name, level_number, version_number)
values ('IFC-0000-0000-0001', '93000000-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
        'cccccccc-0000-4000-8000-000000000011', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Test Volunteer',
        'Sample course (seed data)', 'Camera Operations', 1, 1);
update public.certificates set revoked_at = now(), revoke_reason = 'Fake reason'
 where reference = 'IFC-0000-0000-0001';
select ok(
  (select title = 'A certificate was withdrawn: Sample course (seed data)' from public.notifications
    where user_id = '93000000-0000-4000-8000-000000000001' and kind = 'certificate_withdrawn'),
  'withdrawing a certificate tells the person which one');

-- Taken off a service; a whole service cancelled is service_changed's job, not this one.
-- Events take their organization from whoever is signed in.
select set_config('request.jwt.claims',
  json_build_object('sub', '93000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
insert into public.serving_roles (id, department_id, name) values
  ('93000000-0000-4000-8000-0000000000f1', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake camera');
insert into public.events (id, title, starts_at, ends_at) values
  ('93000000-0000-4000-8000-0000000000e1', 'Fake Sunday', now() + interval '3 days', now() + interval '3 days 2 hours');
insert into public.event_positions (id, event_id, department_id, role_id) values
  ('93000000-0000-4000-8000-0000000000a1', '93000000-0000-4000-8000-0000000000e1',
   'b7ba9dae-cab5-43e0-a996-8ae9d2436855', '93000000-0000-4000-8000-0000000000f1');
insert into public.event_assignments
  (position_id, event_id, department_id, role_id, user_id, status, readiness, assigned_at)
values ('93000000-0000-4000-8000-0000000000a1', '93000000-0000-4000-8000-0000000000e1',
        'b7ba9dae-cab5-43e0-a996-8ae9d2436855', '93000000-0000-4000-8000-0000000000f1',
        '93000000-0000-4000-8000-000000000002', 'confirmed',
        private.readiness_for('93000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-0000000000f1'),
        now());
update public.event_assignments set status = 'cancelled', cancelled_at = now()
 where user_id = '93000000-0000-4000-8000-000000000002';
select ok(
  (select title = 'You''re no longer scheduled: Fake camera' and body like 'Fake Sunday, %'
     from public.notifications
    where user_id = '93000000-0000-4000-8000-000000000002' and kind = 'assignment_cancelled'),
  'being taken off a service says which position and service');

select * from finish();
rollback;
