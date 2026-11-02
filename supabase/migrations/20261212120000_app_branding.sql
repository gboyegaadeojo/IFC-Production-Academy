-- App name and logo (docs/decisions/2026-11-02-service-dashboard.md, ADD-DASH-04).
--
-- The name and icon have to be readable before anyone signs in: the installed app, browser tabs,
-- and the sign-in page all use them. So app_branding() is open to everyone, and the icons sit in a
-- public bucket, the one exception to private buckets, because an app icon isn't private. Only
-- people with branding.manage can change either. organizations' audit trigger logs each change.

alter table public.organizations
  add column app_name text not null default 'IFC Production Academy'
    check (length(trim(app_name)) between 1 and 40),
  add column app_short_name text not null default 'IFC Academy'
    check (length(trim(app_short_name)) between 1 and 24),
  add column app_icon_path text
    check (app_icon_path ~ '^app-icon-[0-9a-f-]{36}\.png$');

insert into public.capabilities (key, description)
values ('branding.manage', 'Change the app''s name and logo')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'platform_admin' and c.key = 'branding.manage'
on conflict do nothing;

create function public.app_branding()
returns table (app_name text, app_short_name text, app_icon_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.app_name, o.app_short_name, o.app_icon_path
  from public.organizations o
  limit 1;
$$;
revoke all on function public.app_branding() from public;
grant execute on function public.app_branding() to anon, authenticated, service_role;

create function public.set_app_branding(p_name text, p_short_name text, p_icon_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_active_user() and private.has_capability('branding.manage')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.organizations o
     set app_name = trim(p_name),
         app_short_name = trim(p_short_name),
         app_icon_path = p_icon_path
   where o.id = private.current_organization_id();
end;
$$;
revoke all on function public.set_app_branding(text, text, text) from public, anon;
grant execute on function public.set_app_branding(text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "App icons: upload with branding.manage"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and private.has_capability('branding.manage'));
create policy "App icons: remove with branding.manage"
  on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and private.has_capability('branding.manage'));
