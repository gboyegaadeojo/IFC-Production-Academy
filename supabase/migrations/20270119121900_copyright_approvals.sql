-- Video and graphics approvals (ADD-COPY-01..10; docs/decisions/2026-11-12-copyright-approvals.md).
-- Replaces the church's JotForm. Anyone sends a request from a public form. Quality control, a list
-- of names and emails with no accounts, sees every request first through private email links and
-- approves, declines, or sends it for a copyright review. Reviewers are Academy members with
-- copyright.review, or outside people on a list who get a private link to one request. Approved
-- items show to everyone on duty for that service. All behind the 'copyright' feature switch.
--
-- Private links carry a random secret; only its SHA-256 is stored. A link waiting in the email
-- queue is cleared once the email is sent. The tables are read only by admins (copyright.manage);
-- everyone else reaches them through the functions below.

-- Permissions and the reviewer role ----------------------------------------------------------

insert into public.capabilities (key, description) values
  ('copyright.manage', 'Set up video and graphics approvals and see every request'),
  ('copyright.review', 'Review the video and graphics requests sent to you for copyright')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'platform_admin' and c.key = 'copyright.manage'
on conflict do nothing;

insert into public.roles (organization_id, key, name, description, department_scoped)
select o.id, 'copyright_reviewer', 'Copyright Reviewer',
       'Reviews the video and graphics requests Quality control sends them, from Copyright in the side bar.',
       false
from public.organizations o
on conflict (organization_id, key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'copyright_reviewer' and c.key = 'copyright.review'
on conflict do nothing;

-- The switch (ADD-FLAG-01) ----------------------------------------------------------------------

alter table public.feature_flags drop constraint feature_flags_key_check;
alter table public.feature_flags add constraint feature_flags_key_check
  check (key in ('messaging', 'copyright'));

insert into public.feature_flags (organization_id, key)
select o.id, 'copyright' from public.organizations o
on conflict (organization_id, key) do nothing;

-- Whether an organisation has approvals switched on, for callers with no signed-in organisation.
create function private.copyright_on(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.feature_flags f
                   where f.organization_id = p_org and f.key = 'copyright'), false);
$$;

-- The one organisation a public visitor belongs to, as for the "Join the production team" form.
create function private.copyright_public_org()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id from public.organizations o order by o.created_at limit 1;
$$;

-- Tables -----------------------------------------------------------------------------------------

create table public.copyright_settings (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  deadline_days integer not null default 5 check (deadline_days between 0 and 60),
  deadline_counting text not null default 'calendar' check (deadline_counting in ('calendar', 'business')),
  late_policy text not null default 'accept' check (late_policy in ('accept', 'block')),
  intro_text text not null default '' check (char_length(intro_text) <= 1000),
  media_inbox_email text check (
    media_inbox_email is null
    or (char_length(media_inbox_email) <= 254 and media_inbox_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  media_inbox_on boolean not null default true,
  email_on_duty boolean not null default false,
  checks jsonb not null default
    '["We have the right to show it (our own, licensed, or permission given)", "Any music is covered for streaming", "Suitable for the livestream audience"]'::jsonb
    check (jsonb_typeof(checks) = 'array'),
  templates jsonb not null default '{}'::jsonb check (jsonb_typeof(templates) = 'object'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.copyright_settings (organization_id)
select o.id from public.organizations o
on conflict (organization_id) do nothing;

-- Quality control and outside reviewers: names and addresses, never accounts (ADD-COPY-04, -05).
create table public.copyright_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind text not null check (kind in ('quality_control', 'reviewer')),
  name text not null check (char_length(trim(name)) between 1 and 80),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index copyright_contacts_one_active_idx
  on public.copyright_contacts (organization_id, kind, lower(email)) where removed_at is null;

create sequence public.copyright_request_number;

create table public.copyright_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  request_number integer not null unique default nextval('public.copyright_request_number'),
  first_name text not null check (char_length(trim(first_name)) between 1 and 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  kind text not null check (kind in ('video', 'graphic')),
  media_url text check (media_url is null or (char_length(media_url) <= 500 and media_url ~ '^https://\S+$')),
  file_path text check (file_path is null or file_path ~ '^requests/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  event_id uuid references public.events (id) on delete set null,
  service_day date not null,
  description text not null check (char_length(trim(description)) between 1 and 1000),
  is_late boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'with_quality_control', 'with_copyright_review', 'approved', 'declined')),
  claimed_by uuid references public.copyright_contacts (id) on delete set null,
  claimed_at timestamptz,
  review_question text check (review_question is null or char_length(review_question) <= 1000),
  sent_for_review_by text check (sent_for_review_by is null or char_length(sent_for_review_by) <= 80),
  sent_for_review_at timestamptz,
  plan_item_id text check (plan_item_id is null or char_length(plan_item_id) <= 100),
  decided_via text check (decided_via is null or decided_via in ('quality_control', 'reviewer')),
  decided_by_name text check (decided_by_name is null or char_length(decided_by_name) <= 80),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  decided_at timestamptz,
  status_token_hash bytea unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copyright_requests_has_media check (media_url is not null or file_path is not null),
  constraint copyright_requests_decided check (
    (status in ('approved', 'declined')) = (decided_at is not null)
  )
);
create index copyright_requests_org_day_idx on public.copyright_requests (organization_id, service_day);
create index copyright_requests_event_idx on public.copyright_requests (event_id) where status = 'approved';
create index copyright_requests_email_idx on public.copyright_requests (lower(email), created_at);

-- Who a request was sent to for a copyright review: an Academy member or an outside contact.
create table public.copyright_review_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.copyright_requests (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  contact_id uuid references public.copyright_contacts (id) on delete cascade,
  token_hash bytea unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint copyright_review_assignments_one_reviewer check (num_nonnulls(user_id, contact_id) = 1),
  constraint copyright_review_assignments_token check ((contact_id is not null) = (token_hash is not null)),
  unique (request_id, user_id),
  unique (request_id, contact_id)
);
create index copyright_review_assignments_user_idx on public.copyright_review_assignments (user_id);

-- Quality control's private links, one per email sent (ADD-COPY-04).
create table public.copyright_access_links (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.copyright_contacts (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Emails waiting for the notifications job. The job fills in the template; the link is cleared
-- once sent, so a secret never sits in the database longer than it must.
create table public.copyright_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  request_id uuid not null references public.copyright_requests (id) on delete cascade,
  to_email text not null check (char_length(to_email) <= 254),
  template text not null
    check (template in ('received', 'new_request', 'review_needed', 'approved', 'declined', 'cleared')),
  vars jsonb not null default '{}'::jsonb check (jsonb_typeof(vars) = 'object'),
  link text check (link is null or (char_length(link) <= 300 and link ~ '^/[A-Za-z0-9/_.?=&-]*$')),
  dedupe_key text not null unique check (char_length(dedupe_key) <= 200),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index copyright_outbox_pending_idx on public.copyright_outbox (created_at) where status = 'pending';

-- The shared "Loaded" tick on the day (ADD-COPY-08).
create table public.copyright_loaded (
  request_id uuid primary key references public.copyright_requests (id) on delete cascade,
  loaded_by uuid references public.profiles (id) on delete set null,
  loaded_at timestamptz not null default now()
);

alter table public.copyright_settings enable row level security;
alter table public.copyright_contacts enable row level security;
alter table public.copyright_requests enable row level security;
alter table public.copyright_review_assignments enable row level security;
alter table public.copyright_access_links enable row level security;
alter table public.copyright_outbox enable row level security;
alter table public.copyright_loaded enable row level security;

-- Admins read everything in their organisation. Nobody writes directly: the functions do.
create policy "Copyright admins read settings" on public.copyright_settings for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and private.is_active_user() and private.has_capability('copyright.manage'));
create policy "Copyright admins read contacts" on public.copyright_contacts for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and private.is_active_user() and private.has_capability('copyright.manage'));
create policy "Copyright admins read requests" on public.copyright_requests for select to authenticated
  using (organization_id = (select private.current_organization_id())
         and private.is_active_user() and private.has_capability('copyright.manage'));
create policy "Copyright admins read review assignments" on public.copyright_review_assignments
  for select to authenticated
  using (private.is_active_user() and private.has_capability('copyright.manage')
         and exists (select 1 from public.copyright_requests r where r.id = request_id
                     and r.organization_id = (select private.current_organization_id())));
create policy "Copyright admins read loaded ticks" on public.copyright_loaded for select to authenticated
  using (private.is_active_user() and private.has_capability('copyright.manage')
         and exists (select 1 from public.copyright_requests r where r.id = request_id
                     and r.organization_id = (select private.current_organization_id())));

grant select on public.copyright_settings, public.copyright_contacts, public.copyright_requests,
  public.copyright_review_assignments, public.copyright_loaded to authenticated;

create trigger copyright_settings_audit after insert or update or delete on public.copyright_settings
  for each row execute function private.audit_change('copyright_settings');
create trigger copyright_contacts_audit after insert or update or delete on public.copyright_contacts
  for each row execute function private.audit_change('copyright_contact');

-- Helpers ----------------------------------------------------------------------------------------

create function private.copyright_hash(p_value text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(p_value, 'UTF8'), 'sha256');
$$;

create function private.copyright_secret()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

-- Days of notice, as lib/domain/copyright.ts leadDays: calendar days after today up to the service
-- day, or only Monday to Friday among them.
create function private.copyright_lead_days(p_today date, p_day date, p_counting text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_day <= p_today then 0
    when p_counting = 'business' then (
      select count(*)::integer
      from generate_series((p_today + 1)::timestamp, p_day::timestamp, interval '1 day') as d (day)
      where extract(isodow from d.day) < 6)
    else p_day - p_today
  end;
$$;

-- Today in Winnipeg, a fixed UTC-5 (docs/decisions/2026-11-10-winnipeg-fixed-offset.md).
create function private.copyright_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Etc/GMT+5')::date;
$$;

create function private.copyright_day_label(p_day date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_day, 'FMDay FMDD Mon');
$$;

-- The fill-ins every email about a request shares.
create function private.copyright_vars(p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'first name', r.first_name,
    'requester name', trim(r.first_name || ' ' || r.last_name),
    'what', case r.kind when 'video' then 'video' else 'graphic' end,
    'title', left(r.description, 120),
    'service date', private.copyright_day_label(r.service_day),
    'reference', 'CR-' || lpad(r.request_number::text, 4, '0'),
    'reviewer name', coalesce(r.decided_by_name, ''),
    'reviewer note', coalesce(r.decision_note, ''),
    'question', coalesce(r.review_question, ''),
    'asked by', coalesce(r.sent_for_review_by, '')
  )
  from public.copyright_requests r where r.id = p_request;
$$;

create function private.copyright_queue(
  p_request uuid, p_to text, p_template text, p_vars jsonb, p_link text, p_dedupe text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.copyright_outbox (organization_id, request_id, to_email, template, vars, link, dedupe_key)
  select r.organization_id, r.id, lower(trim(p_to)), p_template, coalesce(p_vars, '{}'::jsonb), p_link, p_dedupe
  from public.copyright_requests r where r.id = p_request
  on conflict (dedupe_key) do nothing;
$$;

-- A fresh private link for someone on Quality control, valid 30 days.
create function private.copyright_qc_link(p_contact uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := private.copyright_secret();
begin
  insert into public.copyright_access_links (contact_id, token_hash, expires_at)
  values (p_contact, private.copyright_hash(v_secret), now() + interval '30 days');
  return '/copyright/qc/' || v_secret;
end;
$$;

-- The Quality control contact a link belongs to, if it's still good.
create function private.copyright_qc_contact(p_token text)
returns public.copyright_contacts
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from public.copyright_access_links l
  join public.copyright_contacts c on c.id = l.contact_id
  where l.token_hash = private.copyright_hash(coalesce(p_token, ''))
    and l.expires_at > now()
    and c.kind = 'quality_control'
    and c.removed_at is null
    and private.copyright_on(c.organization_id)
  limit 1;
$$;

create function private.copyright_service_label(p_request uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(e.title || ' · ', '') || private.copyright_day_label(r.service_day)
         || coalesce(' · ' || to_char(e.starts_at at time zone 'Etc/GMT+5', 'FMHH24:MI'), '')
  from public.copyright_requests r
  left join public.events e on e.id = r.event_id
  where r.id = p_request;
$$;

-- Everything a reviewer or Quality control sees about one request.
create function private.copyright_detail(p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'reference', 'CR-' || lpad(r.request_number::text, 4, '0'),
    'kind', r.kind,
    'description', r.description,
    'requesterName', trim(r.first_name || ' ' || r.last_name),
    'requesterEmail', r.email,
    'mediaUrl', r.media_url,
    'hasFile', r.file_path is not null,
    'serviceDay', r.service_day,
    'serviceLabel', private.copyright_service_label(r.id),
    'eventId', r.event_id,
    'isLate', r.is_late,
    'leadDays', private.copyright_lead_days((r.created_at at time zone 'Etc/GMT+5')::date, r.service_day, 'calendar'),
    'status', r.status,
    'claimedBy', c.name,
    'question', r.review_question,
    'sentForReviewBy', r.sent_for_review_by,
    'planItemId', r.plan_item_id,
    'decidedBy', r.decided_by_name,
    'decisionNote', r.decision_note,
    'decidedAt', r.decided_at,
    'createdAt', r.created_at,
    'checks', s.checks,
    'planItems', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.external_id, 'title', i.title) order by i.position)
      from public.service_plan_items i where i.event_id = r.event_id), '[]'::jsonb)
  )
  from public.copyright_requests r
  join public.copyright_settings s on s.organization_id = r.organization_id
  left join public.copyright_contacts c on c.id = r.claimed_by
  where r.id = p_request;
$$;

-- A short row for lists.
create function private.copyright_row(p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'reference', 'CR-' || lpad(r.request_number::text, 4, '0'),
    'kind', r.kind,
    'description', left(r.description, 200),
    'requesterName', trim(r.first_name || ' ' || r.last_name),
    'serviceDay', r.service_day,
    'serviceLabel', private.copyright_service_label(r.id),
    'isLate', r.is_late,
    'status', r.status,
    'claimedBy', c.name,
    'reviewers', coalesce((
      select jsonb_agg(coalesce(p.display_name, k.name))
      from public.copyright_review_assignments a
      left join public.profiles p on p.id = a.user_id
      left join public.copyright_contacts k on k.id = a.contact_id
      where a.request_id = r.id), '[]'::jsonb),
    'createdAt', r.created_at,
    'decidedAt', r.decided_at
  )
  from public.copyright_requests r
  left join public.copyright_contacts c on c.id = r.claimed_by
  where r.id = p_request;
$$;

-- An approved or declined decision, from Quality control or a reviewer (ADD-COPY-06). Emails the
-- requester, copies Quality control when a reviewer decided, and on approval tells the media inbox
-- and, if that's on, everyone on duty (ADD-COPY-08). Refuses a request that's already decided.
create function private.copyright_finish(
  p_request uuid, p_approve boolean, p_note text, p_by text, p_via text, p_plan_item text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.copyright_requests;
  v_settings public.copyright_settings;
  v_vars jsonb;
  v_contact public.copyright_contacts;
  v_person record;
  v_plan text;
begin
  select * into v_req from public.copyright_requests r where r.id = p_request for update;
  if v_req.id is null or v_req.status in ('approved', 'declined') then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  -- Only an item in this service's order of service can be chosen.
  select i.external_id into v_plan from public.service_plan_items i
   where i.event_id = v_req.event_id and i.external_id = p_plan_item;

  update public.copyright_requests r
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_via = p_via,
         decided_by_name = left(trim(p_by), 80),
         decision_note = nullif(left(trim(coalesce(p_note, '')), 2000), ''),
         decided_at = now(),
         plan_item_id = coalesce(v_plan, r.plan_item_id),
         updated_at = now()
   where r.id = p_request;

  v_vars := private.copyright_vars(p_request);
  perform private.copyright_queue(p_request, v_req.email,
    case when p_approve then 'approved' else 'declined' end, v_vars, null,
    'decision:' || p_request);

  if p_via = 'reviewer' then
    for v_contact in
      select c.* from public.copyright_contacts c
      where c.organization_id = v_req.organization_id and c.kind = 'quality_control' and c.removed_at is null
    loop
      perform private.copyright_queue(p_request, v_contact.email,
        case when p_approve then 'approved' else 'declined' end,
        v_vars || jsonb_build_object('first name', split_part(v_contact.name, ' ', 1)), null,
        'decision_copy:' || p_request || ':' || v_contact.id);
    end loop;
  end if;

  if p_approve then
    select * into v_settings from public.copyright_settings s where s.organization_id = v_req.organization_id;
    if v_settings.media_inbox_on and v_settings.media_inbox_email is not null then
      perform private.copyright_queue(p_request, v_settings.media_inbox_email, 'cleared', v_vars, null,
        'cleared:' || p_request);
    end if;
    if v_settings.email_on_duty and v_req.event_id is not null then
      for v_person in
        select distinct u.id, u.email, p.display_name
        from public.event_assignments a
        join public.profiles p on p.id = a.user_id and p.status = 'active'
        join auth.users u on u.id = a.user_id
        where a.event_id = v_req.event_id and a.cancelled_at is null and a.status <> 'declined'
          and u.email is not null
      loop
        perform private.copyright_queue(p_request, v_person.email, 'cleared',
          v_vars || jsonb_build_object('first name', split_part(coalesce(v_person.display_name, ''), ' ', 1)),
          null, 'cleared:' || p_request || ':' || v_person.id);
      end loop;
    end if;
  end if;
end;
$$;

-- The public form (ADD-COPY-01, -02, -03) -----------------------------------------------------

-- What the form needs: whether it's open, the deadline, and upcoming services.
create function public.copyright_form()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'open', private.copyright_on(o.id),
    'deadlineDays', s.deadline_days,
    'deadlineCounting', s.deadline_counting,
    'latePolicy', s.late_policy,
    'introText', s.intro_text,
    'today', private.copyright_today(),
    'services', case when private.copyright_on(o.id) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'startsAt', e.starts_at,
        'day', (e.starts_at at time zone 'Etc/GMT+5')::date) order by e.starts_at)
      from (select * from public.events e
            where e.organization_id = o.id and e.cancelled_at is null
              and e.starts_at > now() and e.starts_at < now() + interval '60 days'
            order by e.starts_at limit 12) e), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.organizations o
  join public.copyright_settings s on s.organization_id = o.id
  where o.id = private.copyright_public_org();
$$;
revoke all on function public.copyright_form() from public;
grant execute on function public.copyright_form() to anon, authenticated;

-- Sends a request. Returns its reference and the requester's private status secret, or nothing for
-- a bot (the hidden field), so the form answers the same way either way.
create function public.submit_copyright_request(
  p_first_name text, p_last_name text, p_email text, p_kind text, p_media_url text,
  p_file_path text, p_event_id uuid, p_other_date date, p_description text, p_website text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.copyright_public_org();
  v_settings public.copyright_settings;
  v_day date;
  v_today date := private.copyright_today();
  v_late boolean;
  v_secret text := private.copyright_secret();
  v_id uuid;
  v_number integer;
  v_contact public.copyright_contacts;
  v_vars jsonb;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if coalesce(p_website, '') <> '' then
    return null;
  end if;
  if not private.copyright_on(v_org) then
    raise exception 'copyright_off' using errcode = 'P0001';
  end if;
  if (select count(*) from public.copyright_requests r
      where lower(r.email) = v_email and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  if p_event_id is not null then
    select (e.starts_at at time zone 'Etc/GMT+5')::date into v_day
    from public.events e
    where e.id = p_event_id and e.organization_id = v_org and e.cancelled_at is null and e.starts_at > now();
    if v_day is null then
      raise exception 'unknown_service' using errcode = '22023';
    end if;
  elsif p_other_date is not null and p_other_date >= v_today and p_other_date <= v_today + 366 then
    v_day := p_other_date;
  else
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  select * into v_settings from public.copyright_settings s where s.organization_id = v_org;
  v_late := private.copyright_lead_days(v_today, v_day, v_settings.deadline_counting) < v_settings.deadline_days;
  if v_late and v_settings.late_policy = 'block' then
    raise exception 'too_late' using errcode = 'P0001';
  end if;

  insert into public.copyright_requests (
    organization_id, first_name, last_name, email, kind, media_url, file_path, event_id, service_day,
    description, is_late, status_token_hash)
  values (
    v_org, trim(p_first_name), trim(coalesce(p_last_name, '')), v_email, p_kind,
    nullif(trim(coalesce(p_media_url, '')), ''), nullif(trim(coalesce(p_file_path, '')), ''),
    p_event_id, v_day, trim(p_description), v_late, private.copyright_hash(v_secret))
  returning id, request_number into v_id, v_number;

  v_vars := private.copyright_vars(v_id) || jsonb_build_object(
    'deadline', v_settings.deadline_days || case when v_settings.deadline_counting = 'business'
      then ' business day' else ' day' end || case when v_settings.deadline_days = 1 then '' else 's' end);
  perform private.copyright_queue(v_id, v_email, 'received', v_vars,
    '/media-request/status/' || v_secret, 'received:' || v_id);
  for v_contact in
    select c.* from public.copyright_contacts c
    where c.organization_id = v_org and c.kind = 'quality_control' and c.removed_at is null
  loop
    perform private.copyright_queue(v_id, v_contact.email, 'new_request',
      v_vars || jsonb_build_object('first name', split_part(v_contact.name, ' ', 1)),
      private.copyright_qc_link(v_contact.id), 'new_request:' || v_id || ':' || v_contact.id);
  end loop;

  return jsonb_build_object('reference', 'CR-' || lpad(v_number::text, 4, '0'),
                            'statusToken', v_secret, 'isLate', v_late);
exception
  when check_violation then
    raise exception 'invalid_request' using errcode = '22023';
end;
$$;
revoke all on function public.submit_copyright_request(text, text, text, text, text, text, uuid, date, text, text) from public;
grant execute on function public.submit_copyright_request(text, text, text, text, text, text, uuid, date, text, text)
  to anon, authenticated;

-- The requester's status page, from the secret in their email (ADD-COPY-03).
create function public.copyright_request_status(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reference', 'CR-' || lpad(r.request_number::text, 4, '0'),
    'kind', r.kind,
    'description', r.description,
    'serviceLabel', private.copyright_service_label(r.id),
    'status', r.status,
    'hadCopyrightReview', r.sent_for_review_at is not null,
    'isLate', r.is_late,
    'createdAt', r.created_at,
    'decidedAt', r.decided_at,
    'decisionNote', r.decision_note
  )
  from public.copyright_requests r
  where r.status_token_hash = private.copyright_hash(coalesce(p_token, ''));
$$;
revoke all on function public.copyright_request_status(text) from public;
grant execute on function public.copyright_request_status(text) to anon, authenticated;

-- Quality control, from its private link (ADD-COPY-04, -05, -07) --------------------------------

create function public.copyright_qc_requests(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.copyright_contacts := private.copyright_qc_contact(p_token);
begin
  if v_me.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'me', v_me.name,
    'requests', coalesce((
      select jsonb_agg(private.copyright_row(r.id)
               order by (r.status in ('approved', 'declined')), r.service_day, r.created_at)
      from public.copyright_requests r
      where r.organization_id = v_me.organization_id
        and (r.status not in ('approved', 'declined') or r.decided_at > now() - interval '30 days')),
      '[]'::jsonb));
end;
$$;

-- Opens one request; a new one gets this person's name on it.
create function public.copyright_qc_open(p_token text, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.copyright_contacts := private.copyright_qc_contact(p_token);
begin
  if v_me.id is null then
    return null;
  end if;
  update public.copyright_requests r
     set status = 'with_quality_control', claimed_by = v_me.id, claimed_at = now(), updated_at = now()
   where r.id = p_request and r.organization_id = v_me.organization_id and r.status = 'new';
  return (
    select private.copyright_detail(r.id) || jsonb_build_object(
      'me', v_me.name,
      'reviewers', coalesce((
        select jsonb_agg(x order by x->>'name') from (
          select jsonb_build_object('kind', 'member', 'id', p.id, 'name', p.display_name) as x
          from public.profiles p
          where p.organization_id = v_me.organization_id and p.status = 'active'
            and exists (
              select 1 from public.user_roles ur
              join public.role_capabilities rc on rc.role_id = ur.role_id
              join public.capabilities c on c.id = rc.capability_id and c.key = 'copyright.review'
              where ur.user_id = p.id and ur.revoked_at is null)
          union all
          select jsonb_build_object('kind', 'outside', 'id', k.id, 'name', k.name)
          from public.copyright_contacts k
          where k.organization_id = v_me.organization_id and k.kind = 'reviewer' and k.removed_at is null
        ) reviewers), '[]'::jsonb))
    from public.copyright_requests r
    where r.id = p_request and r.organization_id = v_me.organization_id);
end;
$$;

create function public.copyright_qc_decide(
  p_token text, p_request uuid, p_approve boolean, p_note text, p_plan_item text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.copyright_contacts := private.copyright_qc_contact(p_token);
begin
  if v_me.id is null then
    raise exception 'link_expired' using errcode = '42501';
  end if;
  if not exists (select 1 from public.copyright_requests r
                 where r.id = p_request and r.organization_id = v_me.organization_id
                   and r.status in ('new', 'with_quality_control')) then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  perform private.copyright_finish(p_request, p_approve, p_note, v_me.name, 'quality_control', p_plan_item);
end;
$$;

-- Sends a request to one or more copyright reviewers with a question (ADD-COPY-05).
create function public.copyright_qc_send_for_review(
  p_token text, p_request uuid, p_members uuid[], p_outside uuid[], p_question text,
  p_plan_item text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.copyright_contacts := private.copyright_qc_contact(p_token);
  v_req public.copyright_requests;
  v_vars jsonb;
  v_person record;
  v_secret text;
  v_count integer := 0;
begin
  if v_me.id is null then
    raise exception 'link_expired' using errcode = '42501';
  end if;
  select * into v_req from public.copyright_requests r
   where r.id = p_request and r.organization_id = v_me.organization_id for update;
  if v_req.id is null or v_req.status not in ('new', 'with_quality_control') then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_question, ''))) not between 1 and 1000 then
    raise exception 'question_needed' using errcode = '22023';
  end if;

  update public.copyright_requests r
     set status = 'with_copyright_review', review_question = trim(p_question),
         sent_for_review_by = v_me.name, sent_for_review_at = now(),
         claimed_by = coalesce(r.claimed_by, v_me.id), claimed_at = coalesce(r.claimed_at, now()),
         plan_item_id = coalesce((select i.external_id from public.service_plan_items i
                                  where i.event_id = r.event_id and i.external_id = p_plan_item), r.plan_item_id),
         updated_at = now()
   where r.id = p_request;
  v_vars := private.copyright_vars(p_request);

  -- Academy members with the permission: Copyright in their side bar, and an email to it.
  for v_person in
    select distinct p.id, p.display_name, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = any(coalesce(p_members, '{}')) and p.organization_id = v_me.organization_id
      and p.status = 'active' and u.email is not null
      and exists (
        select 1 from public.user_roles ur
        join public.role_capabilities rc on rc.role_id = ur.role_id
        join public.capabilities c on c.id = rc.capability_id and c.key = 'copyright.review'
        where ur.user_id = p.id and ur.revoked_at is null)
  loop
    insert into public.copyright_review_assignments (request_id, user_id, expires_at)
    values (p_request, v_person.id, now() + interval '14 days')
    on conflict (request_id, user_id) do nothing;
    perform private.copyright_queue(p_request, v_person.email, 'review_needed',
      v_vars || jsonb_build_object('first name', split_part(coalesce(v_person.display_name, ''), ' ', 1)),
      '/copyright/requests/' || p_request, 'review_needed:' || p_request || ':' || v_person.id);
    v_count := v_count + 1;
  end loop;

  -- Outside reviewers: a private link to this request only.
  for v_person in
    select k.id, k.name, k.email from public.copyright_contacts k
    where k.id = any(coalesce(p_outside, '{}')) and k.organization_id = v_me.organization_id
      and k.kind = 'reviewer' and k.removed_at is null
  loop
    v_secret := private.copyright_secret();
    insert into public.copyright_review_assignments (request_id, contact_id, token_hash, expires_at)
    values (p_request, v_person.id, private.copyright_hash(v_secret), now() + interval '14 days')
    on conflict (request_id, contact_id) do update
      set token_hash = excluded.token_hash, expires_at = excluded.expires_at;
    perform private.copyright_queue(p_request, v_person.email, 'review_needed',
      v_vars || jsonb_build_object('first name', split_part(v_person.name, ' ', 1)),
      '/copyright/review/' || v_secret, 'review_needed:' || p_request || ':' || v_person.id);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'reviewer_needed' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.copyright_qc_requests(text) from public;
revoke all on function public.copyright_qc_open(text, uuid) from public;
revoke all on function public.copyright_qc_decide(text, uuid, boolean, text, text) from public;
revoke all on function public.copyright_qc_send_for_review(text, uuid, uuid[], uuid[], text, text) from public;
grant execute on function public.copyright_qc_requests(text) to anon, authenticated;
grant execute on function public.copyright_qc_open(text, uuid) to anon, authenticated;
grant execute on function public.copyright_qc_decide(text, uuid, boolean, text, text) to anon, authenticated;
grant execute on function public.copyright_qc_send_for_review(text, uuid, uuid[], uuid[], text, text)
  to anon, authenticated;

-- Outside reviewers, from the private link to one request (ADD-COPY-05) -----------------------

create function private.copyright_outside_assignment(p_token text)
returns public.copyright_review_assignments
language sql
stable
security definer
set search_path = ''
as $$
  select a.*
  from public.copyright_review_assignments a
  join public.copyright_contacts k on k.id = a.contact_id and k.removed_at is null
  join public.copyright_requests r on r.id = a.request_id
  where a.token_hash = private.copyright_hash(coalesce(p_token, ''))
    and a.expires_at > now()
    and r.status = 'with_copyright_review'
    and private.copyright_on(r.organization_id)
  limit 1;
$$;

create function public.copyright_review_open(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.copyright_detail(a.request_id) || jsonb_build_object('me', k.name)
  from public.copyright_review_assignments a
  join public.copyright_contacts k on k.id = a.contact_id
  where a.id = (private.copyright_outside_assignment(p_token)).id;
$$;

create function public.copyright_review_decide(p_token text, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.copyright_review_assignments := private.copyright_outside_assignment(p_token);
  v_name text;
begin
  if v_assignment.id is null then
    raise exception 'link_expired' using errcode = '42501';
  end if;
  select k.name into v_name from public.copyright_contacts k where k.id = v_assignment.contact_id;
  perform private.copyright_finish(v_assignment.request_id, p_approve, p_note, v_name, 'reviewer', null);
end;
$$;

revoke all on function public.copyright_review_open(text) from public;
revoke all on function public.copyright_review_decide(text, boolean, text) from public;
grant execute on function public.copyright_review_open(text) to anon, authenticated;
grant execute on function public.copyright_review_decide(text, boolean, text) to anon, authenticated;

-- Academy reviewers, from Copyright in the side bar (ADD-COPY-05) -----------------------------

create function private.copyright_member_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and private.has_capability('copyright.review')
         and private.feature_enabled('copyright');
$$;

create function public.copyright_my_reviews()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.copyright_member_reviewer() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.copyright_row(r.id)
             order by (r.status in ('approved', 'declined')), r.service_day, r.created_at)
    from public.copyright_requests r
    join public.copyright_review_assignments a on a.request_id = r.id and a.user_id = (select auth.uid())
    where r.status = 'with_copyright_review' or r.decided_at > now() - interval '30 days'), '[]'::jsonb);
end;
$$;

-- How many requests are waiting for this person, for the side bar.
create function public.copyright_my_review_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.copyright_member_reviewer() then (
    select count(*)::integer
    from public.copyright_review_assignments a
    join public.copyright_requests r on r.id = a.request_id
    where a.user_id = (select auth.uid()) and r.status = 'with_copyright_review')
  else 0 end;
$$;

create function public.copyright_member_open(p_request uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.copyright_member_reviewer() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return (
    select private.copyright_detail(a.request_id)
    from public.copyright_review_assignments a
    where a.request_id = p_request and a.user_id = (select auth.uid()));
end;
$$;

create function public.copyright_member_decide(p_request uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not private.copyright_member_reviewer() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.copyright_review_assignments a
    join public.copyright_requests r on r.id = a.request_id
    where a.request_id = p_request and a.user_id = (select auth.uid())
      and r.status = 'with_copyright_review') then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  select coalesce(nullif(trim(p.display_name), ''), 'A copyright reviewer') into v_name
  from public.profiles p where p.id = (select auth.uid());
  perform private.copyright_finish(p_request, p_approve, p_note, v_name, 'reviewer', null);
end;
$$;

revoke all on function public.copyright_my_reviews() from public, anon;
revoke all on function public.copyright_my_review_count() from public, anon;
revoke all on function public.copyright_member_open(uuid) from public, anon;
revoke all on function public.copyright_member_decide(uuid, boolean, text) from public, anon;
grant execute on function public.copyright_my_reviews() to authenticated;
grant execute on function public.copyright_my_review_count() to authenticated;
grant execute on function public.copyright_member_open(uuid) to authenticated;
grant execute on function public.copyright_member_decide(uuid, boolean, text) to authenticated;

-- Cleared to show, for everyone on duty (ADD-COPY-08) -----------------------------------------

-- Approved items for services this person is scheduled on, from now until the service ends.
create function public.copyright_cleared_for_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_active_user() and private.feature_enabled('copyright') then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'eventId', e.id,
      'eventTitle', e.title,
      'startsAt', e.starts_at,
      'kind', r.kind,
      'description', r.description,
      'requesterName', trim(r.first_name || ' ' || r.last_name),
      'mediaUrl', r.media_url,
      'hasFile', r.file_path is not null,
      'decidedBy', r.decided_by_name,
      'decidedVia', r.decided_via,
      'note', r.decision_note,
      'planItemId', r.plan_item_id,
      'planItemTitle', i.title,
      'planItemPosition', i.position,
      'loadedAt', l.loaded_at
    ) order by e.starts_at, i.position nulls first, r.created_at)
    from public.copyright_requests r
    join public.events e on e.id = r.event_id and e.cancelled_at is null
    left join public.service_plan_items i on i.event_id = e.id and i.external_id = r.plan_item_id
    left join public.copyright_loaded l on l.request_id = r.id
    where r.status = 'approved'
      and e.ends_at > now() and e.starts_at < now() + interval '14 days'
      and exists (select 1 from public.event_assignments a
                  where a.event_id = e.id and a.user_id = (select auth.uid())
                    and a.cancelled_at is null and a.status <> 'declined')), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

-- Ticks an item as loaded on the day, or un-ticks it. Anyone on duty for that service may.
create function public.copyright_set_loaded(p_request uuid, p_loaded boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_active_user() and private.feature_enabled('copyright') and exists (
    select 1 from public.copyright_requests r
    join public.event_assignments a on a.event_id = r.event_id
    where r.id = p_request and r.status = 'approved' and a.user_id = (select auth.uid())
      and a.cancelled_at is null and a.status <> 'declined')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_loaded then
    insert into public.copyright_loaded (request_id, loaded_by) values (p_request, (select auth.uid()))
    on conflict (request_id) do nothing;
  else
    delete from public.copyright_loaded l where l.request_id = p_request;
  end if;
end;
$$;

revoke all on function public.copyright_cleared_for_me() from public, anon;
revoke all on function public.copyright_set_loaded(uuid, boolean) from public, anon;
grant execute on function public.copyright_cleared_for_me() to authenticated;
grant execute on function public.copyright_set_loaded(uuid, boolean) to authenticated;

-- The email job (service role only) -----------------------------------------------------------

-- Hands over emails to send, with the organisation's templates. Nothing goes while approvals are
-- switched off, and anything left waiting more than 3 days is dropped rather than sent stale.
create function public.claim_copyright_emails(p_limit integer default 50)
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
      where o.status = 'pending' and o.attempts < 3 and private.copyright_on(o.organization_id)
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

-- Records the outcome and clears the link, so the secret doesn't stay in the queue.
create function public.complete_copyright_email(p_id uuid, p_sent boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.copyright_outbox o
     set status = case when p_sent then 'sent' when o.attempts >= 3 then 'failed' else 'pending' end,
         sent_at = case when p_sent then now() else o.sent_at end,
         link = case when p_sent or o.attempts >= 3 then null else o.link end
   where o.id = p_id and o.status = 'pending';
$$;

-- Puts an email back for a later run without counting the try (Resend's limit was reached).
create function public.release_copyright_email(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.copyright_outbox o set attempts = greatest(o.attempts - 1, 0)
   where o.id = p_id and o.status = 'pending';
$$;

revoke all on function public.claim_copyright_emails(integer) from public, anon, authenticated;
revoke all on function public.complete_copyright_email(uuid, boolean) from public, anon, authenticated;
revoke all on function public.release_copyright_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_copyright_emails(integer) to service_role;
grant execute on function public.complete_copyright_email(uuid, boolean) to service_role;
grant execute on function public.release_copyright_email(uuid) to service_role;

-- Private helpers are never called directly.
revoke all on function private.copyright_on(uuid) from public, anon, authenticated;
revoke all on function private.copyright_public_org() from public, anon, authenticated;
revoke all on function private.copyright_qc_link(uuid) from public, anon, authenticated;
revoke all on function private.copyright_queue(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function private.copyright_finish(uuid, boolean, text, text, text, text) from public, anon, authenticated;
