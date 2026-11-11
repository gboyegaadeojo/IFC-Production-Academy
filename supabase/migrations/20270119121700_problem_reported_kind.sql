-- A notification kind for Report a problem (health check follow-up, 2026-11-11). On its own,
-- because a new enum value can't be used in the same transaction that adds it;
-- 20270119121800_problem_reports.sql uses it.
alter type public.notification_kind add value if not exists 'problem_reported';
