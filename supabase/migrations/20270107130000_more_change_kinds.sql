-- Notifications for changes a leader makes to someone (G, 2026-11-06): each of these used to
-- change what a person could do or see without telling them. On their own, because a new enum
-- value can't be used in the transaction that adds it.
alter type public.notification_kind add value if not exists 'role_removed';
alter type public.notification_kind add value if not exists 'membership_declined';
alter type public.notification_kind add value if not exists 'membership_removed';
alter type public.notification_kind add value if not exists 'skill_suspended';
alter type public.notification_kind add value if not exists 'certificate_withdrawn';
alter type public.notification_kind add value if not exists 'quiz_attempt_granted';
alter type public.notification_kind add value if not exists 'assignment_cancelled';
alter type public.notification_kind add value if not exists 'mentoring_ended';
alter type public.notification_kind add value if not exists 'course_unassigned';
