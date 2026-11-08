-- Team messaging, the database (ADD-MSG-01 to 03 and 07; docs/decisions/2026-11-08-team-messaging.md).
--
-- Three kinds of chat:
--   department: one per active department (not topics such as General). Seen by its active members, the people on its position
--               teams, and people with message.moderate there. Membership changes apply at once,
--               because access is worked out each time rather than copied into member lists.
--   group:      made by people with message.group_create. Either chosen people (rows in
--               conversation_members) or everyone active in the Academy, kept up to date.
--   direct:     exactly two people. The Production Director and Platform Admins can open one for
--               safety only through review_direct_conversation(), which audits every opening.
--
-- Everything is refused while the messaging flag is off (ADD-FLAG-01). People never write to these
-- tables directly: the functions below check membership and capabilities, and audit deletions.
-- Photos (message_attachments) are written by the photos step; the table and its policy are here.

insert into public.capabilities (key, description) values
  ('message.moderate', 'Delete any message in a department''s chat, or in any group chat when held church-wide'),
  ('message.review', 'Open direct messages for safety, with every opening audited'),
  ('message.group_create', 'Make group chats, including one for everyone in the Academy')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where (r.key in ('department_leader', 'production_director', 'platform_admin')
       and c.key in ('message.moderate', 'message.group_create'))
   or (r.key in ('production_director', 'platform_admin') and c.key = 'message.review')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind text not null check (kind in ('department', 'group', 'direct')),
  department_id uuid references public.departments (id) on delete restrict,
  title text check (title is null or length(trim(title)) between 1 and 60),
  everyone boolean not null default false,
  -- For direct messages: the two people's ids in order, so a pair has one conversation.
  direct_key text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind = 'department') = (department_id is not null)),
  check ((kind = 'group') = (title is not null)),
  check ((kind = 'direct') = (direct_key is not null)),
  check (not everyone or kind = 'group')
);
create unique index conversations_department_idx on public.conversations (department_id)
  where kind = 'department';
create index conversations_organization_idx on public.conversations (organization_id);

-- Direct and chosen-group members, and everyone's read position. In department and everyone chats a
-- row only holds the read position and mute: access doesn't depend on it.
create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  is_member boolean not null default false,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  sender_id uuid references public.profiles (id) on delete set null,
  -- Made by the sender's device, so a retried send never posts twice (SRS-PROG-004).
  client_id uuid not null,
  body text check (body is null or length(body) between 1 and 4000),
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  unique (sender_id, client_id),
  check (deleted_at is null or body is null)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete restrict,
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  full_path text not null,
  thumb_path text not null,
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  bytes integer not null check (bytes between 1 and 2000000),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index message_attachments_message_idx on public.message_attachments (message_id);

-- ---------------------------------------------------------------------------
-- Who can read a chat
-- ---------------------------------------------------------------------------

create function private.can_read_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conversation public.conversations;
begin
  if v_me is null or not private.is_active_user() or not private.feature_enabled('messaging') then
    return false;
  end if;
  select * into v_conversation from public.conversations c
   where c.id = p_conversation_id and c.organization_id = private.current_organization_id();
  if not found then
    return false;
  end if;
  if v_conversation.kind = 'department' then
    return exists (
        select 1 from public.department_memberships m
        where m.department_id = v_conversation.department_id and m.user_id = v_me and m.status = 'active')
      or exists (
        select 1 from public.serving_team_members t
        where t.department_id = v_conversation.department_id and t.user_id = v_me and t.removed_at is null)
      or private.has_capability('message.moderate', v_conversation.department_id);
  end if;
  if v_conversation.kind = 'group' and v_conversation.everyone then
    return true;
  end if;
  return exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = v_me and cm.is_member);
end;
$$;
revoke all on function private.can_read_conversation(uuid) from public, anon;
grant execute on function private.can_read_conversation(uuid) to authenticated;

-- Deny by default (SRS-RBAC-004): reading only, and only your own chats. No direct writes.
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

create policy "People read their own chats" on public.conversations
  for select to authenticated using (private.can_read_conversation(id));
create policy "People read who's in their chats" on public.conversation_members
  for select to authenticated using (private.can_read_conversation(conversation_id));
create policy "People read messages in their chats" on public.messages
  for select to authenticated using (private.can_read_conversation(conversation_id));
create policy "People read photos in their chats" on public.message_attachments
  for select to authenticated using (private.can_read_conversation(conversation_id));

grant select on public.conversations, public.conversation_members, public.messages,
  public.message_attachments to authenticated;

-- Live updates for the open chat (Supabase Realtime checks the policy above for each person).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Department chats: one for each active department, made automatically
-- ---------------------------------------------------------------------------

create function private.ensure_department_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and new.kind = 'team' then
    insert into public.conversations (organization_id, kind, department_id)
    values (new.organization_id, 'department', new.id)
    on conflict (department_id) where kind = 'department' do nothing;
  end if;
  return null;
end;
$$;
revoke all on function private.ensure_department_conversation() from public, anon, authenticated;
create trigger departments_conversation after insert or update of status, kind on public.departments
  for each row execute function private.ensure_department_conversation();

insert into public.conversations (organization_id, kind, department_id)
select d.organization_id, 'department', d.id
from public.departments d
where d.status = 'active' and d.kind = 'team'
on conflict (department_id) where kind = 'department' do nothing;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create function private.require_messaging()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not private.feature_enabled('messaging') then
    raise exception 'messaging_off' using errcode = 'P0001';
  end if;
  return (select auth.uid());
end;
$$;
revoke all on function private.require_messaging() from public, anon;
grant execute on function private.require_messaging() to authenticated;

-- Sends a message. Safe to retry with the same client id: the first message is returned.
create function public.send_message(
  p_conversation_id uuid, p_client_id uuid, p_body text, p_reply_to uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
  v_body text := nullif(trim(p_body), '');
  v_id uuid;
begin
  if not private.can_read_conversation(p_conversation_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select m.id into v_id from public.messages m where m.sender_id = v_me and m.client_id = p_client_id;
  if v_id is not null then
    return v_id;
  end if;
  if v_body is null or length(v_body) > 4000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public.messages r where r.id = p_reply_to and r.conversation_id = p_conversation_id) then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  insert into public.messages (conversation_id, sender_id, client_id, body, reply_to)
  values (p_conversation_id, v_me, p_client_id, v_body, p_reply_to)
  on conflict (sender_id, client_id) do nothing
  returning id into v_id;
  if v_id is null then
    select m.id into v_id from public.messages m where m.sender_id = v_me and m.client_id = p_client_id;
    return v_id;
  end if;
  update public.conversations set last_message_at = now() where id = p_conversation_id;
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (p_conversation_id, v_me, now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
  return v_id;
end;
$$;
revoke all on function public.send_message(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.send_message(uuid, uuid, text, uuid) to authenticated;

-- Deletes a message: the sender always; message.moderate in a department's chat; in a group, the
-- person who made it or a church-wide message.moderate holder. Nobody deletes others' direct
-- messages. The text goes, photos are marked for removal, and the audit event says who and when,
-- never what it said (ADD-MSG-02, SRS-AUDIT-001).
create function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
  v_message public.messages;
  v_conversation public.conversations;
begin
  select * into v_message from public.messages m where m.id = p_message_id;
  if not found or not private.can_read_conversation(v_message.conversation_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_message.deleted_at is not null then
    return;
  end if;
  select * into v_conversation from public.conversations c where c.id = v_message.conversation_id;
  if not (
    v_message.sender_id = v_me
    or (v_conversation.kind = 'department'
        and private.has_capability('message.moderate', v_conversation.department_id))
    or (v_conversation.kind = 'group'
        and (v_conversation.created_by = v_me or private.has_capability('message.moderate')))
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.messages set body = null, deleted_at = now(), deleted_by = v_me where id = p_message_id;
  update public.message_attachments set removed_at = now()
   where message_id = p_message_id and removed_at is null;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, department_id, metadata)
  values (v_conversation.organization_id, v_me, 'message.deleted', 'messages', p_message_id,
    v_conversation.department_id,
    jsonb_build_object('conversation_id', v_conversation.id, 'kind', v_conversation.kind,
      'own_message', v_message.sender_id = v_me));
end;
$$;
revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;

-- Opens, or makes, the direct conversation with someone active. One per pair.
create function public.start_direct_conversation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
  v_key text;
  v_id uuid;
begin
  if p_user_id = v_me or not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status = 'active'
      and p.organization_id = private.current_organization_id()) then
    raise exception 'person_not_available' using errcode = 'P0001';
  end if;
  v_key := least(v_me::text, p_user_id::text) || ':' || greatest(v_me::text, p_user_id::text);
  insert into public.conversations (organization_id, kind, direct_key, created_by)
  values (private.current_organization_id(), 'direct', v_key, v_me)
  on conflict (direct_key) do nothing
  returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c where c.direct_key = v_key;
    return v_id;
  end if;
  insert into public.conversation_members (conversation_id, user_id, is_member, added_by)
  values (v_id, v_me, true, v_me), (v_id, p_user_id, true, v_me);
  return v_id;
end;
$$;
revoke all on function public.start_direct_conversation(uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

-- Makes a group chat for chosen people, or for everyone in the Academy (ADD-MSG-07). Audited.
create function public.create_group_conversation(p_title text, p_everyone boolean, p_user_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
  v_title text := trim(p_title);
  v_id uuid;
  v_count integer;
begin
  if not private.has_capability_anywhere('message.group_create') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_title is null or length(v_title) not between 1 and 60 then
    raise exception 'invalid_title' using errcode = 'P0001';
  end if;
  insert into public.conversations (organization_id, kind, title, everyone, created_by)
  values (private.current_organization_id(), 'group', v_title, coalesce(p_everyone, false), v_me)
  returning id into v_id;
  insert into public.conversation_members (conversation_id, user_id, is_member, added_by)
  values (v_id, v_me, true, v_me);
  if not coalesce(p_everyone, false) then
    insert into public.conversation_members (conversation_id, user_id, is_member, added_by)
    select v_id, p.id, true, v_me
    from public.profiles p
    where p.id = any (coalesce(p_user_ids, '{}')) and p.id <> v_me and p.status = 'active'
      and p.organization_id = private.current_organization_id()
    on conflict do nothing;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception 'no_members' using errcode = 'P0001';
    end if;
  end if;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (private.current_organization_id(), v_me, 'conversation.created', 'conversations', v_id,
    jsonb_build_object('kind', 'group', 'everyone', coalesce(p_everyone, false),
      'members', case when coalesce(p_everyone, false) then null else v_count + 1 end));
  return v_id;
end;
$$;
revoke all on function public.create_group_conversation(text, boolean, uuid[]) from public, anon;
grant execute on function public.create_group_conversation(text, boolean, uuid[]) to authenticated;

-- Renames a group: the person who made it, or a church-wide message.moderate holder. Audited.
create function public.rename_group_conversation(p_conversation_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
  v_title text := trim(p_title);
  v_conversation public.conversations;
begin
  select * into v_conversation from public.conversations c
   where c.id = p_conversation_id and c.kind = 'group'
     and c.organization_id = private.current_organization_id();
  if not found or not (v_conversation.created_by = v_me or private.has_capability('message.moderate')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_title is null or length(v_title) not between 1 and 60 then
    raise exception 'invalid_title' using errcode = 'P0001';
  end if;
  if v_title = v_conversation.title then
    return;
  end if;
  update public.conversations set title = v_title where id = p_conversation_id;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (v_conversation.organization_id, v_me, 'conversation.renamed', 'conversations', p_conversation_id,
    jsonb_build_object('kind', 'group'));
end;
$$;
revoke all on function public.rename_group_conversation(uuid, text) from public, anon;
grant execute on function public.rename_group_conversation(uuid, text) to authenticated;

-- Marks a chat read up to now. Safe to repeat.
create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
begin
  if not private.can_read_conversation(p_conversation_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (p_conversation_id, v_me, now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
end;
$$;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Mutes or unmutes a chat for the signed-in person (notifications use it).
create function public.set_conversation_muted(p_conversation_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
begin
  if not private.can_read_conversation(p_conversation_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.conversation_members (conversation_id, user_id, muted)
  values (p_conversation_id, v_me, p_muted)
  on conflict (conversation_id, user_id) do update set muted = p_muted;
end;
$$;
revoke all on function public.set_conversation_muted(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;

-- The chat list: every chat the person can read, with its last message and unread count. Someone
-- new to a busy chat counts at most the last 7 days as unread.
create function public.my_conversations()
returns table (
  id uuid, kind text, title text, department_id uuid, everyone boolean, other_user_id uuid,
  last_message_at timestamptz, last_body text, last_sender_id uuid, last_deleted boolean,
  unread_count integer, muted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.*
    from public.conversations c
    where c.organization_id = private.current_organization_id()
      and private.can_read_conversation(c.id)
  )
  select c.id, c.kind, c.title, c.department_id, c.everyone,
    case when c.kind = 'direct' then (
      select cm.user_id from public.conversation_members cm
      where cm.conversation_id = c.id and cm.is_member and cm.user_id <> (select auth.uid()) limit 1)
    end,
    c.last_message_at, last.body, last.sender_id, last.deleted_at is not null,
    (select count(*)::integer from public.messages m
      where m.conversation_id = c.id and m.deleted_at is null
        and m.sender_id is distinct from (select auth.uid())
        and m.created_at > coalesce(me.last_read_at, now() - interval '7 days')),
    coalesce(me.muted, false)
  from mine c
  left join public.conversation_members me on me.conversation_id = c.id and me.user_id = (select auth.uid())
  left join lateral (
    select m.body, m.sender_id, m.deleted_at from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1) last on true
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;
revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- Opens a direct conversation for safety (G, 2026-11-08). message.review church-wide only. Every
-- opening writes an audit event with who opened which conversation, never the messages.
create function public.review_direct_conversation(p_conversation_id uuid)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz, deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
begin
  if not private.has_capability('message.review') or not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.kind = 'direct'
      and c.organization_id = private.current_organization_id()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (private.current_organization_id(), v_me, 'direct_messages.reviewed', 'conversations',
    p_conversation_id, '{}'::jsonb);
  return query
    select m.id, m.sender_id, m.body, m.created_at, m.deleted_at
    from public.messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at;
end;
$$;
revoke all on function public.review_direct_conversation(uuid) from public, anon;
grant execute on function public.review_direct_conversation(uuid) to authenticated;
