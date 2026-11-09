-- Photos, GIFs and documents in chats (ADD-MSG-04, 08, 09; docs/decisions/2026-11-08-team-messaging.md).
--
-- Photos are made smaller in the browser (at most 1,600 px, WebP or JPEG) with a small thumbnail.
-- Documents are PDF, Word, Excel, PowerPoint or plain text, up to 10 MB. Both go in the private
-- chat-files bucket, under the chat's id, and open through one-minute signed links for people who
-- can read the chat. GIFs are GIPHY's id and address, not files, so they use no storage. Files are
-- removed after 90 days by the cleanup job, which comes in a later step.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 10485760, array[
  'image/webp', 'image/jpeg',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first part of each path is the chat it belongs to: only people who can read that chat
-- upload into it or open its files. Nobody deletes through the API; the cleanup job does.
create function private.chat_file_conversation(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid end;
$$;

create policy "Chat files: upload into your chats"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files'
    and private.can_read_conversation(private.chat_file_conversation(name)));
create policy "Chat files: open in your chats"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-files'
    and private.can_read_conversation(private.chat_file_conversation(name)));

-- ---------------------------------------------------------------------------
-- Kinds of attachment
-- ---------------------------------------------------------------------------

alter table public.message_attachments
  add column kind text not null default 'photo' check (kind in ('photo', 'document', 'gif')),
  add column file_name text check (file_name is null or length(file_name) between 1 and 200),
  add column mime_type text,
  add column gif_id text check (gif_id is null or gif_id ~ '^[A-Za-z0-9]{1,64}$'),
  add column gif_url text check (gif_url is null or gif_url ~ '^https://media[0-9]*\.giphy\.com/'),
  alter column full_path drop not null,
  alter column thumb_path drop not null,
  alter column width drop not null,
  alter column height drop not null,
  alter column bytes drop not null,
  drop constraint message_attachments_bytes_check,
  add constraint message_attachments_bytes_check check (bytes is null or bytes between 1 and 10485760),
  add constraint message_attachments_kind_fields_check check (
    case kind
      when 'photo' then full_path is not null and thumb_path is not null and width is not null and height is not null
      when 'document' then full_path is not null and file_name is not null and mime_type is not null
      else gif_url is not null and gif_id is not null
    end);
create unique index message_attachments_full_path_idx on public.message_attachments (full_path)
  where full_path is not null;

-- ---------------------------------------------------------------------------
-- Sending with attachments
-- ---------------------------------------------------------------------------

drop function public.send_message(uuid, uuid, text, uuid);

-- Up to 4 photos, or one document, or one GIF, with or without words. Files must already be in the
-- chat's folder and not used by another message. Safe to retry with the same client id.
create function public.send_message(
  p_conversation_id uuid, p_client_id uuid, p_body text, p_reply_to uuid default null,
  p_attachments jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_messaging();
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_items jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_count integer;
  v_kinds text[];
  v_item jsonb;
  v_prefix text := p_conversation_id::text || '/';
  v_id uuid;
begin
  if not private.can_read_conversation(p_conversation_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select m.id into v_id from public.messages m where m.sender_id = v_me and m.client_id = p_client_id;
  if v_id is not null then
    return v_id;
  end if;
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(v_items);
  select coalesce(array_agg(distinct i ->> 'kind'), '{}') into v_kinds from jsonb_array_elements(v_items) i;
  if (v_body is null and v_count = 0) or length(coalesce(v_body, '')) > 4000
     or v_count > 4 or cardinality(v_kinds) > 1
     or (v_count > 1 and v_kinds <> array['photo']) then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(v_items) loop
    if v_item ->> 'kind' = 'photo' then
      if not (coalesce(v_item ->> 'full_path', '') like v_prefix || '%'
              and coalesce(v_item ->> 'thumb_path', '') like v_prefix || '%')
         or coalesce((v_item ->> 'width')::integer, 0) not between 1 and 1600
         or coalesce((v_item ->> 'height')::integer, 0) not between 1 and 1600 then
        raise exception 'invalid_attachment' using errcode = 'P0001';
      end if;
    elsif v_item ->> 'kind' = 'document' then
      if not (coalesce(v_item ->> 'full_path', '') like v_prefix || '%')
         or coalesce(trim(v_item ->> 'file_name'), '') = ''
         or coalesce(v_item ->> 'mime_type', '') not in (
           'application/pdf', 'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
           'application/vnd.ms-powerpoint',
           'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain') then
        raise exception 'invalid_attachment' using errcode = 'P0001';
      end if;
    elsif coalesce(v_item ->> 'kind', '') <> 'gif'
       or coalesce(v_item ->> 'gif_id', '') !~ '^[A-Za-z0-9]{1,64}$'
       or coalesce(v_item ->> 'gif_url', '') !~ '^https://media[0-9]*\.giphy\.com/' then
      raise exception 'invalid_attachment' using errcode = 'P0001';
    end if;
    -- Files must be in storage, in this chat, and not already sent.
    if v_item ->> 'kind' <> 'gif' and (
      exists (select 1 from public.message_attachments a
              where a.full_path in (v_item ->> 'full_path', v_item ->> 'thumb_path')
                 or a.thumb_path in (v_item ->> 'full_path', v_item ->> 'thumb_path'))
      or not exists (select 1 from storage.objects o
                     where o.bucket_id = 'chat-files' and o.name = v_item ->> 'full_path')
      or (v_item ->> 'kind' = 'photo' and not exists (
            select 1 from storage.objects o
            where o.bucket_id = 'chat-files' and o.name = v_item ->> 'thumb_path'))) then
      raise exception 'invalid_attachment' using errcode = 'P0001';
    end if;
  end loop;
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
  insert into public.message_attachments
    (message_id, conversation_id, kind, full_path, thumb_path, width, height, bytes, file_name,
     mime_type, gif_id, gif_url)
  select v_id, p_conversation_id, i ->> 'kind', i ->> 'full_path', i ->> 'thumb_path',
    (i ->> 'width')::integer, (i ->> 'height')::integer, (i ->> 'bytes')::integer,
    left(i ->> 'file_name', 200), i ->> 'mime_type', i ->> 'gif_id', i ->> 'gif_url'
  from jsonb_array_elements(v_items) i;

  update public.conversations set last_message_at = now() where id = p_conversation_id;
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (p_conversation_id, v_me, now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
  return v_id;
end;
$$;
revoke all on function public.send_message(uuid, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.send_message(uuid, uuid, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading attachments
-- ---------------------------------------------------------------------------

drop function public.conversation_messages(uuid, timestamptz, integer);

create function public.conversation_messages(
  p_conversation_id uuid, p_after timestamptz default null, p_limit integer default 60)
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
      and (p_after is null or m.created_at > p_after or m.deleted_at > p_after)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) latest
  order by latest.created_at;
$$;
revoke all on function public.conversation_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.conversation_messages(uuid, timestamptz, integer) to authenticated;

drop function public.my_conversations();

-- As in 20270111120000_messaging_reads.sql, plus what the last message carried, for "Photo".
create function public.my_conversations()
returns table (
  id uuid, kind text, title text, department_id uuid, department_hue text, department_icon text,
  everyone boolean, other_user_id uuid, other_name text,
  last_message_at timestamptz, last_body text, last_sender_name text, last_mine boolean,
  last_deleted boolean, last_attachment_kind text, last_attachment_count integer,
  unread_count integer, muted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.*,
      case when c.kind = 'direct' then (
        select cm.user_id from public.conversation_members cm
        where cm.conversation_id = c.id and cm.is_member and cm.user_id <> (select auth.uid()) limit 1)
      end as other_id
    from public.conversations c
    where c.organization_id = private.current_organization_id()
      and private.can_read_conversation(c.id)
  )
  select c.id, c.kind,
    coalesce(c.title, d.name, other.display_name, 'Direct message'),
    c.department_id, d.hue, d.icon, c.everyone, c.other_id, other.display_name,
    c.last_message_at, last.body, sender.display_name, last.sender_id = (select auth.uid()),
    last.deleted_at is not null, files.kind, coalesce(files.count, 0),
    (select count(*)::integer from public.messages m
      where m.conversation_id = c.id and m.deleted_at is null
        and m.sender_id is distinct from (select auth.uid())
        and m.created_at > coalesce(me.last_read_at, now() - interval '7 days')),
    coalesce(me.muted, false)
  from mine c
  left join public.departments d on d.id = c.department_id
  left join public.profiles other on other.id = c.other_id
  left join public.conversation_members me on me.conversation_id = c.id and me.user_id = (select auth.uid())
  left join lateral (
    select m.id, m.body, m.sender_id, m.deleted_at from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1) last on true
  left join lateral (
    select min(a.kind) as kind, count(*)::integer as count from public.message_attachments a
    where a.message_id = last.id) files on true
  left join public.profiles sender on sender.id = last.sender_id
  order by (c.kind = 'group' and c.everyone) desc, coalesce(c.last_message_at, c.created_at) desc;
$$;
revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;
