-- Which way a notification travels, and the new events.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

--   No device             ab000000-0000-4000-8000-000000000001
--   Phone alerts on       ab000000-0000-4000-8000-000000000002
--   Mentor                ab000000-0000-4000-8000-000000000003
--   Mentee                ab000000-0000-4000-8000-000000000004
--   Department leader     ab000000-0000-4000-8000-000000000005
--   Asks to join          ab000000-0000-4000-8000-000000000006
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('ab000000-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'routes-' || n || '@example.com',
       jsonb_build_object('display_name', 'Fake Person ' || n), now(), now()
from generate_series(1, 6) n;

-- Go live for this test, so the routing shows behind the launch switch.
update public.organizations set notifications_live = true;

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label) values
  ('ab000000-0000-4000-8000-000000000002', 'https://push.example.net/send/fake-route', repeat('B', 87), repeat('C', 22), 'iPhone');

create function pg_temp.send(p_user text, p_kind public.notification_kind, p_key text)
returns void language sql as $f$
  select private.notify(p_user::uuid, p_kind, 'Fake', 'Fake', '/home', p_key);
$f$;
create function pg_temp.status_of(p_key text) returns text language sql as $f$
  select email_status::text || '/' || push_status from public.notifications where dedupe_key = p_key;
$f$;

-- Someone without phone alerts gets email; someone with them gets the alert only.
select pg_temp.send('ab000000-0000-4000-8000-000000000001', 'course_assigned', 'r-none');
select is(pg_temp.status_of('r-none'), 'pending/none', 'no phone: email only');
select pg_temp.send('ab000000-0000-4000-8000-000000000002', 'course_assigned', 'r-phone');
select is(pg_temp.status_of('r-phone'), 'skipped/pending', 'phone on: the alert, and no routine email');

-- A changed service comes both ways.
select pg_temp.send('ab000000-0000-4000-8000-000000000002', 'service_changed', 'r-changed');
select is(pg_temp.status_of('r-changed'), 'pending/pending', 'a changed service comes by alert and email');

-- Low-priority news stays in the app.
select pg_temp.send('ab000000-0000-4000-8000-000000000002', 'new_course', 'r-new');
select is(pg_temp.status_of('r-new'), 'skipped/none', 'a new course stays in the app');
select pg_temp.send('ab000000-0000-4000-8000-000000000001', 'certificate_ready', 'r-cert');
select is(pg_temp.status_of('r-cert'), 'skipped/none', 'a certificate stays in the app, even with no phone');
select pg_temp.send('ab000000-0000-4000-8000-000000000001', 'sop_updated', 'r-sop');
select is(pg_temp.status_of('r-sop'), 'skipped/none', 'an updated SOP stays in the app');

-- Turning a kind off for the phone means email can carry it instead, so nothing is lost.
select pg_temp.act_as('ab000000-0000-4000-8000-000000000002');
select public.set_notification_push('mentor_note', false);
select is(
  (select push from public.notification_preferences where kind = 'mentor_note'),
  false, 'someone chooses by kind what reaches their phone');
reset role;
select pg_temp.send('ab000000-0000-4000-8000-000000000002', 'mentor_note', 'r-off');
select is(pg_temp.status_of('r-off'), 'pending/none', 'turned off for the phone: email instead');

-- The launch switch still wins.
update public.organizations set notifications_live = false;
select pg_temp.send('ab000000-0000-4000-8000-000000000002', 'service_changed', 'r-held');
select is(pg_temp.status_of('r-held'), 'skipped/none', 'before launch nothing leaves the app');
update public.organizations set notifications_live = true;

-- Someone asks to join: those who can approve hear, and the person doesn't.
create temporary table ctx on commit drop as
select (select id from public.departments where kind = 'team' order by sort_order limit 1) as department_id;
grant select on ctx to authenticated;
insert into public.user_roles (user_id, role_id, department_id)
select 'ab000000-0000-4000-8000-000000000005', r.id, (select department_id from ctx)
from public.roles r where r.key = 'department_leader';
insert into public.department_memberships (user_id, department_id, status)
select 'ab000000-0000-4000-8000-000000000006', department_id, 'requested' from ctx;
select is(
  (select count(*)::int from public.notifications
   where user_id = 'ab000000-0000-4000-8000-000000000005' and kind = 'join_requested'),
  1, 'the department''s leader hears about a join request');
select is_empty(
  $$ select 1 from public.notifications
     where user_id = 'ab000000-0000-4000-8000-000000000006' and kind = 'join_requested' $$,
  'the person asking doesn''t');

-- A service moved or cancelled, to everyone on it.
insert into public.serving_roles (department_id, name) select department_id, 'Fake routed role' from ctx;
insert into public.events (title, starts_at, ends_at)
values ('Fake moved service', now() + interval '5 days', now() + interval '5 days 2 hours');
insert into public.event_positions (event_id, department_id, role_id)
select e.id, (select department_id from ctx), r.id
from public.events e, public.serving_roles r
where e.title = 'Fake moved service' and r.name = 'Fake routed role';
insert into public.event_assignments (position_id, event_id, department_id, role_id, user_id, status, readiness, assigned_by)
select ep.id, ep.event_id, ep.department_id, ep.role_id, 'ab000000-0000-4000-8000-000000000001', 'confirmed',
       private.readiness_for('ab000000-0000-4000-8000-000000000001', ep.role_id), null
from public.event_positions ep
join public.events e on e.id = ep.event_id
where e.title = 'Fake moved service';

update public.events set title = 'Fake moved service' where title = 'Fake moved service';
select is_empty(
  $$ select 1 from public.notifications
     where user_id = 'ab000000-0000-4000-8000-000000000001' and kind = 'service_changed' $$,
  'an edit that doesn''t move it says nothing');
update public.events set starts_at = starts_at + interval '1 hour' where title = 'Fake moved service';
select is(
  (select title from public.notifications
   where user_id = 'ab000000-0000-4000-8000-000000000001' and kind = 'service_changed'),
  'Service moved: Fake moved service', 'moving a service tells the people on it');
update public.events set cancelled_at = now() where title = 'Fake moved service';
select is(
  (select count(*)::int from public.notifications
   where user_id = 'ab000000-0000-4000-8000-000000000001' and kind = 'service_changed'
     and title = 'Service cancelled: Fake moved service'),
  1, 'cancelling a service tells them too');

-- Mentoring: a shared note tells the other person, without its words. A private note tells nobody.
insert into public.mentor_relationships (mentor_id, mentee_id, department_id)
select 'ab000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000004', department_id from ctx;
insert into public.mentoring_notes (relationship_id, author_id, visibility, body)
select id, 'ab000000-0000-4000-8000-000000000003', 'shared', 'Fake secret words'
from public.mentor_relationships where mentor_id = 'ab000000-0000-4000-8000-000000000003';
select is(
  (select count(*)::int from public.notifications
   where user_id = 'ab000000-0000-4000-8000-000000000004' and kind = 'mentor_note'),
  1, 'a shared note tells the other person');
select is_empty(
  $$ select 1 from public.notifications where body like '%Fake secret words%' or title like '%Fake secret words%' $$,
  'the note''s words never go in the notification');
select is_empty(
  $$ select 1 from public.notifications
     where user_id = 'ab000000-0000-4000-8000-000000000003' and kind = 'mentor_note' $$,
  'the author isn''t told about their own note');
delete from public.notifications where kind = 'mentor_note' and user_id = 'ab000000-0000-4000-8000-000000000004';
insert into public.mentoring_notes (relationship_id, author_id, visibility, body)
select id, 'ab000000-0000-4000-8000-000000000003', 'private', 'Fake private words'
from public.mentor_relationships where mentor_id = 'ab000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select 1 from public.notifications where kind = 'mentor_note' and user_id = 'ab000000-0000-4000-8000-000000000004' $$,
  'a private note tells nobody');

-- Only the job runs the queue.
select pg_temp.act_as('ab000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.queue_cover_reminders() $$, '42501', null, 'a volunteer can''t run the queue');
reset role;
select lives_ok($$ select public.queue_cover_reminders() $$, 'the job can');

select * from finish();
rollback;
