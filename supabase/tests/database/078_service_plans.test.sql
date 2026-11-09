-- The order of service and plan templates (plan "Academy scheduling", PR 6).
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_email, jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

update public.organizations set scheduling_source = 'academy';

-- Test people (all fake):
--   Lead   a7800000-0000-4000-8000-000000000001  (Scheduling Administrator)
--   Ada    a7800000-0000-4000-8000-000000000002  volunteer
select pg_temp.new_user('a7800000-0000-4000-8000-000000000001', 'Test Plan Lead', 'lead.plan@example.com');
select pg_temp.new_user('a7800000-0000-4000-8000-000000000002', 'Test Ada Plan', 'ada.plan@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7800000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- Templates.
select pg_temp.act_as('a7800000-0000-4000-8000-000000000001');
insert into ctx values ('standard', public.save_plan_template(null, 'Fake Standard Sunday', $$[
  {"kind": "header", "title": "Worship", "length_seconds": 0, "notes": []},
  {"kind": "song", "title": "Opening song", "length_seconds": 270,
   "notes": [{"category": "Camera Operations", "content": "Cam 2 roams the band"}]},
  {"kind": "item", "title": "Sermon", "length_seconds": 2100, "notes": []}
]$$::jsonb));
insert into ctx values ('communion', public.save_plan_template(null, 'Fake Communion Sunday', $$[
  {"kind": "item", "title": "Communion and reflection", "length_seconds": 900, "notes": []}
]$$::jsonb));
select throws_ok(
  $$ select public.save_plan_template(null, 'fake standard sunday', '[]'::jsonb) $$,
  'P0001', 'name_taken', 'template names are unique, ignoring capitals');
select throws_ok(
  $$ select public.save_plan_template(null, 'Fake bad', '[{"kind": "item", "title": " ", "length_seconds": 60}]'::jsonb) $$,
  '22023', 'invalid_plan', 'every item needs a title');
select throws_ok(
  $$ select public.save_plan_template(null, 'Fake bad', '[{"kind": "dance", "title": "Hi", "length_seconds": 60}]'::jsonb) $$,
  '22023', 'invalid_plan', 'only items, songs, and headers');

-- A service type whose usual plan is the standard one.
insert into ctx values ('type', public.save_service_type(null, 'Fake Plan Sunday', '10:30', 90, '', ''));
select lives_ok($$ select public.set_service_type_template((select id from ctx where key = 'type'),
  (select id from ctx where key = 'standard')) $$, 'a scheduler sets a service type''s usual plan');

-- Made from the type: starts with its usual plan.
insert into ctx values ('usual', public.create_service((select id from ctx where key = 'type'), current_date + 20));
-- Made from the type with another plan.
insert into ctx values ('other', public.create_service((select id from ctx where key = 'type'), current_date + 27,
  (select id from ctx where key = 'communion')));
reset role;

select is(
  (select array_agg(title order by position) from public.service_plan_items
    where event_id = (select id from ctx where key = 'usual')),
  array['Worship', 'Opening song', 'Sermon'], 'a new service starts with its type''s usual plan');
select is(
  (select notes from public.service_plan_items
    where event_id = (select id from ctx where key = 'usual') and title = 'Opening song'),
  '[{"category": "Camera Operations", "content": "Cam 2 roams the band"}]'::jsonb,
  'with its department notes');
select is(
  (select array_agg(title order by position) from public.service_plan_items
    where event_id = (select id from ctx where key = 'other')),
  array['Communion and reflection'], 'or with any plan chosen for it');

-- Editing a service's order keeps items that stay, by id.
select pg_temp.act_as('a7800000-0000-4000-8000-000000000001');
create temporary table kept (external_id text);
insert into kept select external_id from public.service_plan_items
  where event_id = (select id from ctx where key = 'usual') and title = 'Sermon';
select is(
  public.save_service_plan((select id from ctx where key = 'usual'), jsonb_build_array(
    jsonb_build_object('id', (select external_id from kept), 'kind', 'item', 'title', 'Sermon',
                       'length_seconds', 1800, 'notes', '[]'::jsonb),
    jsonb_build_object('id', null, 'kind', 'item', 'title', 'Baptism', 'length_seconds', 600,
                       'notes', '[]'::jsonb))),
  2, 'a scheduler saves a new order');
reset role;
select is(
  (select array_agg(title || ':' || length_seconds order by position) from public.service_plan_items
    where event_id = (select id from ctx where key = 'usual')),
  array['Sermon:1800', 'Baptism:600'], 'the order and lengths are saved; removed items are gone');
select is(
  (select external_id from public.service_plan_items
    where event_id = (select id from ctx where key = 'usual') and title = 'Sermon'),
  (select external_id from kept), 'an item that stays keeps its id');

-- Changing the template later doesn't change services already planned.
select pg_temp.act_as('a7800000-0000-4000-8000-000000000001');
select public.save_plan_template((select id from ctx where key = 'communion'), 'Fake Communion Sunday',
  '[{"kind": "item", "title": "Changed", "length_seconds": 60, "notes": []}]'::jsonb);
reset role;
select is(
  (select array_agg(title) from public.service_plan_items where event_id = (select id from ctx where key = 'other')),
  array['Communion and reflection'], 'editing a template leaves planned services alone');

-- Times.
select pg_temp.act_as('a7800000-0000-4000-8000-000000000001');
select is(
  public.save_event_times((select id from ctx where key = 'usual'), jsonb_build_array(jsonb_build_object(
    'kind', 'rehearsal', 'label', '',
    'starts_at', (select starts_at - interval '2 hours' from public.events where id = (select id from ctx where key = 'usual')),
    'ends_at', (select starts_at - interval '1 hour' from public.events where id = (select id from ctx where key = 'usual'))))),
  1, 'a rehearsal is added');
select throws_ok(
  $$ select public.save_event_times((select id from ctx where key = 'usual'), jsonb_build_array(jsonb_build_object(
       'kind', 'rehearsal', 'label', '', 'starts_at', now() + interval '2 days', 'ends_at', now() + interval '1 day'))) $$,
  '22023', 'invalid_times', 'a time ends after it starts');
reset role;

-- Volunteers can't plan, and can't read templates; they can read the times.
select pg_temp.act_as('a7800000-0000-4000-8000-000000000002');
select throws_ok($$ select public.save_service_plan((select id from ctx where key = 'usual'), '[]'::jsonb) $$,
  '42501', 'not_authorized', 'volunteers cannot change the order of service');
select is_empty($$ select 1 from public.plan_templates $$, 'volunteers don''t see plan templates');
select is((select count(*)::int from public.event_times), 1, 'volunteers see a service''s times');
reset role;

-- While Planning Center schedules, nothing here changes.
update public.organizations set scheduling_source = 'planning_center';
select pg_temp.act_as('a7800000-0000-4000-8000-000000000001');
select throws_ok($$ select public.save_service_plan((select id from ctx where key = 'usual'), '[]'::jsonb) $$,
  'P0001', 'managed_in_planning_center', 'the order of service is planned in Planning Center then');
select throws_ok($$ select public.save_plan_template(null, 'Fake while PCO', '[]'::jsonb) $$,
  'P0001', 'managed_in_planning_center', 'and templates are left alone');
reset role;

-- Archiving a template takes it off the service type.
update public.organizations set scheduling_source = 'academy';
select pg_temp.act_as('a7800000-0000-4000-8000-000000000001');
select public.archive_plan_template((select id from ctx where key = 'standard'));
reset role;
select is((select default_template_id from public.service_types where id = (select id from ctx where key = 'type')),
  null, 'an archived template is no longer a type''s usual plan');

select * from finish();
rollback;
