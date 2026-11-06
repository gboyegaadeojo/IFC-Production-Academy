-- A notification when a leader gives someone a role (G, 2026-11-06). On its own, because a new enum
-- value can't be used in the transaction that adds it.
alter type public.notification_kind add value if not exists 'role_granted';
