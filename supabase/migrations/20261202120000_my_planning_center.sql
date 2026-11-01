-- The account menu and profile (redesign approved 2026-11-01): whether you sign in with Planning
-- Center, and the name Planning Center has for you, to suggest as your display name. Your own
-- row only; Planning Center's people stay readable by Planning Center admins alone.
create function public.my_planning_center()
returns table (linked boolean, pco_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.pco_person_id is not null,
         (select nullif(trim(pp.display_name), '') from public.pco_people pp where pp.id = pr.pco_person_id)
  from public.profiles pr
  where pr.id = (select auth.uid()) and private.is_active_user();
$$;
revoke all on function public.my_planning_center() from public, anon;
grant execute on function public.my_planning_center() to authenticated;
