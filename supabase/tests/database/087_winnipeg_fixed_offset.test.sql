-- Winnipeg time is a fixed UTC−5 in the database (Manitoba's permanent daylight time, 2026-11-01),
-- whatever time zone data Postgres has.
begin;
select no_plan();

select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosrc like '%America/Winnipeg%'),
  0,
  'no function uses the old Winnipeg rule');

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosrc like '%Etc/GMT+5%') >= 20,
  'the functions that use Winnipeg time use UTC−5');

select is(
  ('2026-12-06 15:00:00+00'::timestamptz at time zone 'Etc/GMT+5')::text,
  '2026-12-06 10:00:00',
  '15:00 UTC on a December Sunday is 10:00 a.m. in Winnipeg');

select is(
  (select time_zone from public.organizations order by created_at limit 1),
  'Etc/GMT+5',
  'the organisation records the same zone');

select * from finish();
rollback;
