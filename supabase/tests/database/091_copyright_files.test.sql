-- Approval graphics (ADD-COPY-01, -10): a private bucket with no policies, so files open only
-- through links the server signs after these functions say the caller may see that request.
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_email, jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

select is((select public from storage.buckets where id = 'copyright'), false, 'the bucket is private');
select is((select file_size_limit from storage.buckets where id = 'copyright'), 20971520::bigint,
  'and takes files up to 20 MB');
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (qual like '%copyright%' or with_check like '%copyright%')),
  0, 'no storage policy opens it to anyone');

update public.feature_flags set enabled = true where key = 'copyright';
insert into public.copyright_requests (id, organization_id, first_name, email, kind, file_path, service_day, description)
values ('a9100000-0000-4000-8000-0000000000a1', (select id from public.organizations order by created_at limit 1),
        'Jo', 'jo.files@example.com', 'graphic', 'requests/a9100000-0000-4000-8000-0000000000f1/slide.png',
        current_date + 7, 'File test');

select pg_temp.new_user('a9100000-0000-4000-8000-000000000001', 'Test Files Admin', 'files.admin@example.com');
select pg_temp.new_user('a9100000-0000-4000-8000-000000000002', 'Test Files Volunteer', 'files.volunteer@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a9100000-0000-4000-8000-000000000001', (select id from public.roles where key = 'platform_admin' limit 1), null);

select is(public.copyright_qc_file('not-a-real-secret', 'a9100000-0000-4000-8000-0000000000a1'), null,
  'a made-up Quality control link gets no file');
select is(public.copyright_review_file('not-a-real-secret'), null, 'nor does a made-up review link');

select pg_temp.act_as('a9100000-0000-4000-8000-000000000002');
select is(public.copyright_member_file('a9100000-0000-4000-8000-0000000000a1'), null,
  'a volunteer not on duty gets no file');
reset role;
select pg_temp.act_as('a9100000-0000-4000-8000-000000000001');
select is(public.copyright_member_file('a9100000-0000-4000-8000-0000000000a1'),
  'requests/a9100000-0000-4000-8000-0000000000f1/slide.png', 'an admin does');
reset role;

select * from finish();
rollback;
