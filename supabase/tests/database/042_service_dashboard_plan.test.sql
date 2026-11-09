-- Service Dashboard, stage 2 (ADD-DASH-05): run of service, who's serving, producer notes.
begin;
select no_plan();

-- Planning Center schedules, so its sync applies (the local seed has the Academy scheduling).
update public.organizations set scheduling_source = 'planning_center';

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
--   Teammate   a7000000-0000-4000-8000-000000000001  (on a serving team)
--   Outsider   a7000000-0000-4000-8000-000000000002  (signed in, on no team)
select pg_temp.new_user('a7000000-0000-4000-8000-000000000001', 'Test Plan Teammate');
select pg_temp.new_user('a7000000-0000-4000-8000-000000000002', 'Test Plan Outsider');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7000000-0000-4000-8000-000000000001', 'active', now());
insert into public.serving_roles (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Plan Cam');
insert into public.serving_team_members (role_id, department_id, user_id)
select id, 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a7000000-0000-4000-8000-000000000001'
from public.serving_roles where name = 'Fake Plan Cam';

insert into public.events (organization_id, title, starts_at, ends_at, source, external_id)
select id, 'Fake planned service', now() + interval '1 day', now() + interval '1 day 2 hours',
       'planning_center', 'fake-plan-1'
from public.organizations limit 1;

create temporary table ctx (id uuid);
grant all on ctx to authenticated;
insert into ctx select id from public.events where external_id = 'fake-plan-1';

-- Only the scheduled job applies the plan.
select pg_temp.act_as('a7000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.sync_service_plan_items('{"plans":[]}'::jsonb)$$,
  '42501', null, 'a signed-in person cannot apply a plan');
select throws_ok(
  $$insert into public.service_plan_items (event_id, external_id, position, item_type, title)
    select id, 'x', 1, 'item', 'Direct' from ctx$$,
  '42501', null, 'the run of service cannot be written directly');
reset role;

-- As the scheduled job: nobody is signed in.
select set_config('request.jwt.claims', '', true);

select is(
  public.sync_service_plan_items($${"plans":[
    {"plan_id":"fake-plan-1","items":[
      {"id":"i1","position":1,"item_type":"header","title":"Worship","length_seconds":0,"service_position":"during","notes":[]},
      {"id":"i2","position":2,"item_type":"song","title":"Example Song","length_seconds":300,"service_position":"during","notes":[{"category":"Audio","content":"Fake note"}]},
      {"id":"i3","position":3,"item_type":"item","title":"Gone soon","length_seconds":60,"service_position":"during","notes":[]}
    ]},
    {"plan_id":"not-a-known-plan","items":[{"id":"z","position":1,"item_type":"item","title":"Skipped","length_seconds":1,"service_position":"during","notes":[]}]}
  ]}$$::jsonb),
  '{"plans":1,"items":3}'::jsonb,
  'the job applies a plan, and skips one that has no event');

select is(
  public.sync_service_plan_items($${"plans":[
    {"plan_id":"fake-plan-1","items":[
      {"id":"i1","position":1,"item_type":"header","title":"Worship","length_seconds":0,"service_position":"during","notes":[]},
      {"id":"i2","position":2,"item_type":"song","title":"Example Song Renamed","length_seconds":320,"service_position":"during","notes":[]}
    ]}
  ]}$$::jsonb),
  '{"plans":1,"items":2}'::jsonb,
  'running it again applies the latest');
select is(
  (select count(*)::int from public.service_plan_items i join ctx on ctx.id = i.event_id),
  2, 'an item removed in Planning Center goes away, with no duplicates');
select is(
  (select title from public.service_plan_items where external_id = 'i2'),
  'Example Song Renamed', 'a changed item is updated');

-- Who reads it.
select pg_temp.act_as('a7000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.service_plan_items), 2, 'a team member reads the run of service');
select lives_ok(
  $$select * from public.service_dashboard_team((select id from ctx))$$,
  'a team member reads who is serving');
select lives_ok(
  $$select public.save_service_note((select id from ctx), 'Fake note for the team')$$,
  'a team member saves producer notes');
select lives_ok(
  $$select public.save_service_note((select id from ctx), 'Fake note, edited')$$,
  'saving again replaces the note');
select is(
  (select body from public.service_notes n join ctx on ctx.id = n.event_id),
  'Fake note, edited', 'the latest note wins');
select throws_ok(
  $$update public.service_notes set body = 'Direct'$$,
  '42501', null, 'notes cannot be written directly');
select throws_ok(
  $$select public.save_service_note((select id from ctx), repeat('x', 4001))$$,
  '23514', null, 'a note that is too long is refused');
reset role;

select pg_temp.act_as('a7000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.service_plan_items), 0, 'someone on no team reads no run of service');
select is((select count(*)::int from public.service_notes), 0, 'someone on no team reads no notes');
select throws_ok(
  $$select * from public.service_dashboard_team((select id from ctx))$$,
  '42501', 'not_authorized', 'someone on no team cannot read who is serving');
select throws_ok(
  $$select public.save_service_note((select id from ctx), 'Mine')$$,
  '42501', 'not_authorized', 'someone on no team cannot save notes');
reset role;

select * from finish();
rollback;
