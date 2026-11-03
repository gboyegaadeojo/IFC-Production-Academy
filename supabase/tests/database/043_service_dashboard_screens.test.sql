-- Service Dashboard, stage 3 (ADD-DASH-06, 07): the wall TV's pass, and viewer numbers.
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
create function pg_temp.as_visitor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Test people (all fake):
--   Manager    a8000000-0000-4000-8000-000000000001  (Platform Administrator)
--   Volunteer  a8000000-0000-4000-8000-000000000002  (on no team)
select pg_temp.new_user('a8000000-0000-4000-8000-000000000001', 'Test Screen Manager');
select pg_temp.new_user('a8000000-0000-4000-8000-000000000002', 'Test Screen Volunteer');
insert into public.user_roles (user_id, role_id)
select 'a8000000-0000-4000-8000-000000000001', r.id from public.roles r where r.key = 'platform_admin';

insert into public.events (organization_id, title, starts_at, ends_at)
select id, 'Fake screen service', now() + interval '1 hour', now() + interval '3 hours'
from public.organizations limit 1;

create temporary table ctx (key text primary key, value text);
grant all on ctx to anon, authenticated;
insert into ctx select 'event', id::text from public.events where title = 'Fake screen service';

-- A TV starts with no account at all.
select pg_temp.as_visitor();
insert into ctx select 'code', code from public.screen_start_pairing() limit 1;
reset role;
select pg_temp.as_visitor();
insert into ctx select 'secret', secret from public.screen_start_pairing() limit 1;
reset role;
-- Both calls made a code; use the second's own by reading its pairing back.
update ctx set value = (select p.code from public.display_pairings p
                        where p.secret_hash = private.screen_hash((select value from ctx where key = 'secret')))
 where key = 'code';

select pg_temp.as_visitor();
select is(
  public.screen_claim((select value from ctx where key = 'secret')) ->> 'status',
  'waiting', 'a code does nothing until someone approves it');
select is(
  public.screen_claim('not-the-secret') ->> 'status',
  'expired', 'a wrong secret gets nothing');
select is(public.screen_dashboard('not-a-pass'), null, 'a wrong pass shows nothing');
select throws_ok(
  $$select public.approve_screen((select value from ctx where key = 'code'), 'Mine')$$,
  '42501', null, 'a visitor cannot approve a screen');
select throws_ok(
  $$select count(*) from public.display_screens$$,
  '42501', null, 'a visitor cannot read screens');
select throws_ok(
  $$select count(*) from public.service_viewer_samples$$,
  '42501', null, 'a visitor cannot read viewer numbers directly');
select throws_ok(
  $$select public.service_stream_state((select value::uuid from ctx where key = 'event'), 'youtube')$$,
  '42501', 'not_authorized', 'a visitor with no pass gets no stream data');
reset role;

select pg_temp.act_as('a8000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.approve_screen((select value from ctx where key = 'code'), 'Mine')$$,
  '42501', 'not_authorized', 'a volunteer cannot approve a screen');
select throws_ok(
  $$select * from public.service_dashboard_screens()$$,
  '42501', 'not_authorized', 'a volunteer cannot list screens');
reset role;

select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.approve_screen('000', 'Booth')$$,
  'P0001', 'screen_code_not_found', 'a code that does not exist is refused');
select lives_ok(
  $$insert into ctx select 'screen', public.approve_screen(
      (select left(value, 3) || ' ' || right(value, 3) from ctx where key = 'code'), 'Booth wall TV')::text$$,
  'a manager approves a code, with a space typed in the middle');
select is(
  (select count(*)::int from public.service_dashboard_screens()), 1, 'the screen is listed');
select is(
  (select count(*)::int from public.audit_events where action = 'service_dashboard.screen_added'),
  1, 'adding a screen writes an audit event');
reset role;

select pg_temp.as_visitor();
insert into ctx select 'token', public.screen_claim((select value from ctx where key = 'secret')) ->> 'token';
select ok(
  (select value from ctx where key = 'token') is not null, 'the TV collects its pass');
select is(
  public.screen_claim((select value from ctx where key = 'secret')) ->> 'status',
  'expired', 'a pass is handed over only once');
select ok(
  public.screen_dashboard((select value from ctx where key = 'token')) ? 'items',
  'with a pass, the TV reads the dashboard');
select lives_ok(
  $$select public.save_viewer_sample((select value::uuid from ctx where key = 'event'), 'youtube', 42,
      (select value from ctx where key = 'token'))$$,
  'with a pass, the TV can record the viewer count');
select lives_ok(
  $$select public.save_viewer_sample((select value::uuid from ctx where key = 'event'), 'youtube', 99,
      (select value from ctx where key = 'token'))$$,
  'a second reading straight away is ignored, not an error');
select is(
  jsonb_array_length(public.service_stream_state(
    (select value::uuid from ctx where key = 'event'), 'youtube',
    (select value from ctx where key = 'token')) -> 'samples'),
  1, 'readings within 20 seconds count once');
select throws_ok(
  $$select public.save_viewer_sample((select value::uuid from ctx where key = 'event'), 'youtube', 5, 'wrong')$$,
  '42501', 'not_authorized', 'a wrong pass cannot record numbers');
select lives_ok(
  $$select public.save_stream_search((select value::uuid from ctx where key = 'event'), 'youtube', 'fakeVideoId',
      (select value from ctx where key = 'token'))$$,
  'with a pass, the TV can save which stream it found');
select lives_ok(
  $$select public.save_stream_search((select value::uuid from ctx where key = 'event'), 'youtube', null,
      (select value from ctx where key = 'token'))$$,
  'a later empty search keeps the stream already found');
select is(
  public.service_stream_state(
    (select value::uuid from ctx where key = 'event'), 'youtube',
    (select value from ctx where key = 'token')) ->> 'externalId',
  'fakeVideoId', 'the stream found is remembered');
reset role;

-- The pass is stored only as a hash.
select is(
  (select count(*)::int from public.display_screens
   where token_hash = convert_to((select value from ctx where key = 'token'), 'UTF8')),
  0, 'the pass itself is never stored');

-- Removing a screen ends its pass straight away.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.remove_screen((select value::uuid from ctx where key = 'screen'))$$,
  'a manager removes the screen');
select is(
  (select count(*)::int from public.audit_events where action = 'service_dashboard.screen_removed'),
  1, 'removing a screen writes an audit event');
reset role;
select pg_temp.as_visitor();
select is(
  public.screen_dashboard((select value from ctx where key = 'token')),
  null, 'a removed screen sees nothing');
reset role;

-- Connections.
select pg_temp.act_as('a8000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.set_youtube_channel('UCaaaaaaaaaaaaaaaaaaaaaa')$$,
  '42501', 'not_authorized', 'a volunteer cannot set the channel');
reset role;
select pg_temp.act_as('a8000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.set_youtube_channel('UCaaaaaaaaaaaaaaaaaaaaaa')$$,
  'a manager sets the channel');
select throws_ok(
  $$select public.set_youtube_channel('https://example.com/<script>')$$,
  '23514', null, 'anything that is not a channel id is refused');
select lives_ok($$select public.set_youtube_channel('')$$, 'the channel can be cleared');
reset role;

-- The code limit.
insert into public.display_pairings (code, secret_hash, expires_at)
select lpad(g::text, 6, '0'), private.screen_hash('fake-' || g), now() + interval '15 minutes'
from generate_series(100, 125) g;
select pg_temp.as_visitor();
select throws_ok(
  $$select * from public.screen_start_pairing()$$,
  'P0001', 'too_many_pairings', 'open codes are capped, so nobody can flood the table');
reset role;

select * from finish();
rollback;
