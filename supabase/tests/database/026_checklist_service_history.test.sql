-- Service history (checklist app US-07b): the record, frozen when the day ends.
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
--   Leader      a8000000-0000-4000-8000-000000000001  (Department Leader, Camera: checklist.manage)
--   Volunteer   a8000000-0000-4000-8000-000000000002
select pg_temp.new_user('a8000000-0000-4000-8000-000000000001', 'Test History Leader');
select pg_temp.new_user('a8000000-0000-4000-8000-000000000002', 'Test History Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8000000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated;

-- Records start a week ago; a service two days ago, whose day has ended.
update public.organizations set checklist_records_since = now() - interval '7 days';
insert into public.events (title, starts_at, ends_at)
  values ('Fake past service', now() - interval '2 days', now() - interval '2 days' + interval '2 hours');
insert into ctx values ('event', (select id from public.events where title = 'Fake past service'));

-- A checklist made a week ago: one task stays, one is hidden during the service's day, one is
-- added after the day ended (not on that service's checklist).
insert into public.checklists (department_id, name, created_at)
  values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake History List', now() - interval '7 days');
insert into ctx values ('list', (select id from public.checklists where name = 'Fake History List'));
insert into public.checklist_sections (checklist_id, name, sort_order, created_at)
  values ((select id from ctx where key = 'list'), 'Setup', 10, now() - interval '7 days');
insert into ctx values ('section', (select id from public.checklist_sections where checklist_id = (select id from ctx where key = 'list')));
insert into public.checklist_items (section_id, text, sort_order, created_at) values
  ((select id from ctx where key = 'section'), 'Fake kept', 10, now() - interval '7 days'),
  ((select id from ctx where key = 'section'), 'Fake untouched', 20, now() - interval '7 days'),
  ((select id from ctx where key = 'section'), 'Fake hidden', 30, now() - interval '7 days'),
  ((select id from ctx where key = 'section'), 'Fake added later', 40, now());
insert into ctx values
  ('kept', (select id from public.checklist_items where text = 'Fake kept')),
  ('hidden', (select id from public.checklist_items where text = 'Fake hidden'));
update public.checklist_items set archived_at = (select day_start from private.service_day_bounds((select id from ctx where key = 'event'))) + interval '1 minute'
 where id = (select id from ctx where key = 'hidden');
insert into public.checklist_checkoffs (event_id, item_id, checklist_id, item_text, section_name, checklist_name, checked_by, checked_at)
values ((select id from ctx where key = 'event'), (select id from ctx where key = 'kept'), (select id from ctx where key = 'list'),
        'Fake kept (as ticked)', 'Setup', 'Fake History List', 'a8000000-0000-4000-8000-000000000001', now() - interval '2 days');

-- Volunteers can't read history.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.checklist_history(10) $$, '42501', 'not_authorized',
  'volunteers cannot read service history');
reset role;

-- The scheduled job freezes the record.
select ok(public.freeze_service_checklist_records() >= 1, 'services whose day has ended are frozen');
select ok(
  (select checklist_recorded_at is not null from public.events where id = (select id from ctx where key = 'event')),
  'and marked as recorded'
);

-- Later edits never change it.
update public.checklist_items set text = 'Fake kept, renamed later' where id = (select id from ctx where key = 'kept');
update public.checklist_items set archived_at = now() where text = 'Fake untouched';

select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select is(
  (select done || ' of ' || total from public.checklist_history(50) where event_id = (select id from ctx where key = 'event')),
  '1 of 2', 'X of Y done counts the tasks on the checklist, not those removed during the service'
);
select is(
  (select array_agg(item_text order by item_text) from public.service_checklist_record((select id from ctx where key = 'event'))
    where removed_at is null),
  array['Fake kept', 'Fake untouched'], 'the record keeps the tasks as they were when the day ended'
);
select is(
  (select item_text from public.service_checklist_record((select id from ctx where key = 'event')) where removed_at is not null),
  'Fake hidden', 'tasks hidden during the service are listed separately'
);
select is(
  (select checked_text || ' / ' || checked_by_name from public.service_checklist_record((select id from ctx where key = 'event'))
    where item_id = (select id from ctx where key = 'kept')),
  'Fake kept (as ticked) / Test History Leader', 'a ticked task shows the text it was ticked under, and who'
);
reset role;

select * from finish();
rollback;
