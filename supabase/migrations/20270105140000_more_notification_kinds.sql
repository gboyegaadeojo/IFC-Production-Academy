-- New kinds of notification (docs/decisions/2026-11-05-alerts.md). On their own, because a new enum
-- value can't be used in the transaction that adds it.
alter type public.notification_kind add value if not exists 'service_changed';
alter type public.notification_kind add value if not exists 'join_requested';
alter type public.notification_kind add value if not exists 'cover_open';
alter type public.notification_kind add value if not exists 'approved_to_serve';
alter type public.notification_kind add value if not exists 'certificate_ready';
alter type public.notification_kind add value if not exists 'new_course';
alter type public.notification_kind add value if not exists 'sop_updated';
alter type public.notification_kind add value if not exists 'mentor_note';
