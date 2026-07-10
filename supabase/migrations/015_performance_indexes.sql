-- Migration 015: índices para acelerar queries de Personal
-- El diagnóstico mostró 1253 items semanales (después de limpiar 229 dismissed) y 459 planning_tasks.
-- Estas queries son las más frecuentes en cada carga de Personal.

-- Filtros por plan + status (loadPlans)
CREATE INDEX IF NOT EXISTS idx_wpi_plan_status ON public.weekly_plan_items(plan_id, status);

-- Filtro por project_id (dismissProjectFromWeek, syncStatusToWeeklyItems)
CREATE INDEX IF NOT EXISTS idx_wpi_project ON public.weekly_plan_items(project_id) WHERE project_id IS NOT NULL;

-- Filtro compuesto para match de duplicados (syncTaskToWeeklyPlan, applyScheduledWeeks)
CREATE INDEX IF NOT EXISTS idx_wpi_project_area_stage ON public.weekly_plan_items(project_id, area_id, stage_id) WHERE project_id IS NOT NULL;

-- Planning tasks: filtro por status (unlockReadyTasks, reblockDependentTasks)
CREATE INDEX IF NOT EXISTS idx_planning_project_area_status ON public.planning_tasks(project_id, area_id, status);

-- Weekly plans lookup por semana + staff (createWeeklyPlan, syncTaskToWeeklyPlan)
CREATE INDEX IF NOT EXISTS idx_weekly_plans_week_staff ON public.weekly_plans(week_start, staff_id);
