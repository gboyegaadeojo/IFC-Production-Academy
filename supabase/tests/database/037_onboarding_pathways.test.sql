-- Onboarding pathways: who can build and see them, the public form, follow-ups (turns, claim,
-- hand over), private notes, held emails, and a Planning Center team place finishing a step.
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

-- Test people (fake): Director A b1…01 and Director B b1…02 (onboarding role, organisation-wide);
-- Camera Leader b1…03 (department leader, Camera); Volunteer b1…04.
select pg_temp.new_user('b1000000-0000-4000-8000-000000000001', 'Test Director A');
select pg_temp.new_user('b1000000-0000-4000-8000-000000000002', 'Test Director B');
select pg_temp.new_user('b1000000-0000-4000-8000-000000000003', 'Test Camera Leader');
select pg_temp.new_user('b1000000-0000-4000-8000-000000000004', 'Test Volunteer');

create temporary table ctx (key text primary key, id uuid);
grant all on ctx to authenticated, anon;
insert into public.roles (organization_id, key, name, department_scoped)
select id, 'test_onboarding_lead', 'Test onboarding lead', false from public.organizations order by created_at limit 1;
insert into ctx values ('role', (select id from public.roles where key = 'test_onboarding_lead'));
insert into public.role_capabilities (role_id, capability_id)
select (select id from ctx where key = 'role'), c.id from public.capabilities c where c.key = 'onboarding.manage';
insert into public.user_roles (user_id, role_id) values
  ('b1000000-0000-4000-8000-000000000001', (select id from ctx where key = 'role')),
  ('b1000000-0000-4000-8000-000000000002', (select id from ctx where key = 'role'));
insert into public.user_roles (user_id, role_id, department_id) values
  ('b1000000-0000-4000-8000-000000000003', '297464be-2cae-430d-94bf-6038bd745384', 'b7ba9dae-cab5-43e0-a996-8ae9d2436855');

-- Director A builds "Join the team": form → welcome email → follow-up (taking turns) → finish.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
insert into public.onboarding_pathways (organization_id, name)
select id, 'Test join the team' from public.organizations order by created_at limit 1;
insert into ctx values ('join', (select id from public.onboarding_pathways where name = 'Test join the team'));
insert into public.onboarding_stages (pathway_id, name, timing, sort_order) values
  ((select id from ctx where key = 'join'), 'Interested', 'Day 0', 10),
  ((select id from ctx where key = 'join'), 'Met', 'Within 3 days', 20);
insert into ctx values
  ('s1', (select id from public.onboarding_stages where name = 'Interested' and pathway_id = (select id from ctx where key = 'join'))),
  ('s2', (select id from public.onboarding_stages where name = 'Met' and pathway_id = (select id from ctx where key = 'join')));
insert into public.onboarding_steps (pathway_id, stage_id, kind, title, config, sort_order) values
  ((select id from ctx where key = 'join'), (select id from ctx where key = 's1'), 'trigger_form', 'Form', '{}', 10),
  ((select id from ctx where key = 'join'), (select id from ctx where key = 's1'), 'email', 'Welcome', '{"subject": "Hi {first name}", "body": "Welcome"}', 20),
  ((select id from ctx where key = 'join'), (select id from ctx where key = 's2'), 'task', 'Meet them',
    jsonb_build_object('role_id', (select id from ctx where key = 'role'), 'mode', 'turns', 'due_hours', 72), 10),
  ((select id from ctx where key = 'join'), (select id from ctx where key = 's2'), 'finish', 'Done', '{}', 20);
reset role;

-- The Camera leader can't see or build the general pathway, but can build Camera's.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.onboarding_pathways where id = (select id from ctx where key = 'join')), 0,
  'a department leader cannot see the general pathway');
select throws_ok(
  $$ insert into public.onboarding_pathways (organization_id, name)
     select id, 'Sneaky' from public.organizations order by created_at limit 1 $$,
  '42501', null, 'a department leader cannot create the general pathway');
select lives_ok(
  $$ insert into public.onboarding_pathways (organization_id, department_id, name)
     select id, 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Test camera onboarding' from public.organizations order by created_at limit 1 $$,
  'a department leader builds their own department''s pathway');
reset role;

-- Someone fills in the public form, without an account.
set local role anon;
select lives_ok($$ select public.submit_interest('Riley Example', 'riley.test@example.com', '', 'Hello', '{}', '') $$,
  'anyone can send the "I want to serve" form');
select lives_ok($$ select public.submit_interest('Bot', 'bot@example.com', '', '', '{}', 'http://spam') $$,
  'a bot that fills the trap field is quietly ignored');
reset role;
select is((select count(*)::int from public.onboarding_contacts where email = 'bot@example.com'), 0, 'and nothing is saved for it');

insert into ctx values ('riley', (select e.id from public.onboarding_entries e
  join public.onboarding_contacts c on c.id = e.contact_id where c.email = 'riley.test@example.com'));
select is((select s.title from public.onboarding_entries e join public.onboarding_steps s on s.id = e.current_step_id
           where e.id = (select id from ctx where key = 'riley')), 'Meet them',
  'the pathway runs to the first step that waits');
select is((select status from public.onboarding_outbox where entry_id = (select id from ctx where key = 'riley')), 'held',
  'the welcome email is held while onboarding emails are off');
select is((select subject from public.onboarding_outbox where entry_id = (select id from ctx where key = 'riley')), 'Hi Riley',
  'and greets them by first name');
select is((select p.display_name from public.onboarding_tasks t join public.profiles p on p.id = t.assignee_id
           where t.entry_id = (select id from ctx where key = 'riley')), 'Test Director A',
  'taking turns: the first follow-up goes to someone who hasn''t had one');

-- A second person goes to the other director.
set local role anon;
select public.submit_interest('Sam Example', 'sam.test@example.com', '', '', '{}', '');
reset role;
select is((select p.display_name from public.onboarding_tasks t join public.profiles p on p.id = t.assignee_id
           join public.onboarding_entries e on e.id = t.entry_id join public.onboarding_contacts c on c.id = e.contact_id
           where c.email = 'sam.test@example.com'), 'Test Director B', 'and the next one to the other director');

-- Volunteers see none of this.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.onboarding_entries), 0, 'a volunteer sees no one''s onboarding');
select is((select count(*)::int from public.onboarding_contacts), 0, 'or anyone''s contact details');
select throws_ok($$ select public.onboarding_complete_task((select id from public.onboarding_tasks limit 1)) $$,
  '42501', null, 'or ticks anyone''s follow-up');
reset role;

-- Notes: shared ones for the team, private ones for their author only.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
insert into public.onboarding_notes (entry_id, body, visibility) values
  ((select id from ctx where key = 'riley'), 'Keen on sound', 'shared'),
  ((select id from ctx where key = 'riley'), 'Mentioned a hard season', 'private');
reset role;
select pg_temp.act_as('b1000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.onboarding_notes where entry_id = (select id from ctx where key = 'riley')), 1,
  'another director sees the shared note but not the private one');
-- Hand over: Director B gives Riley's follow-up to themself, then ticks it.
select lives_ok($$ select public.onboarding_assign_task((select id from public.onboarding_tasks where entry_id = (select id from ctx where key = 'riley')), 'b1000000-0000-4000-8000-000000000002') $$,
  'a follow-up can be handed to someone else in its pool');
select lives_ok($$ select public.onboarding_complete_task((select id from public.onboarding_tasks where entry_id = (select id from ctx where key = 'riley'))) $$,
  'and ticked');
reset role;
select is((select status::text from public.onboarding_entries where id = (select id from ctx where key = 'riley')), 'finished',
  'a ticked follow-up moves them on, here to the end');

-- Claiming: a follow-up left for the first to take it.
update public.onboarding_steps set config = config || '{"mode": "claim"}'
 where pathway_id = (select id from ctx where key = 'join') and kind = 'task';
set local role anon;
select public.submit_interest('Jo Example', 'jo.test@example.com', '', '', '{}', '');
reset role;
insert into ctx values ('jo_task', (select t.id from public.onboarding_tasks t join public.onboarding_entries e on e.id = t.entry_id
  join public.onboarding_contacts c on c.id = e.contact_id where c.email = 'jo.test@example.com'));
select is((select assignee_id from public.onboarding_tasks where id = (select id from ctx where key = 'jo_task')), null,
  'a claim follow-up starts with no one');
select pg_temp.act_as('b1000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.onboarding_claim_task((select id from ctx where key = 'jo_task')) $$, 'someone in the pool takes it');
select throws_ok($$ select public.onboarding_claim_task((select id from ctx where key = 'jo_task')) $$,
  'P0001', 'already_taken', 'and nobody else can take it after');
reset role;

-- Planning Center: a team place from the sync finishes "Add to a team in Planning Center".
insert into public.serving_roles (department_id, name) values ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'Fake onboarding cam');
insert into ctx values ('cam', (select id from public.serving_roles where name = 'Fake onboarding cam'));
insert into ctx values ('cpath', (select id from public.onboarding_pathways where name = 'Test camera onboarding'));
insert into public.onboarding_stages (pathway_id, name, sort_order) values ((select id from ctx where key = 'cpath'), 'Ready', 10);
insert into public.onboarding_steps (pathway_id, stage_id, kind, title, config, sort_order) values
  ((select id from ctx where key = 'cpath'), (select id from public.onboarding_stages where pathway_id = (select id from ctx where key = 'cpath')),
   'pco_team', 'Add to Camera', jsonb_build_object('serving_role_id', (select id from ctx where key = 'cam'), 'mode', 'claim'), 10);
insert into public.department_memberships (department_id, user_id, status, decided_at) values
  ('b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'b1000000-0000-4000-8000-000000000004', 'active', now());
select pg_temp.act_as('b1000000-0000-4000-8000-000000000003');
select lives_ok($$ select public.onboarding_add_person((select id from ctx where key = 'cpath'), 'Test Volunteer', 'b1000000-0000-4000-8000-000000000004@example.com') $$,
  'a leader adds someone to their department''s pathway');
reset role;
insert into ctx values ('vol', (select e.id from public.onboarding_entries e join public.onboarding_contacts c on c.id = e.contact_id
  where c.user_id = 'b1000000-0000-4000-8000-000000000004' and e.pathway_id = (select id from ctx where key = 'cpath')));
select is((select status::text from public.onboarding_entries where id = (select id from ctx where key = 'vol')), 'active',
  'they wait at the Planning Center step');
select pg_temp.act_as('b1000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.onboarding_complete_task((select id from public.onboarding_tasks where entry_id = (select id from ctx where key = 'vol'))) $$,
  'P0001', 'completes_from_planning_center', 'nobody ticks it by hand');
reset role;
insert into public.serving_team_members (role_id, department_id, user_id, source)
values ((select id from ctx where key = 'cam'), 'b7ba9dae-cab5-43e0-a996-8ae9d2436855', 'b1000000-0000-4000-8000-000000000004', 'planning_center');
select is((select status::text from public.onboarding_entries where id = (select id from ctx where key = 'vol')), 'finished',
  'when the sync puts them on the team, the step completes itself');

-- The volunteer sees their own steps.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000004');
select ok((select count(*) from public.my_onboarding()) >= 1, 'a volunteer sees their own onboarding steps');
reset role;

select * from finish();
rollback;
