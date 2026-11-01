-- The public "I want to serve" page lists open departments to pick from. Names, icons and hues
-- only: nothing about people, and nothing a visitor couldn't see on the church website.
create function public.open_departments()
returns table (id uuid, name text, hue text, icon text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.hue, d.icon
  from public.departments d
  where d.status = 'active'
  order by d.sort_order, d.name;
$$;
revoke all on function public.open_departments() from public;
grant execute on function public.open_departments() to anon, authenticated;
