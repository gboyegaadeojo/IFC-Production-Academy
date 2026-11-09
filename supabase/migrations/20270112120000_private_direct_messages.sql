-- Direct messages are private between the two people (G, 2026-11-09). This reverses G's earlier
-- answer that the Production Director and Platform Admins could open them for safety: the review
-- function and the message.review capability go. Nobody else reads or deletes a direct message.
-- Audit events from earlier reviews stay, because history isn't rewritten.

drop function public.review_direct_conversation(uuid);

delete from public.role_capabilities rc
using public.capabilities c
where c.id = rc.capability_id and c.key = 'message.review';

delete from public.capabilities where key = 'message.review';
