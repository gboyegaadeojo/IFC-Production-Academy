-- New-message notifications, batched (ADD-MSG-06; docs/decisions/2026-11-08-team-messaging.md).
--
-- Never one per message: every 15 minutes the notifications job calls queue_message_notifications(),
-- which writes at most one notice per person per chat, such as "3 new messages in Camera
-- Operations". It skips muted chats, chats read since, messages under two minutes old (the person
-- may be reading them now), and anyone messaging is off for. Phone or email follows each person's
-- Messages choice, through the existing routing; on top of that, at most one message email per
-- person every 4 hours, so Resend's free plan stays for serving emails. Quiet hours and the launch
-- switch (ADD-NOTIF-02) still apply, as for every notification.

alter table public.conversation_members add column noticed_at timestamptz;

-- Everyone who can read a chat, worked out without a signed-in person, for the job. Mirrors
-- private.can_read_conversation: department members, its position teams, and message.moderate
-- holders there; everyone active for an everyone group; members otherwise.
create function private.conversation_readers(p_conversation_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.conversations where id = p_conversation_id)
  select distinct r.user_id from (
    select m.user_id from c join public.department_memberships m
      on c.kind = 'department' and m.department_id = c.department_id and m.status = 'active'
    union
    select t.user_id from c join public.serving_team_members t
      on c.kind = 'department' and t.department_id = c.department_id and t.removed_at is null
    union
    select ur.user_id from c
      join public.user_roles ur on c.kind = 'department' and ur.revoked_at is null
        and (ur.department_id is null or ur.department_id = c.department_id)
      join public.role_capabilities rc on rc.role_id = ur.role_id
      join public.capabilities cap on cap.id = rc.capability_id and cap.key = 'message.moderate'
    union
    select p.id from c join public.profiles p
      on c.kind = 'group' and c.everyone and p.organization_id = c.organization_id
    union
    select cm.user_id from c join public.conversation_members cm
      on cm.conversation_id = c.id and cm.is_member and not (c.kind = 'group' and c.everyone)
  ) r
  join public.profiles p on p.id = r.user_id and p.status = 'active';
$$;
revoke all on function private.conversation_readers(uuid) from public, anon, authenticated;

create function public.queue_message_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_notice uuid;
  v_title text;
  v_preview text;
begin
  for v_row in
    select c.id as conversation_id, c.kind, r.user_id,
      coalesce(c.title, d.name, 'a direct message') as chat_name,
      count(m.id)::integer as unread,
      max(m.created_at) as newest,
      (array_agg(m.id order by m.created_at desc))[1] as last_id
    from public.conversations c
    join public.feature_flags f on f.organization_id = c.organization_id and f.key = 'messaging' and f.enabled
    left join public.departments d on d.id = c.department_id
    cross join lateral private.conversation_readers(c.id) r
    left join public.conversation_members me on me.conversation_id = c.id and me.user_id = r.user_id
    join public.messages m on m.conversation_id = c.id
      and m.deleted_at is null
      and m.sender_id is distinct from r.user_id
      and m.created_at < now() - interval '2 minutes'
      and m.created_at > greatest(
        coalesce(me.last_read_at, '-infinity'),
        coalesce(me.noticed_at, '-infinity'),
        now() - interval '1 day')
    where c.last_message_at > now() - interval '1 day'
      and not coalesce(me.muted, false)
    group by c.id, c.kind, r.user_id, c.title, d.name
  loop
    select
      coalesce(split_part(p.display_name, ' ', 1), 'Someone') || ': ' ||
        coalesce(nullif(left(regexp_replace(m.body, '\s+', ' ', 'g'), 140), ''),
          (select case min(a.kind) when 'photo' then 'Photo' when 'gif' then 'GIF' when 'document' then 'Document' end
             from public.message_attachments a where a.message_id = m.id), 'New message')
    into v_preview
    from public.messages m left join public.profiles p on p.id = m.sender_id
    where m.id = v_row.last_id;

    if v_row.kind = 'direct' then
      select 'New message' || case when v_row.unread > 1 then 's' else '' end || ' from ' || p.display_name
        into v_title
        from public.messages m join public.profiles p on p.id = m.sender_id
        where m.id = v_row.last_id;
      -- A direct message shows only who it's from, not the words, in case the phone is seen by others.
      v_preview := 'Open Messages to read ' || case when v_row.unread > 1 then 'them' else 'it' end || '.';
    else
      v_title := v_row.unread || ' new message' || case when v_row.unread > 1 then 's' else '' end
        || ' in ' || v_row.chat_name;
    end if;

    perform private.notify(v_row.user_id, 'message', coalesce(v_title, 'New messages'), v_preview,
      '/messages/' || v_row.conversation_id,
      'messages:' || v_row.conversation_id || ':' || v_row.user_id || ':'
        || extract(epoch from v_row.newest)::bigint);

    -- At most one message email every 4 hours; the app and phone still show each batch.
    select n.id into v_notice from public.notifications n
     where n.dedupe_key = 'messages:' || v_row.conversation_id || ':' || v_row.user_id || ':'
       || extract(epoch from v_row.newest)::bigint;
    if v_notice is not null and exists (
      select 1 from public.notifications other
      where other.user_id = v_row.user_id and other.kind = 'message' and other.id <> v_notice
        and other.email_status in ('pending', 'sent')
        and other.created_at > now() - interval '4 hours') then
      update public.notifications set email_status = 'skipped'
       where id = v_notice and email_status = 'pending';
    end if;

    insert into public.conversation_members (conversation_id, user_id, noticed_at)
    values (v_row.conversation_id, v_row.user_id, v_row.newest)
    on conflict (conversation_id, user_id) do update set noticed_at = excluded.noticed_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.queue_message_notifications() from public, anon, authenticated;
grant execute on function public.queue_message_notifications() to service_role;
