-- Go live with notifications (G, 2026-11-09; ADD-NOTIF-02). From now on everyone gets emails and
-- phone alerts as they've chosen, not just the people on notification_testers, as a first group of
-- volunteers starts using the Academy. What was held before stays held: those rows are already
-- 'skipped', so nobody gets old notices. Onboarding emails keep their own switch, still off.

update public.organizations set notifications_live = true;
