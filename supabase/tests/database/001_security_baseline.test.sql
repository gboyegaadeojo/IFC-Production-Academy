-- Deny by default (SRS-RBAC-004): RLS on every table, nothing granted to anon.
begin;
select no_plan();

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  $$,
  'every table in public has row-level security enabled'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and (
        has_table_privilege('anon', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
      )
  $$,
  'anon has no privileges on any table in public'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'DELETE')
  $$,
  'signed-in users cannot delete rows from any table'
);

select is_empty(
  $$
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      -- The keep-alive read, the public certificate check behind the QR code (initials only), and
      -- the public "I want to serve" form (onboarding decision, 2026-11-01; it reveals nothing).
      and p.proname not in ('keepalive', 'check_certificate', 'submit_interest')
      -- Ignore functions owned by extensions such as pgTAP itself.
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  $$,
  'anon can execute only the keep-alive function, the certificate check and the interest form'
);

set local role anon;
select throws_ok(
  $$ select * from public.departments $$,
  '42501',
  null,
  'anon cannot read departments'
);
select throws_ok(
  $$ select public.request_membership('b7ba9dae-cab5-43e0-a996-8ae9d2436855') $$,
  '42501',
  null,
  'anon cannot request membership'
);
select isnt(public.keepalive(), null, 'anon can call the keep-alive read');
reset role;

select * from finish();
rollback;
