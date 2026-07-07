-- Migration 008: Allow 'blocked' status
-- The original tables only allowed pending/in_progress/done.
-- The pipeline now creates tasks in 'blocked' state until predecessors complete.

ALTER TABLE public.weekly_plan_items DROP CONSTRAINT IF EXISTS weekly_plan_items_status_check;
ALTER TABLE public.weekly_plan_items ADD CONSTRAINT weekly_plan_items_status_check
  CHECK (status IN ('blocked','pending','in_progress','done'));

ALTER TABLE public.planning_tasks DROP CONSTRAINT IF EXISTS planning_tasks_status_check;
ALTER TABLE public.planning_tasks ADD CONSTRAINT planning_tasks_status_check
  CHECK (status IN ('blocked','pending','in_progress','done'));
