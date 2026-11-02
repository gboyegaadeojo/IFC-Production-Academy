-- Names: an account made by email link starts with the part of the email before the @ as its
-- name ("sam.example"). When it's linked to a Planning Center person, take their Planning Center
-- name instead, unless the person has already chosen a name of their own (SRS-AUTH-006).

-- True while a display name is still the one made up at sign-up.
create function private.is_default_display_name(p_name text, p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is null
      or trim(p_name) = ''
      or trim(p_name) = 'New volunteer'
      or position('@' in p_name) > 0
      or lower(trim(p_name)) = lower(split_part(coalesce(p_email, ''), '@', 1));
$$;
revoke all on function private.is_default_display_name(text, text) from public, anon, authenticated;

create function private.adopt_planning_center_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
begin
  if new.pco_person_id is null or new.pco_person_id is not distinct from old.pco_person_id then
    return new;
  end if;
  select left(nullif(trim(pp.display_name), ''), 120) into v_name
  from public.pco_people pp where pp.id = new.pco_person_id;
  select u.email into v_email from auth.users u where u.id = new.id;
  if v_name is not null and private.is_default_display_name(new.display_name, v_email) then
    new.display_name := v_name;
  end if;
  return new;
end;
$$;
revoke all on function private.adopt_planning_center_name() from public, anon, authenticated;

create trigger profiles_adopt_planning_center_name
before update of pco_person_id on public.profiles
for each row execute function private.adopt_planning_center_name();

-- Accounts already linked whose name is still the sign-up default.
update public.profiles p
   set display_name = left(trim(pp.display_name), 120)
  from public.pco_people pp, auth.users u
 where pp.id = p.pco_person_id
   and u.id = p.id
   and nullif(trim(pp.display_name), '') is not null
   and private.is_default_display_name(p.display_name, u.email);
