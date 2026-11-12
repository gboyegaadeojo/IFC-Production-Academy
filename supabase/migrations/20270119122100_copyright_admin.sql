-- Admin → Copyright (ADD-COPY-09): settings, the Quality control and outside reviewer lists, the six
-- emails, every request, and "Send me a test". Only copyright.manage holders; settings and list
-- changes are in the audit log through the tables' audit triggers.

-- A test email has no request.
alter table public.copyright_outbox alter column request_id drop not null;

create function private.copyright_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and private.has_capability('copyright.manage');
$$;

-- Everything the admin page shows, in one read.
create function public.copyright_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_organization_id();
begin
  if not private.copyright_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'on', private.copyright_on(v_org),
      'settings', jsonb_build_object(
        'deadlineDays', s.deadline_days,
        'deadlineCounting', s.deadline_counting,
        'latePolicy', s.late_policy,
        'introText', s.intro_text,
        'mediaInboxEmail', s.media_inbox_email,
        'mediaInboxOn', s.media_inbox_on,
        'emailOnDuty', s.email_on_duty,
        'checks', s.checks,
        'templates', s.templates),
      'contacts', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name, 'email', c.email)
                 order by c.kind, lower(c.name))
        from public.copyright_contacts c
        where c.organization_id = v_org and c.removed_at is null), '[]'::jsonb),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) order by lower(p.display_name))
        from public.profiles p
        where p.organization_id = v_org and p.status = 'active'
          and exists (
            select 1 from public.user_roles ur
            join public.role_capabilities rc on rc.role_id = ur.role_id
            join public.capabilities c on c.id = rc.capability_id and c.key = 'copyright.review'
            where ur.user_id = p.id and ur.revoked_at is null)), '[]'::jsonb),
      'requests', coalesce((
        select jsonb_agg(private.copyright_row(x.id)
                 order by (x.status in ('approved', 'declined')), x.service_day desc, x.created_at desc)
        from (select r.id, r.status, r.service_day, r.created_at
              from public.copyright_requests r
              where r.organization_id = v_org
              order by r.created_at desc limit 300) x), '[]'::jsonb))
    from public.copyright_settings s
    where s.organization_id = v_org);
end;
$$;

create function public.copyright_admin_request(p_request uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.copyright_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return (
    select private.copyright_detail(r.id) || jsonb_build_object(
      'reviewers', coalesce((
        select jsonb_agg(coalesce(p.display_name, k.name))
        from public.copyright_review_assignments a
        left join public.profiles p on p.id = a.user_id
        left join public.copyright_contacts k on k.id = a.contact_id
        where a.request_id = r.id), '[]'::jsonb))
    from public.copyright_requests r
    where r.id = p_request and r.organization_id = private.current_organization_id());
end;
$$;

create function public.save_copyright_settings(
  p_deadline_days integer, p_deadline_counting text, p_late_policy text, p_intro_text text,
  p_media_inbox_email text, p_media_inbox_on boolean, p_email_on_duty boolean, p_checks text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checks text[] := array(
    select left(trim(c), 200) from unnest(coalesce(p_checks, '{}')) c where trim(c) <> '' limit 10);
begin
  if not private.copyright_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.copyright_settings s
     set deadline_days = p_deadline_days,
         deadline_counting = p_deadline_counting,
         late_policy = p_late_policy,
         intro_text = left(trim(coalesce(p_intro_text, '')), 1000),
         media_inbox_email = nullif(lower(trim(coalesce(p_media_inbox_email, ''))), ''),
         media_inbox_on = p_media_inbox_on,
         email_on_duty = p_email_on_duty,
         checks = to_jsonb(v_checks),
         updated_by = (select auth.uid()),
         updated_at = now()
   where s.organization_id = private.current_organization_id();
exception
  when check_violation then
    raise exception 'invalid_settings' using errcode = '22023';
end;
$$;

-- Saves one email's subject and message, or with a null subject puts back the original.
create function public.save_copyright_template(p_key text, p_subject text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.copyright_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_key not in ('received', 'new_request', 'review_needed', 'approved', 'declined', 'cleared') then
    raise exception 'unknown_template' using errcode = '22023';
  end if;
  if p_subject is not null and (char_length(trim(p_subject)) not between 1 and 200
                                or char_length(trim(coalesce(p_body, ''))) not between 1 and 4000) then
    raise exception 'invalid_template' using errcode = '22023';
  end if;
  update public.copyright_settings s
     set templates = case when p_subject is null then s.templates - p_key
                          else s.templates || jsonb_build_object(p_key,
                                 jsonb_build_object('subject', trim(p_subject), 'body', trim(p_body))) end,
         updated_by = (select auth.uid()),
         updated_at = now()
   where s.organization_id = private.current_organization_id();
end;
$$;

create function public.add_copyright_contact(p_kind text, p_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.copyright_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.copyright_contacts (organization_id, kind, name, email, created_by)
  values (private.current_organization_id(), p_kind, trim(p_name), lower(trim(p_email)), (select auth.uid()))
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'already_listed' using errcode = 'P0001';
  when check_violation then
    raise exception 'invalid_contact' using errcode = '22023';
end;
$$;

-- Takes someone off a list. Their private links stop working straight away.
create function public.remove_copyright_contact(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.copyright_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.copyright_contacts c set removed_at = now()
   where c.id = p_id and c.organization_id = private.current_organization_id() and c.removed_at is null;
end;
$$;

-- Queues one email to the admin's own address with example details, even while approvals are off.
create function public.send_copyright_test_email(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not private.copyright_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_key not in ('received', 'new_request', 'review_needed', 'approved', 'declined', 'cleared') then
    raise exception 'unknown_template' using errcode = '22023';
  end if;
  if (select count(*) from public.copyright_outbox o
      where o.request_id is null and o.dedupe_key like 'test:%:' || (select auth.uid()) || ':%'
        and o.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_tests' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = (select auth.uid());
  insert into public.copyright_outbox (organization_id, request_id, to_email, template, vars, link, dedupe_key)
  values (private.current_organization_id(), null, lower(v_email), p_key,
    jsonb_build_object(
      'first name', 'Sam', 'requester name', 'Sam Rivera', 'what', 'video',
      'title', 'Missions moment before the offering', 'service date', 'Sunday 22 Nov',
      'reference', 'CR-0000', 'deadline', '5 days', 'reviewer name', 'Robin',
      'reviewer note', 'Looks great. Please send the final file to the producer by Friday.',
      'question', 'Is the background song covered by our streaming licence?', 'asked by', 'Morgan'),
    null, 'test:' || p_key || ':' || (select auth.uid()) || ':' || extract(epoch from clock_timestamp()));
end;
$$;

-- Test emails go even while approvals are off; everything else waits for the switch.
create or replace function public.claim_copyright_emails(p_limit integer default 50)
returns table (id uuid, email text, template text, vars jsonb, link text, templates jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.copyright_outbox o set status = 'skipped', link = null
   where o.status = 'pending' and o.created_at < now() - interval '3 days';

  return query
    with claimed as (
      select o.id
      from public.copyright_outbox o
      where o.status = 'pending' and o.attempts < 3
        and (o.request_id is null or private.copyright_on(o.organization_id))
      order by o.created_at
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
      for update of o skip locked
    )
    update public.copyright_outbox o
       set attempts = o.attempts + 1
      from claimed cl, public.copyright_settings s
     where o.id = cl.id and s.organization_id = o.organization_id
    returning o.id, o.to_email, o.template, o.vars, o.link, s.templates;
end;
$$;

revoke all on function public.copyright_admin_overview() from public, anon;
revoke all on function public.copyright_admin_request(uuid) from public, anon;
revoke all on function public.save_copyright_settings(integer, text, text, text, text, boolean, boolean, text[]) from public, anon;
revoke all on function public.save_copyright_template(text, text, text) from public, anon;
revoke all on function public.add_copyright_contact(text, text, text) from public, anon;
revoke all on function public.remove_copyright_contact(uuid) from public, anon;
revoke all on function public.send_copyright_test_email(text) from public, anon;
grant execute on function public.copyright_admin_overview() to authenticated;
grant execute on function public.copyright_admin_request(uuid) to authenticated;
grant execute on function public.save_copyright_settings(integer, text, text, text, text, boolean, boolean, text[]) to authenticated;
grant execute on function public.save_copyright_template(text, text, text) to authenticated;
grant execute on function public.add_copyright_contact(text, text, text) to authenticated;
grant execute on function public.remove_copyright_contact(uuid) to authenticated;
grant execute on function public.send_copyright_test_email(text) to authenticated;
revoke all on function private.copyright_admin() from public, anon, authenticated;
