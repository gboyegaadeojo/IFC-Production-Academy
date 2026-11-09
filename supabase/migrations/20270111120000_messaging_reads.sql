-- What the Messages screens read (ADD-MSG-01 to 03, 07). Names aren't readable from profiles by
-- everyone, so these functions return them, only for chats the person can read, and only
-- display names: never emails or anything else.

-- Whether someone leads the department a chat belongs to, or the whole ministry: shown as "Leader".
create function private.is_chat_leader(p_user_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and ur.revoked_at is null
      and (r.key in ('production_director', 'platform_admin')
           or (r.key = 'department_leader' and ur.department_id = p_department_id)));
$$;
revoke all on function private.is_chat_leader(uuid, uuid) from public, anon;
grant execute on function private.is_chat_leader(uuid, uuid) to authenticated;

drop function public.my_conversations();

-- The chat list, with what each row shows.
create function public.my_conversations()
returns table (
  id uuid, kind text, title text, department_id uuid, department_hue text, department_icon text,
  everyone boolean, other_user_id uuid, other_name text,
  last_message_at timestamptz, last_body text, last_sender_name text, last_mine boolean,
  last_deleted boolean, unread_count integer, muted boolean)
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
    last.deleted_at is not null,
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
    select m.body, m.sender_id, m.deleted_at from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1) last on true
  left join public.profiles sender on sender.id = last.sender_id
  order by (c.kind = 'group' and c.everyone) desc, coalesce(c.last_message_at, c.created_at) desc;
$$;
revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- One chat's header and what the person may do in it.
create function public.conversation_details(p_conversation_id uuid)
returns table (
  id uuid, kind text, title text, department_id uuid, department_hue text, department_icon text,
  everyone boolean, other_name text, member_count integer, can_moderate boolean, can_rename boolean,
  muted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.kind, coalesce(c.title, d.name, other.display_name, 'Direct message'),
    c.department_id, d.hue, d.icon, c.everyone, other.display_name,
    case
      when c.kind = 'department' then (
        select count(distinct u)::integer from (
          select m.user_id as u from public.department_memberships m
            join public.profiles p on p.id = m.user_id and p.status = 'active'
            where m.department_id = c.department_id and m.status = 'active'
          union
          select t.user_id from public.serving_team_members t
            join public.profiles p on p.id = t.user_id and p.status = 'active'
            where t.department_id = c.department_id and t.removed_at is null) people)
      when c.everyone then (
        select count(*)::integer from public.profiles p
        where p.organization_id = c.organization_id and p.status = 'active')
      else (select count(*)::integer from public.conversation_members cm
            where cm.conversation_id = c.id and cm.is_member)
    end,
    case
      when c.kind = 'department' then private.has_capability('message.moderate', c.department_id)
      when c.kind = 'group' then c.created_by = (select auth.uid()) or private.has_capability('message.moderate')
      else false
    end,
    c.kind = 'group' and (c.created_by = (select auth.uid()) or private.has_capability('message.moderate')),
    coalesce(me.muted, false)
  from public.conversations c
  left join public.departments d on d.id = c.department_id
  left join lateral (
    select p.display_name from public.conversation_members cm join public.profiles p on p.id = cm.user_id
    where c.kind = 'direct' and cm.conversation_id = c.id and cm.is_member
      and cm.user_id <> (select auth.uid()) limit 1) other on true
  left join public.conversation_members me on me.conversation_id = c.id and me.user_id = (select auth.uid())
  where c.id = p_conversation_id and private.can_read_conversation(c.id);
$$;
revoke all on function public.conversation_details(uuid) from public, anon;
grant execute on function public.conversation_details(uuid) to authenticated;

-- Messages in a chat, oldest first: the latest p_limit, or those after p_after (live updates).
create function public.conversation_messages(
  p_conversation_id uuid, p_after timestamptz default null, p_limit integer default 60)
returns table (
  id uuid, sender_id uuid, sender_name text, sender_is_leader boolean, body text,
  reply_to uuid, reply_sender_name text, reply_body text,
  created_at timestamptz, deleted_at timestamptz, deleted_by_other boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select m.id, m.sender_id, sender.display_name,
      private.is_chat_leader(m.sender_id, c.department_id),
      m.body, m.reply_to, reply_sender.display_name, reply.body,
      m.created_at, m.deleted_at, m.deleted_by is distinct from m.sender_id
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

-- People to start a direct message with, or add to a group: everyone active but you. Names and
-- one department each, only while messaging is on.
create function public.messaging_people()
returns table (user_id uuid, display_name text, department_name text, department_hue text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, d.name, d.hue
  from public.profiles p
  left join lateral (
    select dep.name, dep.hue from public.department_memberships m
    join public.departments dep on dep.id = m.department_id
    where m.user_id = p.id and m.status = 'active'
    order by dep.sort_order limit 1) d on true
  where p.organization_id = private.current_organization_id()
    and p.status = 'active'
    and p.id <> (select auth.uid())
    and private.is_active_user()
    and private.feature_enabled('messaging')
  order by p.display_name
  limit 1000;
$$;
revoke all on function public.messaging_people() from public, anon;
grant execute on function public.messaging_people() to authenticated;
