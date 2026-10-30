-- Reference data every environment needs: the organization, the five departments (SPEC §1),
-- the five roles and their capabilities (SPEC §4). This is configuration, not people, so it ships
-- as a migration. Fake people for local development live in supabase/seed.sql.
--
-- IDs are fixed so tests, seed data, and later migrations can refer to them. Change names, status,
-- hue, or order later through the app or a new migration; never by editing this file.

insert into public.organizations (id, slug, name, time_zone) values
  ('fb45e05a-0afd-4170-aeab-622886acfc17', 'ifc', 'Immanuel Fellowship Church', 'America/Winnipeg');

-- Lighting Operations launches as Coming Soon (SPEC §1, SRS-CUR-009).
insert into public.departments (id, organization_id, slug, name, summary, status, hue, icon, sort_order) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'camera-operations',
   'Camera Operations',
   'Frame the moments that matter, from wide shots of the room to close-ups on stage.',
   'active', 'blue', 'camera', 10),
  ('8cd57d7d-1aab-4be6-b67b-e9bc606e0d73', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'audio-engineering',
   'Audio Engineering',
   'Mix what the room and the stream hear, so every word and note comes through clearly.',
   'active', 'teal', 'audio', 20),
  ('fed0034e-210d-4651-a19f-4027a08e4e17', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'computer-graphics-propresenter',
   'Computer Graphics and ProPresenter',
   'Put lyrics, scripture, and visuals on screen at the right moment.',
   'active', 'violet', 'graphics', 30),
  ('46515130-506a-435c-9143-f535b4c2bc56', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'camera-directing',
   'Camera Directing',
   'Call the shots and lead the camera team through a live service.',
   'active', 'coral', 'directing', 40),
  ('e15ed31d-af2b-48c6-b9b3-bbcda082c7c2', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'lighting-operations',
   'Lighting Operations',
   'Shape the look of the room with stage and house lighting.',
   'coming_soon', 'amber', 'lighting', 50);

insert into public.roles (id, organization_id, key, name, description, department_scoped) values
  ('125f1271-c9ee-4df2-ad58-8e9676b34948', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'volunteer',
   'Volunteer', 'Learns in the departments they belong to.', false),
  ('b028d677-5e3f-44bd-bd65-4142cefe148f', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'trainer',
   'Trainer / Evaluator', 'Assesses assigned learners and gives feedback.', true),
  ('297464be-2cae-430d-94bf-6038bd745384', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'department_leader',
   'Department Leader', 'Owns one department''s members, curriculum, and readiness.', true),
  ('bb83337d-c513-4ed9-b348-e2df0aad280b', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'production_director',
   'Production Director', 'Ministry-wide owner of readiness and publishing.', false),
  ('d8b78629-6772-4a39-8c9f-be33ba201e05', 'fb45e05a-0afd-4170-aeab-622886acfc17', 'platform_admin',
   'Platform Administrator', 'Manages accounts, roles, departments, and settings.', false);

insert into public.capabilities (key, description) values
  ('department.manage', 'Create, edit, activate, and deactivate departments'),
  ('member.approve', 'Approve, decline, or remove department members'),
  ('member.invite', 'Invite volunteers to the platform and a department'),
  ('user.manage', 'Suspend, reactivate, or deactivate accounts'),
  ('role.assign', 'Grant and revoke roles'),
  ('audit.view', 'Read the audit log'),
  ('course.draft', 'Draft curriculum and SOPs'),
  ('course.publish', 'Approve and publish curriculum'),
  ('assessment.record', 'Record practical assessments'),
  ('competency.approve', 'Approve competency records'),
  ('schedule.manage', 'Create events and assign serving roles'),
  ('schedule.override', 'Override a competency check on the schedule, with a reason'),
  ('mentoring.feedback', 'Give and read shared mentoring feedback'),
  ('mentoring.private_notes', 'Write and read private mentoring notes'),
  ('report.view', 'View training reports'),
  ('report.export', 'Export training reports');

-- SPEC §4. "Only if delegated" and "only if granted" permissions are left out; grant them per person.
insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from (values
  ('trainer', 'assessment.record'),
  ('trainer', 'mentoring.feedback'),
  ('trainer', 'mentoring.private_notes'),
  ('trainer', 'report.view'),

  ('department_leader', 'member.approve'),
  ('department_leader', 'member.invite'),
  ('department_leader', 'course.draft'),
  ('department_leader', 'assessment.record'),
  ('department_leader', 'competency.approve'),
  ('department_leader', 'schedule.manage'),
  ('department_leader', 'mentoring.feedback'),
  ('department_leader', 'report.view'),
  ('department_leader', 'report.export'),

  ('production_director', 'member.approve'),
  ('production_director', 'member.invite'),
  ('production_director', 'course.draft'),
  ('production_director', 'course.publish'),
  ('production_director', 'assessment.record'),
  ('production_director', 'competency.approve'),
  ('production_director', 'schedule.manage'),
  ('production_director', 'schedule.override'),
  ('production_director', 'mentoring.feedback'),
  ('production_director', 'report.view'),
  ('production_director', 'report.export'),
  ('production_director', 'role.assign'),
  ('production_director', 'audit.view'),

  ('platform_admin', 'department.manage'),
  ('platform_admin', 'user.manage'),
  ('platform_admin', 'role.assign'),
  ('platform_admin', 'audit.view'),
  ('platform_admin', 'report.view')
) as grants (role_key, capability_key)
join public.roles r on r.key = grants.role_key
  and r.organization_id = 'fb45e05a-0afd-4170-aeab-622886acfc17'
join public.capabilities c on c.key = grants.capability_key;
