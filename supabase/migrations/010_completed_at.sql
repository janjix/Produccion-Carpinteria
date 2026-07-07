-- Migration 010: Track when a task was completed
ALTER TABLE public.planning_tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill: tasks currently in 'done' state get the updated_at as their completion timestamp
UPDATE public.planning_tasks
  SET completed_at = updated_at
  WHERE status = 'done' AND completed_at IS NULL;
