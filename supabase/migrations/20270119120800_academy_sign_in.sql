-- Sign in with Planning Center while the Academy schedules (G, 2026-11-09; plan "Academy
-- scheduling", PR 9). While Planning Center schedules, sign-in works exactly as before: only people
-- the sync has seen on a team or schedule. While the Academy schedules, the sync no longer lists
-- them, so anyone in the church's Planning Center organization may sign in, and is recorded the
-- first time they do. Their name comes with them, for their profile.

drop function public.planning_center_sign_in(text, text, text[]);

create function public.planning_center_sign_in(
  p_pco_person_id text, p_pco_organization_id text, p_emails text[], p_name text default null
)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_user uuid;
begin
  if coalesce(trim(p_pco_person_id), '') = '' then
    raise exception 'invalid_person' using errcode = '22023';
  end if;
  select * into v_org from public.organizations o order by o.created_at limit 1;
  if v_org.pco_organization_id is not null
     and v_org.pco_organization_id is distinct from p_pco_organization_id then
    raise exception 'wrong_organization' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pco_people pp where pp.id = p_pco_person_id) then
    -- While the Academy schedules, the sync no longer lists who's on a team, so anyone in the
    -- church's Planning Center organization may sign in. The organization must be known.
    if v_org.scheduling_source = 'academy' and v_org.pco_organization_id is not null then
      insert into public.pco_people (id, organization_id, display_name, user_id, seen_at)
      values (p_pco_person_id, v_org.id, left(coalesce(trim(p_name), ''), 120), null, now())
      on conflict (id) do nothing;
    else
      raise exception 'not_in_planning_center' using errcode = 'P0001';
    end if;
  end if;

  select pr.id into v_user from public.profiles pr where pr.pco_person_id = p_pco_person_id;
  if v_user is null then
    select u.id into v_user from auth.users u
     join public.profiles pr on pr.id = u.id and pr.pco_person_id is null
     where lower(u.email) in (select lower(trim(e)) from unnest(coalesce(p_emails, '{}')) e)
     order by u.created_at limit 1;
    if v_user is null then
      -- No account yet: the app creates one and asks again.
      return;
    end if;
    update public.profiles pr set pco_person_id = p_pco_person_id where pr.id = v_user;
  end if;

  -- Their checklist follows at once, without waiting for the next sync.
  update public.pco_people pp set user_id = v_user
   where pp.id = p_pco_person_id and pp.user_id is distinct from v_user
     and exists (select 1 from public.profiles pr where pr.id = v_user and pr.status = 'active');

  return query select u.id, u.email::text from auth.users u where u.id = v_user;
end;
$$;
revoke all on function public.planning_center_sign_in(text, text, text[], text) from public, anon, authenticated;
grant execute on function public.planning_center_sign_in(text, text, text[], text) to service_role;
