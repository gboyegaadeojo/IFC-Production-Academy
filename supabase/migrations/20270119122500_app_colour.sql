-- System colour (G, 2026-11-13; ADD-DASH-04): the colour of buttons, links, the current tab and
-- highlights, chosen in Admin, App name and logo. One of the tested colours by name, or a custom
-- hex that the app deepens or lightens where needed so text stays readable. Purple by default.
--
-- It's read before signing in like the name, so it joins app_branding(). Changing a function's
-- columns means dropping it first; callers read the columns by name, so the new ones are harmless
-- to code that doesn't know them yet. Only branding.manage changes it, and organizations' audit
-- trigger logs each change.

alter table public.organizations
  add column app_colour text not null default 'purple'
    check (app_colour ~ '^(purple|blue|teal|green|orange|rose|graphite|#[0-9a-f]{6})$'),
  add column app_colour_logo boolean not null default true;

drop function public.app_branding();
create function public.app_branding()
returns table (
  app_name text,
  app_short_name text,
  app_icon_path text,
  app_colour text,
  app_colour_logo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.app_name, o.app_short_name, o.app_icon_path, o.app_colour, o.app_colour_logo
  from public.organizations o
  limit 1;
$$;
revoke all on function public.app_branding() from public;
grant execute on function public.app_branding() to anon, authenticated, service_role;

create function public.set_app_colour(p_colour text, p_logo boolean)
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
     set app_colour = lower(trim(p_colour)),
         app_colour_logo = coalesce(p_logo, true)
   where o.id = private.current_organization_id();
end;
$$;
revoke all on function public.set_app_colour(text, boolean) from public, anon;
grant execute on function public.set_app_colour(text, boolean) to authenticated;
