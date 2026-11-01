-- The service-day board's details: each checklist's department hue, and the positions you're
-- scheduled in. Your own positions only.
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

-- Test people (fake): Leader a5…01 (Camera Department Leader); Operator a5…02 (scheduled as
-- Fake Detail Cam); Helper a5…03 (Camera member, not scheduled).
select pg_temp.new_user('a5000000-0000-4000-8000-000000000001', 'Test Detail Leader');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000002', 'Test Detail Operator');
select pg_temp.new_user('a5000000-0000-4000-8000-000000000003', 'Test Detail Helper');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a5000000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000002', 'active', now()),
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000003', 'active', now());

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;
insert into public.serving_roles (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Detail Cam');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake Detail Cam'));
insert into public.serving_team_members (role_id, department_id, user_id) values
  ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000002'),
  ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a5000000-0000-4000-8000-000000000003');

select pg_temp.act_as('a5000000-0000-4000-8000-000000000001');
insert into public.checklists (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Detail List');
insert into ctx values ('list', (select id from public.checklists where name = 'Fake Detail List'));
insert into public.checklist_sections (checklist_id, name, sort_order) values ((select id from ctx where key = 'list'), 'Setup', 10);
insert into public.checklist_items (section_id, text, sort_order) values
  ((select id from public.checklist_sections where checklist_id = (select id from ctx where key = 'list')), 'Fake detail item', 10);
insert into public.events (title, starts_at, ends_at)
  values ('Fake detail service', now() + interval '1 day', now() + interval '1 day 2 hours');
insert into ctx values ('event', (select id from public.events where title = 'Fake detail service'));
select public.assign_to_position(public.add_event_position((select id from ctx where key = 'event'), (select id from ctx where key = 'cam')),
  'a5000000-0000-4000-8000-000000000002');
reset role;

select pg_temp.act_as('a5000000-0000-4000-8000-000000000002');
select is(
  (select distinct department_hue from public.event_checklists((select id from ctx where key = 'event'))
    where checklist_id = (select id from ctx where key = 'list')),
  (select hue from public.departments where id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  'each checklist carries its department''s hue'
);
select is(
  (select my_positions from public.service_checklist_state((select id from ctx where key = 'event'))),
  array['Fake Detail Cam'], 'the operator sees the position they''re scheduled in'
);
reset role;

select pg_temp.act_as('a5000000-0000-4000-8000-000000000003');
select is(
  (select my_positions from public.service_checklist_state((select id from ctx where key = 'event'))),
  '{}'::text[], 'someone helping without being scheduled has no position, and sees nobody else''s'
);
reset role;

select * from finish();
rollback;
