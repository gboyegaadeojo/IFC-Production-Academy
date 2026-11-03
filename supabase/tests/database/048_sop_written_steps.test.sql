-- SOPs written in the app: a version needs steps or a file, and published steps never change.
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

--   Leader     a6100000-0000-4000-8000-000000000001  (Camera)
--   Other      a6100000-0000-4000-8000-000000000002  (Audio leader)
--   Volunteer  a6100000-0000-4000-8000-000000000003
select pg_temp.new_user('a6100000-0000-4000-8000-000000000001', 'Test Camera Leader');
select pg_temp.new_user('a6100000-0000-4000-8000-000000000002', 'Test Audio Leader');
select pg_temp.new_user('a6100000-0000-4000-8000-000000000003', 'Test Volunteer');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a6100000-0000-4000-8000-000000000001', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('a6100000-0000-4000-8000-000000000002', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73');

create temporary table ctx (key text primary key, id uuid, path text);
grant all on ctx to authenticated;

select pg_temp.act_as('a6100000-0000-4000-8000-000000000001');
insert into ctx (key, id) values ('sop', public.create_sop('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake written SOP'));
insert into ctx (key, id) values ('v1', (select id from public.sop_versions where sop_id = (select id from ctx where key = 'sop')));
select throws_ok(
  $$ select public.publish_sop_version((select id from ctx where key = 'v1'), 'First') $$,
  'P0001', 'sop_has_no_file', 'an SOP with neither steps nor a file cannot be published');
update public.sop_versions set body = '   ' where id = (select id from ctx where key = 'v1');
select throws_ok(
  $$ select public.publish_sop_version((select id from ctx where key = 'v1'), 'First') $$,
  'P0001', 'sop_has_no_file', 'blank steps do not count');
update public.sop_versions set body = '1. Fake first step' where id = (select id from ctx where key = 'v1');
reset role;

-- A draft's steps stay with the people who manage it.
select pg_temp.act_as('a6100000-0000-4000-8000-000000000003');
select is_empty($$ select 1 from public.sop_versions where id = (select id from ctx where key = 'v1') $$,
  'a volunteer cannot read a draft''s steps');
reset role;
select pg_temp.act_as('a6100000-0000-4000-8000-000000000002');
update public.sop_versions set body = 'Changed by someone else' where id = (select id from ctx where key = 'v1');
reset role;
select is((select body from public.sop_versions where id = (select id from ctx where key = 'v1')), '1. Fake first step',
  'another department''s leader cannot change the steps');

select pg_temp.act_as('a6100000-0000-4000-8000-000000000001');
select is(public.publish_sop_version((select id from ctx where key = 'v1'), 'First version'), 1,
  'written steps alone can be published');
select is((select file_path from public.sop_versions where id = (select id from ctx where key = 'v1')), null,
  'with no file');
update public.sop_versions set body = 'Changed after publishing' where id = (select id from ctx where key = 'v1');
reset role;
select is((select body from public.sop_versions where id = (select id from ctx where key = 'v1')), '1. Fake first step',
  'published steps never change (SRS-SOP-002)');

select pg_temp.act_as('a6100000-0000-4000-8000-000000000003');
select is((select body from public.sop_versions where id = (select id from ctx where key = 'v1')), '1. Fake first step',
  'a volunteer reads the published steps');
reset role;

-- A new draft starts from the current steps, and can add or take away a file.
select pg_temp.act_as('a6100000-0000-4000-8000-000000000001');
insert into ctx (key, id) values ('v2', public.start_sop_draft((select id from ctx where key = 'sop')));
select is((select body from public.sop_versions where id = (select id from ctx where key = 'v2')), '1. Fake first step',
  'a new draft starts with the current steps');
insert into ctx (key, path) values
  ('path', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855/' || (select id from ctx where key = 'sop') || '/11111111-1111-4111-8111-111111111111.pdf');
update public.sop_versions
   set file_path = (select path from ctx where key = 'path'), file_name = 'Diagram.pdf', file_size = 100, file_type = 'application/pdf'
 where id = (select id from ctx where key = 'v2');
select is((select file_name from public.sop_versions where id = (select id from ctx where key = 'v2')), 'Diagram.pdf',
  'a draft can have steps and a file together');
update public.sop_versions set file_path = null, file_name = null, file_size = null, file_type = null
 where id = (select id from ctx where key = 'v2');
select is((select file_path from public.sop_versions where id = (select id from ctx where key = 'v2')), null,
  'and can remove the file');
update public.sop_versions set body = '' where id = (select id from ctx where key = 'v2');
select throws_ok(
  $$ select public.publish_sop_version((select id from ctx where key = 'v2'), 'Emptied') $$,
  'P0001', 'sop_has_no_file', 'a later version still needs steps or a file');
update public.sop_versions set body = '1. Fake better step' where id = (select id from ctx where key = 'v2');
select is(public.publish_sop_version((select id from ctx where key = 'v2'), 'Better'), 2, 'version 2 is published');
select is((select status::text from public.sop_versions where id = (select id from ctx where key = 'v1')), 'superseded',
  'version 1 is kept as superseded');
select is((select body from public.sop_versions where id = (select id from ctx where key = 'v1')), '1. Fake first step',
  'with its words unchanged');
reset role;

-- The database refuses a published version with nothing in it, however it's written.
select throws_ok(
  $$ insert into public.sop_versions (sop_id, department_id, title, status, version_number, published_at)
     values ((select id from ctx where key = 'sop'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Empty', 'superseded', 99, now()) $$,
  '23514', null, 'a published version needs steps or a file');
select throws_ok(
  $$ update public.sop_versions set body = repeat('x', 50001) where id = (select id from ctx where key = 'v1') $$,
  '23514', null, 'steps have a length limit');

select * from finish();
rollback;
