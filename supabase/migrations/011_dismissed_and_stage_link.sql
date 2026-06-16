-- Migration 011: Allow weekly items to remember they were dismissed
-- so the auto-sync doesn't re-insert them.
-- Also: add a stable stage column to weekly_plan_items so the link to
-- planning_tasks no longer depends on the human-readable label.

ALTER TABLE public.weekly_plan_items DROP CONSTRAINT IF EXISTS weekly_plan_items_status_check;
ALTER TABLE public.weekly_plan_items ADD CONSTRAINT weekly_plan_items_status_check
  CHECK (status IN ('blocked','pending','in_progress','done','dismissed'));

ALTER TABLE public.planning_tasks DROP CONSTRAINT IF EXISTS planning_tasks_status_check;
ALTER TABLE public.planning_tasks ADD CONSTRAINT planning_tasks_status_check
  CHECK (status IN ('blocked','pending','in_progress','done','dismissed'));

ALTER TABLE public.weekly_plan_items ADD COLUMN IF NOT EXISTS stage_id text;

UPDATE public.weekly_plan_items SET stage_id = CASE process
  WHEN 'Diseño' THEN 'diseno'
  WHEN 'Revisión Diseño' THEN 'revision_diseno'
  WHEN 'Creación Partidas' THEN 'creacion_partidas'
  WHEN 'Req. Materiales' THEN 'req_materiales'
  WHEN 'Req. Herrajes' THEN 'req_herrajes'
  WHEN 'Req. por Sistema' THEN 'req_sistema'
  WHEN 'Compra Materiales' THEN 'compra_materiales'
  WHEN 'Modelado 3D' THEN 'modelado'
  WHEN 'Planos' THEN 'planos'
  WHEN 'Optimización' THEN 'optimizacion'
  WHEN 'Corte' THEN 'corte'
  WHEN 'Canteado' THEN 'canteado'
  WHEN 'Sup. Canteado' THEN 'supervision_canteado'
  WHEN 'Mecanizado' THEN 'mecanizado'
  WHEN 'Ensamblaje' THEN 'ensamblaje'
  WHEN 'Herrajes' THEN 'herrajes'
  WHEN 'Sup. Ensamblaje' THEN 'supervision_ensamblaje'
  WHEN 'Despacho Mat.' THEN 'despacho_materiales'
  WHEN 'Embalaje' THEN 'embalaje'
  WHEN 'Instalación' THEN 'instalacion'
  WHEN 'Sup. Instalación' THEN 'supervision_instalacion'
  WHEN 'Despacho' THEN 'despacho_admin'
  WHEN 'Mediciones' THEN 'mediciones'
  WHEN 'Mant. Máquinas' THEN 'mantenimiento_maquinas'
  ELSE NULL
END
WHERE stage_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_stage_id ON public.weekly_plan_items(stage_id);
