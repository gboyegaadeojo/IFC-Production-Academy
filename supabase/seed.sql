-- Local development seed: obviously fake people only (CLAUDE.md "Security rules").
-- Runs on `supabase db reset` and `supabase start`, never against the hosted project.
-- Departments, roles, and capabilities come from migrations.
--
-- Sign in locally with any address below via the magic link form, then open Mailpit
-- (http://127.0.0.1:54324) to click the link.

create function pg_temp.seed_user(p_id uuid, p_email text, p_name text)
returns uuid
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, '', now(),
    '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );
  return p_id;
end;
$$;

select pg_temp.seed_user('aaaaaaaa-0000-4000-8000-000000000001', 'avery.volunteer@example.com', 'Avery Example');
select pg_temp.seed_user('aaaaaaaa-0000-4000-8000-000000000002', 'blake.volunteer@example.com', 'Blake Example');
select pg_temp.seed_user('aaaaaaaa-0000-4000-8000-000000000003', 'casey.leader@example.com', 'Casey Example');
select pg_temp.seed_user('aaaaaaaa-0000-4000-8000-000000000004', 'devon.leader@example.com', 'Devon Example');
select pg_temp.seed_user('aaaaaaaa-0000-4000-8000-000000000005', 'emery.director@example.com', 'Emery Example');
select pg_temp.seed_user('aaaaaaaa-0000-4000-8000-000000000006', 'frankie.admin@example.com', 'Frankie Example');

-- Roles beyond the Volunteer role every sign-up gets.
insert into public.user_roles (user_id, role_id, department_id) values
  -- Casey leads Camera Operations, Devon leads Audio Engineering.
  ('aaaaaaaa-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855'),
  ('aaaaaaaa-0000-4000-8000-000000000004', '297464be-2cae-430d-94bf-6038bd745384', '8cd57d7d-1aab-4be6-b67b-e9bc606e0d73'),
  -- Emery is Production Director, Frankie is Platform Administrator.
  ('aaaaaaaa-0000-4000-8000-000000000005', 'bb83337d-c513-4ed9-b348-e2df0aad280b', null),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'd8b78629-6772-4a39-8c9f-be33ba201e05', null);

-- Avery belongs to Camera Operations; Blake has asked to join Audio Engineering.
insert into public.department_memberships (department_id, user_id, status, decided_at, decided_by) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'aaaaaaaa-0000-4000-8000-000000000001', 'active', now(), 'aaaaaaaa-0000-4000-8000-000000000003'),
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'aaaaaaaa-0000-4000-8000-000000000002', 'requested', null, null);

-- One obviously fake published course in Camera Operations Level 1, so the "member with courses"
-- home state can be tried locally and in CI. Not real curriculum.
insert into public.courses (id, department_id, level_id, sort_order, created_by)
select 'cccccccc-0000-4000-8000-000000000001', l.department_id, l.id, 10, 'aaaaaaaa-0000-4000-8000-000000000003'
from public.levels l
where l.department_id = 'b7ba9dae-cab5-43e0-a996-8ae9d2436855' and l.number = 1;

insert into public.course_versions
  (id, course_id, version_number, status, title, summary, change_note, created_by, published_at, published_by)
values
  ('cccccccc-0000-4000-8000-000000000011', 'cccccccc-0000-4000-8000-000000000001', 1, 'published',
   'Sample course (seed data)', 'Fake content for local development and tests.', 'Seed data',
   'aaaaaaaa-0000-4000-8000-000000000003', now(), 'aaaaaaaa-0000-4000-8000-000000000003');

insert into public.course_modules (id, course_version_id, title, sort_order)
values ('cccccccc-0000-4000-8000-000000000021', 'cccccccc-0000-4000-8000-000000000011', 'Sample module', 10);

insert into public.lessons (course_version_id, module_id, title, body, sort_order)
values ('cccccccc-0000-4000-8000-000000000011', 'cccccccc-0000-4000-8000-000000000021',
        'Sample lesson', 'Fake lesson text for local development.', 10);

-- A fake two-question quiz at the end of the sample course (default rules: 80% to pass, 3 attempts).
insert into public.quizzes (id, course_version_id, quiz_key, title, intro, sort_order)
values ('cccccccc-0000-4000-8000-000000000031', 'cccccccc-0000-4000-8000-000000000011',
        'cccccccc-0000-4000-8000-000000000032', 'Sample quiz (seed data)',
        'Fake questions for local development and tests.', 10);

insert into public.quiz_questions (quiz_id, course_version_id, kind, prompt, explanation, options, sort_order)
values
  ('cccccccc-0000-4000-8000-000000000031', 'cccccccc-0000-4000-8000-000000000011', 'single',
   'This is a fake seed question. Choose "Right answer".', 'Seed data explanation.',
   '[{"key":"a","label":"Right answer","correct":true},{"key":"b","label":"Wrong answer","correct":false}]', 10),
  ('cccccccc-0000-4000-8000-000000000031', 'cccccccc-0000-4000-8000-000000000011', 'true_false',
   'Seed data is fake.', '',
   '[{"key":"a","label":"True","correct":true},{"key":"b","label":"False","correct":false}]', 20);

-- A fake competency, serving role, and practical assessment on the sample course, so workflow B
-- (SPEC §3) runs end to end: a pass grants the competency and Approved to Serve follows.
insert into public.competencies (id, department_id, name, description)
values ('cccccccc-0000-4000-8000-000000000041', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855',
        'Sample skill (seed data)', 'Fake competency for local development and tests.');
insert into public.serving_roles (id, department_id, name, description)
values ('cccccccc-0000-4000-8000-000000000042', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855',
        'Sample role (seed data)', 'Fake serving role for local development and tests.');
insert into public.serving_role_competencies (role_id, competency_id, department_id)
values ('cccccccc-0000-4000-8000-000000000042', 'cccccccc-0000-4000-8000-000000000041',
        'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

insert into public.practicals (id, course_version_id, practical_key, title, intro, competency_id, sort_order)
values ('cccccccc-0000-4000-8000-000000000043', 'cccccccc-0000-4000-8000-000000000011',
        'cccccccc-0000-4000-8000-000000000044', 'Sample practical (seed data)',
        'Fake practical assessment for local development and tests.',
        'cccccccc-0000-4000-8000-000000000041', 10);
insert into public.practical_criteria (practical_id, course_version_id, label, is_required, sort_order)
values
  ('cccccccc-0000-4000-8000-000000000043', 'cccccccc-0000-4000-8000-000000000011', 'Fake required step', true, 10),
  ('cccccccc-0000-4000-8000-000000000043', 'cccccccc-0000-4000-8000-000000000011', 'Fake optional step', false, 20);
