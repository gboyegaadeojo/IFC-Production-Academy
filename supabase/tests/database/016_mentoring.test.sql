-- Mentoring: SRS-MENTOR-001..005, SRS-RBAC-006 (private notes have their own policy).
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

--   Volunteer       91000000-0000-4000-8000-000000000001
--   Other member    91000000-0000-4000-8000-000000000002
--   Camera Leader   91000000-0000-4000-8000-000000000004  (mentoring.assign, mentoring.feedback)
--   Audio Leader    91000000-0000-4000-8000-000000000005
--   Camera Trainer  91000000-0000-4000-8000-000000000006  (mentoring.feedback, mentoring.private_notes)
select pg_temp.new_user('91000000-0000-4000-8000-000000000001', 'Test Volunteer');
select pg_temp.new_user('91000000-0000-4000-8000-000000000002', 'Test Other Member');
select pg_temp.new_user('91000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('91000000-0000-4000-8000-000000000005', 'Test Audio Leader');
select pg_temp.new_user('91000000-0000-4000-8000-000000000006', 'Test Camera Trainer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('91000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('91000000-0000-4000-8000-000000000005', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'),
  ('91000000-0000-4000-8000-000000000006', (select id from public.roles where key = 'trainer'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '91000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '91000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- ---------------------------------------------------------------------------
-- Pairing (SRS-MENTOR-001)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('91000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.assign_mentor('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '91000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000001') $$,
  '42501', 'not_authorized', 'volunteers cannot pair mentors'
);
reset role;

select pg_temp.act_as('91000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.assign_mentor('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001') $$,
  'P0001', 'mentor_not_eligible', 'a mentor must be a trainer or leader for the department'
);
select throws_ok(
  $$ select public.assign_mentor('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '91000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000005') $$,
  'P0001', 'mentee_not_member', 'the volunteer must be a member'
);
insert into ctx values ('pair', public.assign_mentor('b7ba9dae-cab5-43e0-a996-8ae9d2436855',
  '91000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000001'));
select throws_ok(
  $$ select public.assign_mentor('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '91000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000001') $$,
  'P0001', 'already_paired', 'no duplicate pairing'
);
reset role;
select ok(exists (select 1 from public.audit_events where action = 'mentor_relationship.created'
  and actor_id = '91000000-0000-4000-8000-000000000004'), 'pairing is audited');

select pg_temp.act_as('91000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.assign_mentor('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '91000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000002') $$,
  '42501', 'not_authorized', 'another department''s leader cannot pair camera volunteers'
);
reset role;

-- ---------------------------------------------------------------------------
-- Notes: shared vs private (SRS-RBAC-006)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('91000000-0000-4000-8000-000000000006');
select lives_ok(
  $$ insert into public.mentoring_notes (relationship_id, visibility, body) values ((select id from ctx where key = 'pair'), 'private', 'Fake private observation') $$,
  'the mentor writes a private note'
);
select lives_ok(
  $$ insert into public.mentoring_notes (relationship_id, visibility, body) values ((select id from ctx where key = 'pair'), 'shared', 'Fake shared feedback') $$,
  'the mentor shares feedback'
);
select is((select count(*)::int from public.mentoring_notes), 2, 'the mentor reads both of their notes');
reset role;

select pg_temp.act_as('91000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select body from public.mentoring_notes $$,
  $$ values ('Fake shared feedback'::text) $$,
  'the volunteer reads shared notes, never the mentor''s private ones'
);
select throws_ok(
  $$ insert into public.mentoring_notes (relationship_id, visibility, body) values ((select id from ctx where key = 'pair'), 'private', 'Sneaky') $$,
  '42501', null, 'the volunteer cannot write private notes'
);
select lives_ok(
  $$ insert into public.mentoring_notes (relationship_id, visibility, body) values ((select id from ctx where key = 'pair'), 'shared', 'Fake reply') $$,
  'the volunteer replies in shared notes'
);
select results_eq(
  $$ select mentor_name, mentee_name, my_part from public.my_mentoring() $$,
  $$ values ('Test Camera Trainer'::text, 'Test Volunteer'::text, 'mentee'::text) $$,
  'the volunteer sees who mentors them'
);
reset role;

select pg_temp.act_as('91000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.mentoring_notes), 2, 'the leader reads shared notes only');
select is_empty($$ select 1 from public.mentoring_notes where visibility = 'private' $$,
  'leaders never read a mentor''s private notes');
reset role;

select pg_temp.act_as('91000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.mentoring_notes $$, 'another member reads no notes');
select is_empty($$ select 1 from public.mentor_relationships $$, 'or pairings');
select throws_ok(
  $$ insert into public.mentoring_notes (relationship_id, visibility, body) values ((select id from ctx where key = 'pair'), 'shared', 'Intruding') $$,
  '42501', null, 'outsiders to a pairing cannot write in it'
);
reset role;

-- ---------------------------------------------------------------------------
-- Goals (SRS-MENTOR-002)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('91000000-0000-4000-8000-000000000001');
insert into public.mentoring_goals (relationship_id, title, due_on) values ((select id from ctx where key = 'pair'), 'Fake goal', current_date + 7);
reset role;
select pg_temp.act_as('91000000-0000-4000-8000-000000000002');
update public.mentoring_goals set status = 'done', completed_at = now();
reset role;
select is((select status::text from public.mentoring_goals), 'open', 'outsiders cannot change goals');
select pg_temp.act_as('91000000-0000-4000-8000-000000000006');
update public.mentoring_goals set status = 'done', completed_at = now();
reset role;
select is((select status::text from public.mentoring_goals), 'done', 'the mentor marks a goal done');

-- ---------------------------------------------------------------------------
-- Ending
-- ---------------------------------------------------------------------------
select pg_temp.act_as('91000000-0000-4000-8000-000000000004');
select lives_ok($$ select public.end_mentoring((select id from ctx where key = 'pair'), 'Fake reason') $$, 'the leader ends the pairing');
reset role;
select pg_temp.act_as('91000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ insert into public.mentoring_notes (relationship_id, visibility, body) values ((select id from ctx where key = 'pair'), 'shared', 'Late') $$,
  '42501', null, 'an ended pairing takes no new notes'
);
select is((select count(*)::int from public.mentoring_notes), 3, 'its notes are kept and readable');
select throws_ok($$ delete from public.mentoring_notes $$, '42501', null, 'notes cannot be deleted');
reset role;

select * from finish();
rollback;
