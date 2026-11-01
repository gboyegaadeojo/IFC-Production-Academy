-- Scheduling with training shown, not enforced: SRS-SCHED-001..011, SRS-COMP-005..008, workflow D.
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
--   Approved member   e0000000-0000-4000-8000-000000000001
--   New member        e0000000-0000-4000-8000-000000000002
--   Outsider          e0000000-0000-4000-8000-000000000003
--   Camera Leader     e0000000-0000-4000-8000-000000000004  (schedule.manage, no override)
--   Director          e0000000-0000-4000-8000-000000000005  (schedule.manage and schedule.override)
select pg_temp.new_user('e0000000-0000-4000-8000-000000000001', 'Test Approved Member');
select pg_temp.new_user('e0000000-0000-4000-8000-000000000002', 'Test New Member');
select pg_temp.new_user('e0000000-0000-4000-8000-000000000003', 'Test Outsider');
select pg_temp.new_user('e0000000-0000-4000-8000-000000000004', 'Test Camera Leader');
select pg_temp.new_user('e0000000-0000-4000-8000-000000000005', 'Test Director');
insert into public.user_roles (user_id, role_id, department_id) values
  ('e0000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('e0000000-0000-4000-8000-000000000005', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null);
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'e0000000-0000-4000-8000-000000000001', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'e0000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- A role that needs one competency; the first member holds it.
select pg_temp.act_as('e0000000-0000-4000-8000-000000000004');
insert into public.competencies (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake switching');
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake switcher');
insert into ctx values
  ('comp', (select id from public.competencies where name = 'Fake switching')),
  ('role', (select id from public.serving_roles where name = 'Fake switcher'));
select public.set_role_competencies((select id from ctx where key = 'role'), array[(select id from ctx where key = 'comp')]);
reset role;
select private.grant_competency('e0000000-0000-4000-8000-000000000001', (select id from ctx where key = 'comp'), null);
-- Both members are on the position's team (decision record 9); the outsider isn't.
insert into public.serving_team_members (role_id, department_id, user_id) values
  ((select id from ctx where key = 'role'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'e0000000-0000-4000-8000-000000000001'),
  ((select id from ctx where key = 'role'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'e0000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Events and positions (SRS-SCHED-001)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('e0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.events (title, starts_at, ends_at) values ('Nope', now() + interval '1 day', now() + interval '1 day 2 hours') $$,
  '42501', null, 'volunteers cannot add events'
);
reset role;

select pg_temp.act_as('e0000000-0000-4000-8000-000000000004');
insert into public.events (title, starts_at, ends_at)
  values ('Fake service', date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 2 hours');
insert into ctx values ('event', (select id from public.events where title = 'Fake service'));
insert into ctx values
  ('pos1', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'role'))),
  ('pos2', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'role'))),
  ('pos3', public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'role')));
-- A second, later event for someone still learning.
insert into public.events (title, starts_at, ends_at)
  values ('Fake later service', date_trunc('hour', now()) + interval '10 days', date_trunc('hour', now()) + interval '10 days 2 hours');
insert into ctx values ('pos4', public.add_event_position((select id from public.events where title = 'Fake later service'), (select id from ctx where key = 'role')));
select throws_ok(
  $$ insert into public.events (title, starts_at, ends_at) values ('Backwards', now() + interval '2 days', now() + interval '1 day') $$,
  '23514', null, 'an event ends after it starts'
);
select results_eq(
  $$ select user_id, approved, conflict, unavailable from public.schedule_candidates((select id from ctx where key = 'pos1'))
      where user_id in ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')
      order by user_id $$,
  $$ values ('e0000000-0000-4000-8000-000000000001'::uuid, true, false, false),
            ('e0000000-0000-4000-8000-000000000002'::uuid, false, false, false) $$,
  'the candidate list says who is approved'
);

-- ---------------------------------------------------------------------------
-- The checks (SRS-COMP-005..008)
-- ---------------------------------------------------------------------------
select is(
  public.assign_to_position((select id from ctx where key = 'pos1'), 'e0000000-0000-4000-8000-000000000001')::text,
  'approved', 'an approved volunteer is scheduled'
);
select throws_ok(
  $$ select public.assign_to_position((select id from ctx where key = 'pos1'), 'e0000000-0000-4000-8000-000000000002') $$,
  'P0001', 'position_filled', 'one person per position'
);
select throws_ok(
  $$ select public.assign_to_position((select id from ctx where key = 'pos2'), 'e0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'schedule_conflict', 'nobody serves twice at the same time'
);
-- Training is shown, never enforced (decided 2026-10-31): someone still learning can serve.
select is(
  public.assign_to_position((select id from ctx where key = 'pos4'), 'e0000000-0000-4000-8000-000000000002')::text,
  'learning', 'someone still learning is scheduled, and the assignment says so'
);
select throws_ok(
  $$ select public.assign_to_position((select id from ctx where key = 'pos2'), 'e0000000-0000-4000-8000-000000000002',
       'e0000000-0000-4000-8000-000000000002') $$,
  'P0001', 'supervisor_not_approved', 'a supervisor must be someone else who is approved'
);
select throws_ok(
  $$ select public.assign_to_position((select id from ctx where key = 'pos2'), 'e0000000-0000-4000-8000-000000000003') $$,
  'P0001', 'not_on_team', 'only people on the position''s team are scheduled'
);
reset role;

-- The new member is away that day.
select pg_temp.act_as('e0000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.add_unavailability(
       ((select starts_at from public.events where id = (select id from ctx where key = 'event')) at time zone 'America/Winnipeg')::date,
       ((select starts_at from public.events where id = (select id from ctx where key = 'event')) at time zone 'America/Winnipeg')::date,
       'Away') $$,
  'a volunteer marks a day away'
);
reset role;
select pg_temp.act_as('e0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.assign_to_position((select id from ctx where key = 'pos2'), 'e0000000-0000-4000-8000-000000000002',
       'e0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'volunteer_unavailable', 'nobody is scheduled on a day they are away'
);
reset role;
select pg_temp.act_as('e0000000-0000-4000-8000-000000000002');
select public.remove_unavailability((select id from public.unavailability where user_id = 'e0000000-0000-4000-8000-000000000002'));
reset role;

select pg_temp.act_as('e0000000-0000-4000-8000-000000000004');
select is(
  public.assign_to_position((select id from ctx where key = 'pos2'), 'e0000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000001')::text,
  'supervised', 'supervised practice with a named, approved supervisor (SRS-COMP-007)'
);
reset role;
select is(
  (select supervisor_id from public.event_assignments where position_id = (select id from ctx where key = 'pos2')),
  'e0000000-0000-4000-8000-000000000001'::uuid, 'the supervisor is recorded'
);

-- An override needs the capability and a reason, and is audited (SRS-COMP-008).
select pg_temp.act_as('e0000000-0000-4000-8000-000000000005');
select is(
  public.assign_to_position((select id from ctx where key = 'pos3'), 'e0000000-0000-4000-8000-000000000001',
    null, 'Only switcher available; double duty agreed')::text,
  'approved', 'the director can override the conflict, with a reason'
);
reset role;
select is(
  (select override_reason from public.event_assignments where position_id = (select id from ctx where key = 'pos3')),
  'Only switcher available; double duty agreed', 'the override reason is kept'
);
select ok(
  exists (select 1 from public.audit_events where action = 'event_assignment.created'
            and actor_id = 'e0000000-0000-4000-8000-000000000005'),
  'assignments are audited'
);

-- One position a day across the production team, even at different times.
select pg_temp.act_as('e0000000-0000-4000-8000-000000000004');
insert into public.events (title, starts_at, ends_at) values
  ('Fake morning', ((current_date + 20)::timestamp + time '09:00') at time zone 'America/Winnipeg',
                   ((current_date + 20)::timestamp + time '10:00') at time zone 'America/Winnipeg'),
  ('Fake evening', ((current_date + 20)::timestamp + time '18:00') at time zone 'America/Winnipeg',
                   ((current_date + 20)::timestamp + time '19:00') at time zone 'America/Winnipeg');
insert into ctx values
  ('pos5', public.add_event_position((select id from public.events where title = 'Fake morning'), (select id from ctx where key = 'role'))),
  ('pos6', public.add_event_position((select id from public.events where title = 'Fake evening'), (select id from ctx where key = 'role')));
select is(
  public.assign_to_position((select id from ctx where key = 'pos5'), 'e0000000-0000-4000-8000-000000000001')::text,
  'approved', 'scheduled in the morning'
);
select throws_ok(
  $$ select public.assign_to_position((select id from ctx where key = 'pos6'), 'e0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'schedule_conflict', 'not a second position the same day'
);
reset role;

-- Taken off the team: no longer offered or scheduled.
select pg_temp.act_as('e0000000-0000-4000-8000-000000000004');
select ok(
  exists (select 1 from public.schedule_candidates((select id from ctx where key = 'pos6'))
          where user_id = 'e0000000-0000-4000-8000-000000000002'),
  'team members are offered'
);
select is(
  (select count(*)::int from public.schedule_candidates((select id from ctx where key = 'pos6'))
    where user_id = 'e0000000-0000-4000-8000-000000000003'),
  0, 'people off the team are not offered'
);
reset role;

-- ---------------------------------------------------------------------------
-- Volunteers respond; visibility
-- ---------------------------------------------------------------------------
select pg_temp.act_as('e0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.assign_to_position((select id from ctx where key = 'pos3'), 'e0000000-0000-4000-8000-000000000002') $$,
  '42501', 'not_authorized', 'volunteers cannot schedule people'
);
select lives_ok(
  $$ select public.respond_to_assignment((select id from public.event_assignments where position_id = (select id from ctx where key = 'pos1')), 'confirmed') $$,
  'a volunteer confirms'
);
select is((select count(*)::int from public.event_assignments), 3, 'volunteers see their own assignments');
reset role;
select pg_temp.act_as('e0000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.respond_to_assignment((select id from public.event_assignments where position_id = (select id from ctx where key = 'pos1')), 'declined') $$,
  '42501', 'not_authorized', 'nobody answers for someone else'
);
select is((select count(*)::int from public.event_assignments), 2, 'and never see other volunteers'' assignments');
select lives_ok(
  $$ select public.respond_to_assignment((select id from public.event_assignments where position_id = (select id from ctx where key = 'pos2')), 'declined') $$,
  'a volunteer declines'
);
reset role;

select pg_temp.act_as('e0000000-0000-4000-8000-000000000003');
select is_empty($$ select 1 from public.event_assignments $$, 'outsiders see no assignments');
reset role;

-- ---------------------------------------------------------------------------
-- Cancelling and closed events
-- ---------------------------------------------------------------------------
select pg_temp.act_as('e0000000-0000-4000-8000-000000000004');
select lives_ok($$ select public.cancel_event((select id from ctx where key = 'event')) $$, 'the leader cancels the event');
reset role;
select is(
  (select count(*)::int from public.event_assignments where event_id = (select id from ctx where key = 'event') and status in ('pending', 'confirmed')),
  0, 'cancelling an event cancels its assignments'
);
select pg_temp.act_as('e0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'role')) $$,
  'P0001', 'event_closed', 'a cancelled event takes no new positions'
);
reset role;

select * from finish();
rollback;
