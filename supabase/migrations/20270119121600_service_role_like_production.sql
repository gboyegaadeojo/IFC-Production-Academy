-- Every environment gives the service role what production does: no direct reads or writes on
-- tables (health check, 2026-11-10).
--
-- Production's Supabase project grants the service role only TRUNCATE, REFERENCES and TRIGGER on
-- new tables, so scheduled jobs and server code reach data through security definer functions.
-- The local and CI database still used the older default and granted it everything, so a job that
-- read a table directly passed every test and failed only in production (the Planning Center sync,
-- 2026-11-09, fixed in #237). This changes nothing in production, where no table grants the service
-- role SELECT, INSERT, UPDATE or DELETE; it makes CI fail the same way production would.

revoke select, insert, update, delete on all tables in schema public from service_role;
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from service_role;
