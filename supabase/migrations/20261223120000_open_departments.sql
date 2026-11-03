-- A third way to join a department: anyone can, with no approval (G, 2026-11-03; SRS-MEM-007).
-- Joining still never makes someone Approved to Serve. Someone a leader removed has to ask.
alter type public.enrolment_mode add value 'open';

create or replace function public.request_membership(p_department_id uuid)
returns public.department_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_department public.departments;
  v_membership public.department_memberships;
  v_joins boolean;
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_department
    from public.departments d
   where d.id = p_department_id and d.organization_id = private.current_organization_id();
  if not found or v_department.status = 'inactive' then
    raise exception 'department_not_found' using errcode = 'P0002';
  end if;
  if v_department.status <> 'active' then
    raise exception 'department_not_open' using errcode = 'P0001';
  end if;
  if v_department.enrolment_mode::text = 'invite_only' then
    raise exception 'department_invite_only' using errcode = 'P0001';
  end if;

  select * into v_membership
    from public.department_memberships m
   where m.department_id = p_department_id
     and m.user_id = v_user_id
     and m.status in ('requested', 'active');
  if found then
    return v_membership;
  end if;

  v_joins := v_department.enrolment_mode::text = 'open' and coalesce((
    select m.status <> 'removed'
      from public.department_memberships m
     where m.department_id = p_department_id and m.user_id = v_user_id
     order by m.updated_at desc
     limit 1
  ), true);

  begin
    if v_joins then
      insert into public.department_memberships (department_id, user_id, status, decided_at, decided_by)
      values (p_department_id, v_user_id, 'active', now(), v_user_id)
      returning * into v_membership;
    else
      insert into public.department_memberships (department_id, user_id, status)
      values (p_department_id, v_user_id, 'requested')
      returning * into v_membership;
    end if;
  exception when unique_violation then
    -- A concurrent retry won the race; return its row.
    select * into v_membership
      from public.department_memberships m
     where m.department_id = p_department_id
       and m.user_id = v_user_id
       and m.status in ('requested', 'active');
  end;
  return v_membership;
end;
$$;
