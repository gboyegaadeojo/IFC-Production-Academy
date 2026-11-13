-- After G tried approvals (2026-11-13): a request is linked to its day's service, late requests are
-- refused by default, and the email job is asked for at most once a minute.
begin;
select no_plan();

create function pg_temp.act_as_visitor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

update public.feature_flags set enabled = true where key = 'copyright';
select is((select late_policy from public.copyright_settings limit 1), 'block', 'late requests are refused by default');

insert into public.events (id, organization_id, title, starts_at, ends_at) values
  ('a9400000-0000-4000-8000-0000000000e1', (select id from public.organizations order by created_at limit 1),
   'Fake Dated Service', ((current_date + 10)::timestamp + interval '15 hours') at time zone 'UTC',
   ((current_date + 10)::timestamp + interval '17 hours') at time zone 'UTC');

select pg_temp.act_as_visitor();
select throws_ok(
  $$ select public.submit_copyright_request('Sam', 'Test', 'sam.dated@example.com', 'video',
       'https://example.com/v', null, null, current_date + 1, 'Too soon', '') $$,
  'P0001', 'too_late', 'a request without enough notice is refused');
select lives_ok(
  $$ select public.submit_copyright_request('Sam', 'Test', 'sam.dated@example.com', 'video',
       'https://example.com/v', null, null, current_date + 10, 'Dated request', '') $$,
  'a request with enough notice is sent with a date only');
select is(public.copyright_kick_emails(), true, 'the email job is asked for straight away');
select is(public.copyright_kick_emails(), false, 'but not again within a minute');
reset role;

select is((select event_id from public.copyright_requests where description = 'Dated request'),
  'a9400000-0000-4000-8000-0000000000e1'::uuid, 'and the request is linked to that day''s service');

select * from finish();
rollback;
