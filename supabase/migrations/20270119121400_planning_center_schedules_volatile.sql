-- The sync job's "who schedules" check must run read-write (fix for 20270119121300).
--
-- private.planning_center_schedules() reads organizations with FOR SHARE, so the switch-over can't
-- change hands mid-sync. PostgREST runs stable functions in a read-only transaction, where FOR SHARE
-- is refused (25006, HTTP 405), so the job still failed. Volatile functions run read-write.

alter function public.planning_center_schedules() volatile;
