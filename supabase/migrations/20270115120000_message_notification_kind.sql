-- A notification kind for new messages (ADD-MSG-06). On its own, because a new enum value can't be
-- used in the same transaction that adds it; 20270115120100_message_notifications.sql uses it.
alter type public.notification_kind add value if not exists 'message';
