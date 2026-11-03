-- The onboarding email sender: only pending emails go, only when emails are on, up to three tries,
-- never to a deactivated account, and only the service role can call it.
begin;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'b2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'gone.test@example.com', '{"full_name": "Test Gone"}', now(), now());
update public.profiles set status = 'deactivated' where id = 'b2000000-0000-4000-8000-000000000001';

create temporary table ctx (key text primary key, id uuid);
insert into ctx values ('org', (select id from public.organizations order by created_at limit 1));
insert into public.onboarding_pathways (organization_id, name)
values ((select id from ctx where key = 'org'), 'Test sender pathway');
insert into ctx values ('pathway', (select id from public.onboarding_pathways where name = 'Test sender pathway'));
insert into public.onboarding_stages (pathway_id, name, timing, sort_order)
values ((select id from ctx where key = 'pathway'), 'Test stage', 'Day 0', 10);
insert into ctx values ('stage', (select id from public.onboarding_stages where pathway_id = (select id from ctx where key = 'pathway')));
insert into public.onboarding_steps (pathway_id, stage_id, kind, title, config, sort_order)
values ((select id from ctx where key = 'pathway'), (select id from ctx where key = 'stage'), 'email', 'Test welcome', '{}', 10);
insert into ctx values ('step', (select id from public.onboarding_steps where pathway_id = (select id from ctx where key = 'pathway')));

-- One email per person: held (written while emails were off), pending, and pending for a deactivated account.
create function pg_temp.new_email(p_name text, p_status text, p_user uuid default null) returns uuid language plpgsql as $$
declare
  v_contact uuid;
  v_entry uuid;
  v_id uuid;
begin
  insert into public.onboarding_contacts (organization_id, display_name, email, user_id, source)
  values ((select id from ctx where key = 'org'), p_name, lower(p_name) || '.test@example.com', p_user, 'manual')
  returning id into v_contact;
  insert into public.onboarding_entries (organization_id, pathway_id, contact_id, came_in_by)
  values ((select id from ctx where key = 'org'), (select id from ctx where key = 'pathway'), v_contact, 'manual')
  returning id into v_entry;
  insert into public.onboarding_outbox (entry_id, step_id, contact_id, subject, body, status)
  values (v_entry, (select id from ctx where key = 'step'), v_contact, 'Hi ' || p_name, 'Welcome', p_status)
  returning id into v_id;
  return v_id;
end;
$$;
insert into ctx values
  ('held', pg_temp.new_email('Held', 'held')),
  ('ready', pg_temp.new_email('Ready', 'pending')),
  ('gone', pg_temp.new_email('Gone', 'pending', 'b2000000-0000-4000-8000-000000000001'));

-- Only the service role can send.
set local role authenticated;
select throws_ok($$ select * from public.claim_onboarding_emails() $$, '42501', null, 'a signed-in person cannot claim emails');
reset role;
set local role anon;
select throws_ok($$ select public.complete_onboarding_email(gen_random_uuid(), true) $$, '42501', null, 'nor can anyone signed out mark one sent');
reset role;

-- Emails off (the default): nothing goes, even an email marked pending.
update public.organizations set onboarding_emails_enabled = false where id = (select id from ctx where key = 'org');
select is((select count(*)::int from public.claim_onboarding_emails()), 0, 'nothing is claimed while onboarding emails are off');

-- Emails on: only the pending one goes.
update public.organizations set onboarding_emails_enabled = true where id = (select id from ctx where key = 'org');
create temporary table first_claim as select * from public.claim_onboarding_emails();
select is((select count(*)::int from first_claim), 1, 'one email is claimed');
select is((select id from first_claim), (select id from ctx where key = 'ready'), 'and it is the pending one');
select is((select email from first_claim), 'ready.test@example.com', 'going to the contact''s address');
select is((select has_account from first_claim), false, 'and it knows they have no account');
select is((select status from public.onboarding_outbox where id = (select id from ctx where key = 'held')), 'held',
  'an email held while they were off stays held');
select is((select status from public.onboarding_outbox where id = (select id from ctx where key = 'gone')), 'skipped',
  'a deactivated account is skipped');

-- Three tries, then failed.
select public.complete_onboarding_email((select id from ctx where key = 'ready'), false);
select is((select status from public.onboarding_outbox where id = (select id from ctx where key = 'ready')), 'pending', 'a failed send is tried again');
select is((select count(*)::int from public.claim_onboarding_emails()), 1, 'second try');
select public.complete_onboarding_email((select id from ctx where key = 'ready'), false);
select is((select count(*)::int from public.claim_onboarding_emails()), 1, 'third try');
select public.complete_onboarding_email((select id from ctx where key = 'ready'), false);
select is((select status from public.onboarding_outbox where id = (select id from ctx where key = 'ready')), 'failed', 'after three tries it has failed');
select is((select count(*)::int from public.claim_onboarding_emails()), 0, 'and is not claimed again');

-- A sent email is recorded and never goes twice.
insert into ctx values ('sent', pg_temp.new_email('Sent', 'pending'));
select is((select count(*)::int from public.claim_onboarding_emails()), 1, 'a new email is claimed');
select public.complete_onboarding_email((select id from ctx where key = 'sent'), true);
select is((select status from public.onboarding_outbox where id = (select id from ctx where key = 'sent')), 'sent', 'it is marked sent');
select isnt((select sent_at from public.onboarding_outbox where id = (select id from ctx where key = 'sent')), null, 'with the time');
select is((select count(*)::int from public.claim_onboarding_emails()), 0, 'and does not go twice');

select * from finish();
rollback;
