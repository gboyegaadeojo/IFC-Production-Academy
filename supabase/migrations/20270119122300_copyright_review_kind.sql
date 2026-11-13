-- A notification kind for a copyright review sent to an Academy member (G, 2026-11-13: reviewers in
-- the Academy got the email but no alert). On its own, because a new enum value can't be used in
-- the same transaction that adds it; 20270119122400_copyright_review_alerts.sql uses it.
alter type public.notification_kind add value if not exists 'copyright_review';
