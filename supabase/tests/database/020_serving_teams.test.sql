-- Position teams (decision record 9): who may add people, what they see, and the membership link.
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
--   Scheduling admin  a2000000-0000-4000-8000-000000000001  (Scheduling Administrator, org-wide)
--   Volunteer         a2000000-0000-4000-8000-000000000002  (Camera member)
--   Newcomer          a2000000-0000-4000-8000-000000000003  (in no department)
--   Camera Leader     a2000000-0000-4000-8000-000000000004  (Department Leader for Camera)
select pg_temp.new_user('a2000000-0000-4000-8000-000000000001', 'Test Scheduling Admin');
select pg_temp.new_user('a2000000-0000-4000-8000-000000000002', 'Test Volunteer');
select pg_temp.new_user('a2000000-0000-4000-8000-000000000003', 'Test Newcomer');
select pg_temp.new_user('a2000000-0000-4000-8000-000000000004', 'Test Camera Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a2000000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null),
  ('a2000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a2000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Camera 1');
insert into ctx values ('role', (select id from public.serving_roles where name = 'Fake Camera 1'));

select ok(
  exists (select 1 from public.role_capabilities rc
          join public.roles r on r.id = rc.role_id join public.capabilities c on c.id = rc.capability_id
          where r.key = 'scheduling_admin' and c.key = 'team.manage'),
  'the Scheduling Administrator runs the teams'
);

-- Volunteers can't build teams.
select pg_temp.act_as('a2000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.add_to_serving_team((select id from ctx where key = 'role'), 'a2000000-0000-4000-8000-000000000002') $$,
  '42501', 'not_authorized', 'a volunteer cannot add themselves to a team'
);
select throws_ok(
  $$ select * from public.serving_team_overview('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501', 'not_authorized', 'a volunteer cannot list everyone'
);
reset role;

-- The scheduling admin sees the positions and adds people.
select pg_temp.act_as('a2000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.serving_roles where id = (select id from ctx where key = 'role')),
  1, 'the scheduling admin can read the department''s positions'
);
select lives_ok(
  $$ select public.add_to_serving_team((select id from ctx where key = 'role'), 'a2000000-0000-4000-8000-000000000002') $$,
  'a member is added to a position'
);
select lives_ok(
  $$ select public.add_to_serving_team((select id from ctx where key = 'role'), 'a2000000-0000-4000-8000-000000000002') $$,
  'adding twice is harmless'
);
select lives_ok(
  $$ select public.add_to_serving_team((select id from ctx where key = 'role'), 'a2000000-0000-4000-8000-000000000003') $$,
  'someone not in the department can be added directly'
);
select ok(
  (select is_member and (select id from ctx where key = 'role') = any(team_role_ids)
     from public.serving_team_overview('b7ba9dae-cab5-43e0-a996-8ae9d2436855')
    where user_id = 'a2000000-0000-4000-8000-000000000003'),
  'and joins the department too'
);
select is(
  (select display_name from public.profiles where id = 'a2000000-0000-4000-8000-000000000003'),
  'Test Newcomer', 'the scheduling admin can read team members'' names'
);
reset role;

select is(
  (select count(*)::int from public.serving_team_members where removed_at is null and role_id = (select id from ctx where key = 'role')),
  2, 'one open place per person per position'
);
select ok(
  exists (select 1 from public.audit_events where action = 'serving_team_member.created'
            and actor_id = 'a2000000-0000-4000-8000-000000000001'),
  'adding to a team is audited'
);

-- Volunteers see only their own places.
select pg_temp.act_as('a2000000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.serving_team_members),
  1, 'a volunteer sees only their own team places'
);
reset role;

-- The department leader removes someone; leaving the department ends the rest.
select pg_temp.act_as('a2000000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.remove_from_serving_team((select id from ctx where key = 'role'), 'a2000000-0000-4000-8000-000000000003') $$,
  'a department leader takes someone off a position'
);
select lives_ok(
  $$ select public.decide_membership(
       (select id from public.department_memberships where user_id = 'a2000000-0000-4000-8000-000000000002' and status = 'active'),
       'removed', 'Moved away') $$,
  'a member leaves the department'
);
reset role;
select is(
  (select count(*)::int from public.serving_team_members where removed_at is null and role_id = (select id from ctx where key = 'role')),
  0, 'leaving the department ends their team places, and history is kept'
);
select is(
  (select count(*)::int from public.serving_team_members where role_id = (select id from ctx where key = 'role')),
  2, 'removed places stay as history'
);

select * from finish();
rollback;
