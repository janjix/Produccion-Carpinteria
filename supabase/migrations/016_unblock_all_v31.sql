-- Migration 016: v31 sin bloqueos.
-- Convierte todas las tareas 'blocked' existentes a 'pending' porque el sistema
-- de dependencias fue eliminado. Los checks solo marcan hecho, no bloquean nada.

UPDATE public.planning_tasks
  SET status = 'pending'
  WHERE status = 'blocked';

UPDATE public.weekly_plan_items
  SET status = 'pending'
  WHERE status = 'blocked';
