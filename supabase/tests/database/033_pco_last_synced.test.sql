-- Any active user can see when Planning Center was last read, and nothing more.
begin;
select no_plan();

create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Test person (fake): Jo  ae000000-0000-4000-8000-000000000001
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'jo.synced@example.com', '{"full_name": "Test Synced Jo"}', now(), now());
insert into public.pco_sync_runs (organization_id, finished_at, counts)
select id, '2026-11-01 12:00:00+00', '{}'::jsonb from public.organizations order by created_at limit 1;

select pg_temp.act_as('ae000000-0000-4000-8000-000000000001');
select is(public.pco_last_synced(), '2026-11-01 12:00:00+00'::timestamptz, 'a volunteer sees when Planning Center was last read');
select is((select count(*)::integer from public.pco_sync_runs), 0, 'but not the sync log');

reset role;
update public.profiles set status = 'suspended' where id = 'ae000000-0000-4000-8000-000000000001';
select pg_temp.act_as('ae000000-0000-4000-8000-000000000001');
select is(public.pco_last_synced(), null, 'a suspended account sees nothing');

select * from finish();
rollback;
