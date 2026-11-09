-- Messaging polish (ADD-MSG-01, 03, 07; docs/decisions/2026-11-08-team-messaging.md): earlier
-- messages, who's in a chat, and changing who's in a group chat of chosen people.

-- Messages before a time, newest p_limit of them, oldest first: "Show earlier messages".
create function public.conversation_messages_before(
  p_conversation_id uuid, p_before timestamptz, p_limit integer default 60)
returns table (
  id uuid, sender_id uuid, sender_name text, sender_is_leader boolean, body text,
  reply_to uuid, reply_sender_name text, reply_body text,
  created_at timestamptz, deleted_at timestamptz, deleted_by_other boolean, attachments jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select m.id, m.sender_id, sender.display_name,
      private.is_chat_leader(m.sender_id, c.department_id),
      m.body, m.reply_to, reply_sender.display_name, reply.body,
      m.created_at, m.deleted_at, m.deleted_by is distinct from m.sender_id,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'kind', a.kind, 'removed', a.removed_at is not null,
          'full_path', case when a.removed_at is null then a.full_path end,
          'thumb_path', case when a.removed_at is null then a.thumb_path end,
          'gif_url', case when a.removed_at is null then a.gif_url end,
          'width', a.width, 'height', a.height, 'bytes', a.bytes,
          'file_name', a.file_name, 'mime_type', a.mime_type) order by a.created_at, a.id)
        from public.message_attachments a where a.message_id = m.id), '[]'::jsonb)
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    left join public.profiles sender on sender.id = m.sender_id
    left join public.messages reply on reply.id = m.reply_to
    left join public.profiles reply_sender on reply_sender.id = reply.sender_id
    where m.conversation_id = p_conversation_id
      and private.can_read_conversation(p_conversation_id)
      and m.created_at < p_before
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) earlier
  order by earlier.created_at;
$$;
revoke all on function public.conversation_messages_before(uuid, timestamptz, integer) from public, anon;
grant execute on function public.conversation_messages_before(uuid, timestamptz, integer) to authenticated;

-- Who's in a chat: names only, for people who can read it.
create function public.conversation_people(p_conversation_id uuid)
returns table (user_id uuid, display_name text, is_leader boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name,
    private.is_chat_leader(p.id, (select c.department_id from public.conversations c where c.id = p_conversation_id))
  from private.conversation_readers(p_conversation_id) r
  join public.profiles p on p.id = r.user_id
  where private.can_read_conversation(p_conversation_id)
  order by p.display_name
  limit 1000;
$$;
revoke all on function public.conversation_people(uuid) from public, anon;
grant execute on function public.conversation_people(uuid) to authenticated;

-- Whether the caller may change who's in a group of chosen people: its maker, or a church-wide
-- message.moderate holder. Not for everyone chats, which keep themselves up to date.
create function private.can_manage_group(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.kind = 'group' and not c.everyone
      and c.organization_id = private.current_organization_id()
      and (c.created_by = (select auth.uid()) or private.has_capability('message.moderate')));
$$;
revoke all on function private.can_manage_group(uuid) from public, anon;
grant execute on function private.can_manage_group(uuid) to authenticated;

-- Adds active people to a group of chosen people. Audited with how many, not who.
create function public.add_group_members(p_conversation_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
  v_count integer;
begin
  if not private.can_manage_group(p_conversation_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.conversation_members (conversation_id, user_id, is_member, added_by)
  select p_conversation_id, p.id, true, v_me
  from public.profiles p
  where p.id = any (coalesce(p_user_ids, '{}')) and p.status = 'active'
    and p.organization_id = private.current_organization_id()
  on conflict (conversation_id, user_id) do update
    set is_member = true, added_by = excluded.added_by, added_at = now()
    where not public.conversation_members.is_member;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
    values (private.current_organization_id(), v_me, 'conversation.members_added', 'conversations',
      p_conversation_id, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;
revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

-- Takes someone out of a group of chosen people. They can't read it from then on. Audited.
create function public.remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
begin
  if not private.can_manage_group(p_conversation_id) or p_user_id = v_me then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.conversation_members set is_member = false
   where conversation_id = p_conversation_id and user_id = p_user_id and is_member;
  if found then
    insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
    values (private.current_organization_id(), v_me, 'conversation.member_removed', 'conversations',
      p_conversation_id, jsonb_build_object('user_id', p_user_id));
  end if;
end;
$$;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- Leaves a group of chosen people. Audited.
create function public.leave_group(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
begin
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.kind = 'group' and not c.everyone) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.conversation_members set is_member = false
   where conversation_id = p_conversation_id and user_id = v_me and is_member;
  if found then
    insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
    values (private.current_organization_id(), v_me, 'conversation.left', 'conversations',
      p_conversation_id, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;
