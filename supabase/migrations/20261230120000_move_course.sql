-- Reordering courses from Curriculum (Course Hierarchy mock, approved 2026-11-04). Needs course.draft
-- in the course's category. Rows are numbered first, because older courses can share a position.
create function public.move_course(p_course_id uuid, p_direction integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level uuid;
  v_order uuid[];
  v_at integer;
begin
  if p_direction not in (-1, 1) or not private.can_draft_course(p_course_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select c.level_id into v_level from public.courses c where c.id = p_course_id;
  select array_agg(c.id order by c.sort_order, c.created_at, c.id) into v_order
    from public.courses c
   where c.level_id = v_level and c.archived_at is null;
  v_at := array_position(v_order, p_course_id);
  if v_at is null or v_at + p_direction not between 1 and cardinality(v_order) then
    return;
  end if;
  v_order[v_at] := v_order[v_at + p_direction];
  v_order[v_at + p_direction] := p_course_id;
  update public.courses c
     set sort_order = array_position(v_order, c.id)
   where c.id = any (v_order) and c.sort_order is distinct from array_position(v_order, c.id);
end;
$$;
revoke all on function public.move_course(uuid, integer) from public, anon;
grant execute on function public.move_course(uuid, integer) to authenticated;
