-- "Choose a department" can offer a chosen set of departments (docs/decisions/2026-11-01-onboarding-pathways.md).
-- The step's config may hold department_ids (a JSON array of department UUIDs); empty or missing
-- means every active department, as before. The volunteer's view returns what's offered, and
-- choosing checks it.

-- The departments a branch step offers: its list, or every active department when it has none.
create function private.onboarding_offered_departments(p_step_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(s.config -> 'department_ids') = 'array'
         and jsonb_array_length(s.config -> 'department_ids') > 0
    then array(
      select d.id from public.departments d
      where d.status = 'active' and d.organization_id = p.organization_id
        and d.id::text in (select jsonb_array_elements_text(s.config -> 'department_ids'))
      order by d.sort_order)
    else array(
      select d.id from public.departments d
      where d.status = 'active' and d.organization_id = p.organization_id
      order by d.sort_order)
  end
  from public.onboarding_steps s
  join public.onboarding_pathways p on p.id = s.pathway_id
  where s.id = p_step_id;
$$;
revoke all on function private.onboarding_offered_departments(uuid) from public, anon, authenticated;

drop function public.my_onboarding();
create function public.my_onboarding()
returns table (
  entry_id uuid, pathway_name text, status public.onboarding_entry_status,
  step_id uuid, step_title text, step_kind public.onboarding_step_kind, stage_name text, stage_timing text,
  step_position integer, current_position integer, contact_name text, chosen_department_id uuid,
  offered_department_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, p.name, e.status, s.id, s.title, s.kind, sg.name, sg.timing, o.step_order,
         (select o2.step_order from private.onboarding_ordered_steps(e.pathway_id) o2 where o2.step_id = e.current_step_id),
         (select pr.display_name from public.onboarding_tasks t join public.profiles pr on pr.id = t.assignee_id
           where t.entry_id = e.id and t.done_at is null order by t.created_at desc limit 1),
         e.chosen_department_id,
         case when s.kind = 'branch' then private.onboarding_offered_departments(s.id) end
  from public.onboarding_entries e
  join public.onboarding_contacts c on c.id = e.contact_id and c.user_id = (select auth.uid())
  join public.onboarding_pathways p on p.id = e.pathway_id
  join private.onboarding_ordered_steps(e.pathway_id) o on true
  join public.onboarding_steps s on s.id = o.step_id
  join public.onboarding_stages sg on sg.id = s.stage_id
  where e.status in ('active', 'finished') and s.kind not in ('trigger_form', 'trigger_manual', 'trigger_join', 'trigger_pco')
    and private.is_active_user()
  order by e.started_at, o.step_order;
$$;
revoke all on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;

create or replace function public.onboarding_choose_department(p_entry_id uuid, p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step uuid;
begin
  select e.current_step_id into v_step
  from public.onboarding_entries e
  join public.onboarding_contacts c on c.id = e.contact_id
  join public.onboarding_steps s on s.id = e.current_step_id and s.kind = 'branch'
  where e.id = p_entry_id and e.status = 'active' and c.user_id = (select auth.uid());
  if v_step is null or not (p_department_id = any(private.onboarding_offered_departments(v_step))) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.onboarding_entries set chosen_department_id = p_department_id where id = p_entry_id;
  perform private.onboarding_run(p_entry_id);
end;
$$;
revoke all on function public.onboarding_choose_department(uuid, uuid) from public, anon;
grant execute on function public.onboarding_choose_department(uuid, uuid) to authenticated;
