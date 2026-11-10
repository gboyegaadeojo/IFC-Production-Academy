-- Health check, 2026-11-10. Two ways a function passed every test and failed only in production:
-- 1. PostgREST runs stable and immutable functions in a read-only transaction, so one that locks or
--    changes rows (itself or through what it calls) fails there with HTTP 405 (#239).
-- 2. Production gives the service role no direct access to tables (#237); see 086 and the
--    service_role_like_production migration.
begin;
select no_plan();

create temporary table read_only_writers as
with recursive fns as (
  select p.oid, n.nspname, p.proname, p.provolatile, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
),
writes as (
  select oid from fns
  where prosrc ~* '\m(insert\s+into|update\s+[a-z_."]+\s+set|delete\s+from|for\s+(update|share|no\s+key\s+update|key\s+share)|perform\s+pg_advisory|nextval\s*\()'
),
calls as (
  select a.oid as caller, b.oid as callee
  from fns a join fns b on a.oid <> b.oid
   and a.prosrc ~* ('\m' || b.nspname || '\.' || b.proname || '\s*\(')
),
tainted(oid) as (
  select oid from writes
  union
  select c.caller from calls c join tainted t on t.oid = c.callee
)
select f.proname::text as name
from fns f join tainted t on t.oid = f.oid
where f.nspname = 'public' and f.provolatile in ('s', 'i');

select is(
  (select coalesce(string_agg(name, ', ' order by name), 'none') from read_only_writers),
  'none',
  'no stable or immutable API function locks or changes rows');

select ok(
  not exists (
    select 1 from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
      and (has_table_privilege('service_role', c.oid, 'SELECT')
        or has_table_privilege('service_role', c.oid, 'INSERT')
        or has_table_privilege('service_role', c.oid, 'UPDATE')
        or has_table_privilege('service_role', c.oid, 'DELETE'))),
  'the service role reaches tables only through functions, as in production');

select * from finish();
rollback;
