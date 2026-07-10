-- Migration 014: semana programada por área.
-- Las tareas del área no entran a las planificaciones personales hasta esa semana.
-- Cuando llega la semana, se agregan automáticamente.

ALTER TABLE public.areas
  ADD COLUMN IF NOT EXISTS scheduled_week_start date;

ALTER TABLE public.planning_tasks
  ADD COLUMN IF NOT EXISTS scheduled_week_start date;

-- Backfill: por defecto, la fecha de inicio de las áreas existentes es el lunes actual
-- para que no queden pendientes bloqueadas.
UPDATE public.areas
  SET scheduled_week_start = (date_trunc('week', now())::date)
  WHERE scheduled_week_start IS NULL;

-- Backfill planning_tasks tomando la fecha del área
UPDATE public.planning_tasks pt
  SET scheduled_week_start = a.scheduled_week_start
  FROM public.areas a
  WHERE pt.area_id = a.id AND pt.scheduled_week_start IS NULL;

CREATE INDEX IF NOT EXISTS idx_areas_scheduled_week ON public.areas(scheduled_week_start);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_scheduled_week ON public.planning_tasks(scheduled_week_start);
