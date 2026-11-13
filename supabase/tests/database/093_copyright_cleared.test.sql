-- Cleared to show (ADD-COPY-08): everyone on duty for a service, in any position, sees its approved
-- videos and graphics, in order of service, and shares the Loaded tick; nobody else does.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('a9300000-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'cleared-' || n || '@example.com',
       jsonb_build_object('display_name', 'Fake On Duty ' || n), now(), now()
from generate_series(1, 2) n;

create temporary table ctx on commit drop as
select (select id from public.departments where kind = 'team' order by sort_order limit 1) as department_id;
insert into public.serving_roles (department_id, name)
select department_id, 'Fake graphics desk' from ctx;

insert into public.events (id, title, starts_at, ends_at, source, external_id) values
  ('a9300000-0000-4000-8000-0000000000e1', 'Fake Cleared Service', now() + interval '3 days',
   now() + interval '3 days 2 hours', 'planning_center', 'fake-cleared-1');
insert into public.service_plan_items (event_id, external_id, position, item_type, title) values
  ('a9300000-0000-4000-8000-0000000000e1', 'fake-announcements', 2, 'item', 'Announcements'),
  ('a9300000-0000-4000-8000-0000000000e1', 'fake-offering', 5, 'item', 'Offering');

do $$
declare
  v_department uuid := (select department_id from ctx);
  v_role uuid := (select id from public.serving_roles where name = 'Fake graphics desk');
  v_position uuid;
begin
  insert into public.event_positions (event_id, department_id, role_id)
  values ('a9300000-0000-4000-8000-0000000000e1', v_department, v_role) returning id into v_position;
  insert into public.event_assignments
    (position_id, event_id, department_id, role_id, user_id, status, readiness, assigned_by, assigned_at)
  values (v_position, 'a9300000-0000-4000-8000-0000000000e1', v_department, v_role,
          'a9300000-0000-4000-8000-000000000001', 'confirmed',
          private.readiness_for('a9300000-0000-4000-8000-000000000001', v_role), null, now());
end;
$$;

insert into public.copyright_requests
  (id, organization_id, first_name, email, kind, media_url, event_id, service_day, description, status,
   decided_via, decided_by_name, decided_at, plan_item_id)
values
  ('a9300000-0000-4000-8000-0000000000a1', (select id from public.organizations order by created_at limit 1),
   'Sam', 'sam.cleared@example.com', 'video', 'https://example.com/v', 'a9300000-0000-4000-8000-0000000000e1',
   current_date + 3, 'Fake missions video', 'approved', 'reviewer', 'Robin', now(), 'fake-offering'),
  ('a9300000-0000-4000-8000-0000000000a2', (select id from public.organizations order by created_at limit 1),
   'Jo', 'jo.cleared@example.com', 'graphic', 'https://example.com/g', 'a9300000-0000-4000-8000-0000000000e1',
   current_date + 3, 'Fake retreat slide', 'approved', 'quality_control', 'Morgan', now(), 'fake-announcements'),
  ('a9300000-0000-4000-8000-0000000000a3', (select id from public.organizations order by created_at limit 1),
   'Al', 'al.cleared@example.com', 'video', 'https://example.com/n', 'a9300000-0000-4000-8000-0000000000e1',
   current_date + 3, 'Fake declined video', 'declined', 'quality_control', 'Morgan', now(), null);

-- Off: nothing shows.
select pg_temp.act_as('a9300000-0000-4000-8000-000000000001');
select is(jsonb_array_length(public.copyright_cleared_for_me()), 0, 'nothing shows while approvals are off');
reset role;
update public.feature_flags set enabled = true where key = 'copyright';

select pg_temp.act_as('a9300000-0000-4000-8000-000000000001');
select is(jsonb_array_length(public.copyright_cleared_for_me()), 2, 'someone on duty sees the approved items');
select is(public.copyright_cleared_for_me() -> 0 ->> 'planItemTitle', 'Announcements',
  'in order of service');
select lives_ok($$ select public.copyright_set_loaded('a9300000-0000-4000-8000-0000000000a1', true) $$,
  'they tick one loaded');
select ok(public.copyright_cleared_for_me() -> 1 ->> 'loadedAt' is not null, 'and everyone sees the tick');
select throws_ok($$ select public.copyright_set_loaded('a9300000-0000-4000-8000-0000000000a3', true) $$,
  '42501', null, 'a declined item cannot be ticked');
reset role;

select pg_temp.act_as('a9300000-0000-4000-8000-000000000002');
select is(jsonb_array_length(public.copyright_cleared_for_me()), 0, 'someone not on duty sees nothing');
select throws_ok($$ select public.copyright_set_loaded('a9300000-0000-4000-8000-0000000000a1', false) $$,
  '42501', null, 'and cannot change the tick');
select is(public.copyright_member_file('a9300000-0000-4000-8000-0000000000a1'), null, 'or open its file');
reset role;

select * from finish();
rollback;
