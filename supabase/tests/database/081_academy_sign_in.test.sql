-- Sign in with Planning Center while the Academy schedules (plan "Academy scheduling", PR 9).
begin;
select no_plan();

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

update public.organizations set pco_organization_id = 'org-academy-signin';

-- While Planning Center schedules: only people the sync has seen, as before.
update public.organizations set scheduling_source = 'planning_center';
select pg_temp.as_service();
select throws_ok(
  $$ select * from public.planning_center_sign_in('p-academy-new', 'org-academy-signin',
       array['new.academy.signin@example.com'], 'Fake New Person') $$,
  'P0001', 'not_in_planning_center', 'someone the sync hasn''t seen can''t sign in while Planning Center schedules');
reset role;

-- While the Academy schedules: anyone in the church's Planning Center organization.
update public.organizations set scheduling_source = 'academy';
select pg_temp.as_service();
select is(
  (select count(*)::int from public.planning_center_sign_in('p-academy-new', 'org-academy-signin',
     array['new.academy.signin@example.com'], 'Fake New Person')),
  0, 'someone new is accepted, and the app makes their account');
select throws_ok(
  $$ select * from public.planning_center_sign_in('p-academy-other', 'org-somewhere-else',
       array['other.academy.signin@example.com'], 'Fake Outsider') $$,
  'P0001', 'wrong_organization', 'never someone from another organization');
reset role;
select is((select display_name from public.pco_people where id = 'p-academy-new'), 'Fake New Person',
  'they''re recorded with their name');

-- Once the app has made their account, they're signed in to it, and linked.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'new.academy.signin@example.com', '{"full_name": "Fake New Person"}', now(), now());
select pg_temp.as_service();
select is(
  (select user_id from public.planning_center_sign_in('p-academy-new', 'org-academy-signin',
     array['new.academy.signin@example.com'], 'Fake New Person')),
  'a8100000-0000-4000-8000-000000000001'::uuid, 'and signed in to it');
reset role;
select is((select pco_person_id from public.profiles where id = 'a8100000-0000-4000-8000-000000000001'),
  'p-academy-new', 'their account is linked to their Planning Center person');

select * from finish();
rollback;
