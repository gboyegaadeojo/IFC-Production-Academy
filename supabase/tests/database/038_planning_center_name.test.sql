-- Linking Planning Center replaces a made-up sign-up name with the Planning Center name, but never
-- a name the person chose.
begin;
select no_plan();

-- Test people (fake): Ana (email default name) ae…01; Ben (chose a name) ae…02.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana.test@example.com', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ben.test@example.com', '{"full_name": "Benny Chosen"}', now(), now());
insert into public.pco_people (id, organization_id, display_name, seen_at)
select x.id, o.id, x.name, now()
from (select id from public.organizations order by created_at limit 1) o,
     (values ('p-ana', 'Ana Example'), ('p-ben', 'Ben Example')) as x (id, name);

select is((select display_name from public.profiles where id = 'ae000000-0000-4000-8000-000000000001'), 'ana.test',
  'an email sign-up starts with the part before the @');

update public.profiles set pco_person_id = 'p-ana' where id = 'ae000000-0000-4000-8000-000000000001';
select is((select display_name from public.profiles where id = 'ae000000-0000-4000-8000-000000000001'), 'Ana Example',
  'linking Planning Center gives them their Planning Center name');

update public.profiles set pco_person_id = 'p-ben' where id = 'ae000000-0000-4000-8000-000000000002';
select is((select display_name from public.profiles where id = 'ae000000-0000-4000-8000-000000000002'), 'Benny Chosen',
  'a name they chose is kept');

select ok(private.is_default_display_name('New volunteer', 'x@example.com'), 'the placeholder name counts as made up');
select ok(not private.is_default_display_name('Sam Example', 'sam@example.com'), 'a real name does not');

select * from finish();
rollback;
