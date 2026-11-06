-- Tells someone when a leader gives them a role, such as Department Leader or Production Director
-- (G, 2026-11-06). Before this, they only found new options the next time they opened the app.
-- Granting yourself a role (the first administrator), and the Volunteer role every new account
-- gets, send nothing.

create function private.notify_role_granted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_role text;
  v_department text;
  v_by text;
begin
  if new.revoked_at is not null or new.granted_by is null or new.granted_by = new.user_id then
    return null;
  end if;
  select r.key, r.name into v_key, v_role from public.roles r where r.id = new.role_id;
  -- Every new account gets Volunteer on its own; nobody gave it to them.
  if v_key = 'volunteer' then
    return null;
  end if;
  select d.name into v_department from public.departments d where d.id = new.department_id;
  select p.display_name into v_by from public.profiles p where p.id = new.granted_by;
  perform private.notify(new.user_id, 'role_granted',
    'You''re now ' || coalesce(v_role, 'a leader')
      || coalesce(' for ' || v_department, ''),
    coalesce(nullif(trim(v_by), ''), 'A leader') || ' gave you this role. '
      || case when v_key = 'dashboard_editor'
           then 'You can now set up the Service Dashboard.'
           else 'Your new options are under Admin, in the menu on your name.' end,
    case when v_key = 'dashboard_editor' then '/service-dashboard' else '/admin' end,
    'role_granted:' || new.id);
  return null;
end;
$$;
revoke all on function private.notify_role_granted() from public, anon, authenticated;

create trigger user_roles_notify_granted after insert on public.user_roles
  for each row execute function private.notify_role_granted();
