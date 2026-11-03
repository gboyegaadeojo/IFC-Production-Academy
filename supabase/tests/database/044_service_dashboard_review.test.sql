-- Service Dashboard, stage 5 (ADD-DASH-10): After the service.
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
--   Teammate   a9000000-0000-4000-8000-000000000001  (on a serving team)
--   Outsider   a9000000-0000-4000-8000-000000000002  (signed in, on no team)
select pg_temp.new_user('a9000000-0000-4000-8000-000000000001', 'Test Review Teammate');
select pg_temp.new_user('a9000000-0000-4000-8000-000000000002', 'Test Review Outsider');
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a9000000-0000-4000-8000-000000000001', 'active', now());
insert into public.serving_roles (department_id, name) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake Review Cam');
insert into public.serving_team_members (role_id, department_id, user_id)
select id, 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'a9000000-0000-4000-8000-000000000001'
from public.serving_roles where name = 'Fake Review Cam';

insert into public.events (organization_id, title, starts_at, ends_at, source, external_id)
select id, 'Fake past service', now() - interval '3 hours', now() - interval '1 hour',
       'planning_center', 'fake-review-plan'
from public.organizations limit 1;
create temporary table ctx (id uuid);
grant all on ctx to authenticated;
insert into ctx select id from public.events where external_id = 'fake-review-plan';

select is(
  public.sync_service_plan_items($${"plans":[{"plan_id":"fake-review-plan","items":[
    {"id":"r1","position":1,"item_type":"song","title":"Timed","length_seconds":300,"service_position":"during","notes":[],"actual_seconds":318},
    {"id":"r2","position":2,"item_type":"item","title":"Not timed","length_seconds":60,"service_position":"during","notes":[],"actual_seconds":null}
  ]}]}$$::jsonb),
  '{"plans":1,"items":2}'::jsonb,
  'the job applies recorded times');
select is((select actual_seconds from public.service_plan_items where external_id = 'r1'), 318, 'a recorded time is kept');
select is((select actual_seconds from public.service_plan_items where external_id = 'r2'), null, 'an unrecorded time stays empty');

-- Viewer counts are gone; the live stream only needs the channel.
select hasnt_table('public', 'service_viewer_samples', 'viewer readings are no longer kept');
select pg_temp.act_as('a9000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.service_stream_channel()$$, 'a team member reads the stream channel');
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.service_stream_channel()$$,
  '42501', 'not_authorized', 'someone on no team cannot read the stream channel');
reset role;

select * from finish();
rollback;
