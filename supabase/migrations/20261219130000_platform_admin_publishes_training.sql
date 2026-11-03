-- Platform Administrators draft and publish training and SOPs, in every department and for all of
-- production (G, 2026-11-03; decision 2026-11-03-sop-library). The change is written to the audit
-- log by the trigger on role_capabilities.
insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'platform_admin' and c.key in ('course.draft', 'course.publish')
on conflict do nothing;
