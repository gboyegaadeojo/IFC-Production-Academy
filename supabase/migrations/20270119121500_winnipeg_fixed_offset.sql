-- Winnipeg time as a fixed UTC−5 in every database function (G, 2026-11-10).
--
-- Manitoba stopped turning its clocks back on 2026-11-01 and stays at UTC−5 all year (IANA tz
-- 2026e). Supabase's Postgres still has the old rule, so `at time zone 'America/Winnipeg'` gave
-- UTC−6: reminder times, notification text, and day boundaries were an hour early. 'Etc/GMT+5' is
-- UTC−5 (the sign is reversed in these names) and needs no time zone update. Every record dates from
-- October 2026 or later, when Winnipeg was already at UTC−5, so no stored time moves. The app does
-- the same (lib/domain/time-zone.ts).
--
-- Each function that names the old zone is recreated from its own current definition with only the
-- name swapped. create or replace keeps its owner, grants, and settings. A function changed later
-- must say 'Etc/GMT+5'; lib/domain/time-zone.test.ts fails on a new migration that says
-- 'America/Winnipeg'.

do $$
declare
  f record;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and p.prosrc like '%America/Winnipeg%'
  loop
    execute replace(pg_get_functiondef(f.oid), 'America/Winnipeg', 'Etc/GMT+5');
  end loop;
end;
$$;

alter table public.organizations alter column time_zone set default 'Etc/GMT+5';
update public.organizations set time_zone = 'Etc/GMT+5' where time_zone = 'America/Winnipeg';
