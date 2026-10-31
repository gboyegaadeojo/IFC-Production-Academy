-- Readiness matrix: ADD-REPORT-01, SRS-RBAC-004. Counts only, scoped to report viewers.
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

select pg_temp.new_user('94000000-0000-4000-8000-000000000001', 'Test Member');
select pg_temp.new_user('94000000-0000-4000-8000-000000000004', 'Test Camera Leader');
insert into public.user_roles (user_id, role_id, department_id) values
  ('94000000-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', '94000000-0000-4000-8000-000000000001', 'active', now());

select pg_temp.act_as('94000000-0000-4000-8000-000000000004');
create temporary table before as
  select approved from public.readiness_matrix() where role_name = 'Sample role (seed data)';
select results_eq(
  $$ select distinct department_id from public.readiness_matrix() $$,
  $$ values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855'::uuid) $$,
  'a department leader sees only their own department'
);
reset role;

-- The member passes the seed practical, so the seed role gains one approved person.
select pg_temp.act_as('94000000-0000-4000-8000-000000000004');
select public.record_practical_assessment('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000044',
  '94000000-0000-4000-8000-000000000001',
  array(select id from public.practical_criteria where practical_id = 'cccccccc-0000-4000-8000-000000000043'), '');
select is(
  (select m.approved - b.approved from public.readiness_matrix() m, before b where m.role_name = 'Sample role (seed data)'),
  1, 'the count follows Approved to Serve'
);
reset role;

select pg_temp.act_as('94000000-0000-4000-8000-000000000001');
select is_empty($$ select 1 from public.readiness_matrix() $$, 'volunteers see no matrix');
reset role;

select * from finish();
rollback;
