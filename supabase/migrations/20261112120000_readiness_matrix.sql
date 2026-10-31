-- Readiness matrix (ADD-REPORT-01): how many active members are Approved to Serve in each serving
-- role, for every department the caller can view reports for. SPEC §9's candidate goal is at
-- least two approved operators for every role. Counts only, no names.

create function public.readiness_matrix()
returns table (
  department_id uuid, department_name text, role_id uuid, role_name text, approved integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, r.id, r.name,
         (select count(*)::integer
            from public.serving_approvals a
            join public.department_memberships m
              on m.user_id = a.user_id and m.department_id = a.department_id and m.status = 'active'
           where a.role_id = r.id and a.status = 'approved')
  from public.departments d
  join public.serving_roles r on r.department_id = d.id and r.archived_at is null
  where d.organization_id = private.current_organization_id()
    and private.is_active_user()
    and private.has_capability('report.view', d.id)
  order by d.sort_order, r.name;
$$;

revoke all on function public.readiness_matrix() from public, anon;
grant execute on function public.readiness_matrix() to authenticated;
