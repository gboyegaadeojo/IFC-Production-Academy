-- Deleting a course added by mistake: only by its department's curriculum staff, and never once
-- it has been published (history stays, SRS-CUR-008). The change is audited.
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

-- Test people (fake): Leader a6…01 (Camera Department Leader); Volunteer a6…02 (Camera member).
select pg_temp.new_user('a6000000-0000-4000-8000-000000000001', 'Test Discard Leader');
select pg_temp.new_user('a6000000-0000-4000-8000-000000000002', 'Test Discard Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a6000000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a6000000-0000-4000-8000-000000000002', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into ctx values ('level', (select id from public.levels
  where department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and number = 1));

select pg_temp.act_as('a6000000-0000-4000-8000-000000000001');
insert into ctx values ('mistake', public.create_course((select id from ctx where key = 'level'), 'Fake mistaken course'));
reset role;

-- A volunteer can't delete it.
select pg_temp.act_as('a6000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.discard_draft_course((select id from ctx where key = 'mistake')) $$,
  '42501', null, 'a volunteer cannot delete a course'
);
reset role;

-- The leader can, and it's audited.
select pg_temp.act_as('a6000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.discard_draft_course((select id from ctx where key = 'mistake')) $$,
  'the leader deletes a course that was never published'
);
reset role;
select isnt(
  (select archived_at from public.courses where id = (select id from ctx where key = 'mistake')),
  null, 'it is taken out of the curriculum'
);
select ok(
  exists (select 1 from public.audit_events
          where target_table = 'courses' and target_id = (select id from ctx where key = 'mistake')
            and action = 'course.updated' and metadata -> 'changed' ? 'archived_at'),
  'the deletion is in the audit log'
);

-- A course that was ever published can't be deleted, only archived.
insert into ctx values ('seeded', 'cccccccc-0000-4000-8000-000000000001');
select pg_temp.act_as('a6000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.discard_draft_course((select id from ctx where key = 'seeded')) $$,
  'P0001', 'course_was_published', 'a published course cannot be deleted'
);
reset role;

select * from finish();
rollback;
