-- Chat cleanup and storage use (ADD-MSG-05; docs/decisions/2026-11-08-team-messaging.md). Chat
-- photos and documents are removed after 90 days, and message text after 3 years, so the Academy
-- stays inside the free plan. Admins change both on Admin -> Features. A daily GitHub Actions job
-- (chat-cleanup.yml) does the removing with the service role; these functions are only for it.

alter table public.organizations
  add column chat_file_days integer not null default 90 check (chat_file_days between 30 and 365),
  add column message_text_years integer not null default 3 check (message_text_years between 1 and 10);

-- When the stored files were actually removed, as opposed to marked for removal.
alter table public.message_attachments add column files_deleted_at timestamptz;

-- What everyone signed in sees about how long things are kept, for the guide and settings.
create function public.messaging_settings()
returns table (chat_file_days integer, message_text_years integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.chat_file_days, o.message_text_years
  from public.organizations o
  where o.id = private.current_organization_id() and private.is_active_user();
$$;
revoke all on function public.messaging_settings() from public, anon;
grant execute on function public.messaging_settings() to authenticated;

-- Platform Admins change how long chat files and text are kept. organizations' audit trigger
-- records each change.
create function public.set_messaging_retention(p_file_days integer, p_text_years integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_active_user() and private.has_capability('feature.manage')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_file_days not between 30 and 365 or p_text_years not between 1 and 10 then
    raise exception 'invalid_retention' using errcode = 'P0001';
  end if;
  update public.organizations o
     set chat_file_days = p_file_days, message_text_years = p_text_years
   where o.id = private.current_organization_id()
     and (o.chat_file_days, o.message_text_years) is distinct from (p_file_days, p_text_years);
end;
$$;
revoke all on function public.set_messaging_retention(integer, integer) from public, anon;
grant execute on function public.set_messaging_retention(integer, integer) to authenticated;

-- Files to remove: those of deleted messages, and any older than the organization's limit. GIFs
-- are GIPHY's, not ours, so they're never in this list.
create function public.chat_files_to_delete(p_limit integer default 500)
returns table (id uuid, full_path text, thumb_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.full_path, a.thumb_path
  from public.message_attachments a
  join public.conversations c on c.id = a.conversation_id
  join public.organizations o on o.id = c.organization_id
  where a.kind <> 'gif'
    and a.files_deleted_at is null
    and (a.removed_at is not null or a.created_at < now() - make_interval(days => o.chat_file_days))
  order by a.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;
revoke all on function public.chat_files_to_delete(integer) from public, anon, authenticated;
grant execute on function public.chat_files_to_delete(integer) to service_role;

-- After the job has removed the files: the message stays, and says the file is no longer available.
create function public.mark_chat_files_deleted(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.message_attachments
     set removed_at = coalesce(removed_at, now()), files_deleted_at = now()
   where id = any (coalesce(p_ids, '{}')) and files_deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.mark_chat_files_deleted(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_chat_files_deleted(uuid[]) to service_role;

-- Messages older than the organization's limit go entirely, once their files have gone. Replies
-- to them keep their own words. Returns how many went.
create function public.purge_old_messages(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  select coalesce(array_agg(m.id), '{}') into v_ids
  from (
    select m.id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    join public.organizations o on o.id = c.organization_id
    where m.created_at < now() - make_interval(years => o.message_text_years)
      and not exists (
        select 1 from public.message_attachments a
        where a.message_id = m.id and a.kind <> 'gif' and a.files_deleted_at is null)
    order by m.created_at
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000)) m;
  delete from public.message_attachments where message_id = any (v_ids);
  delete from public.messages where id = any (v_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_old_messages(integer) from public, anon, authenticated;
grant execute on function public.purge_old_messages(integer) to service_role;

-- How much of the free plan is used, in bytes, for the weekly summary. Sizes only.
create function public.platform_usage()
returns table (database_bytes bigint, storage_bytes bigint, chat_file_bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pg_database_size(current_database()),
    (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o),
    (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o
      where o.bucket_id = 'chat-files');
$$;
revoke all on function public.platform_usage() from public, anon, authenticated;
grant execute on function public.platform_usage() to service_role;
