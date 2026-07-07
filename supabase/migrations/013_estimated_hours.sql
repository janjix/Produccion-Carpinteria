-- Migration 013: horas estimadas por tarea

ALTER TABLE public.planning_tasks
  ADD COLUMN IF NOT EXISTS estimated_hours numeric;

ALTER TABLE public.weekly_plan_items
  ADD COLUMN IF NOT EXISTS estimated_hours numeric;
