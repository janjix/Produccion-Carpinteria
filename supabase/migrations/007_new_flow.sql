-- Migration 007: New process flow
-- Adds Req. por Sistema (YC) and Compra de Materiales (YC), updates staff process lists,
-- and removes QC from the production chain (kept in catalog but no longer in flow).

-- Update staff default processes to match new flow
UPDATE public.staff SET default_processes = '{"diseno","creacion_partidas"}' WHERE code = 'AS';
UPDATE public.staff SET default_processes = '{"revision_diseno","req_materiales","req_herrajes","supervision_ensamblaje","supervision_instalacion","mediciones"}' WHERE code = 'AV';
UPDATE public.staff SET default_processes = '{"modelado","optimizacion","corte","mecanizado","despacho_materiales","supervision_ensamblaje"}' WHERE code = 'DJ';
UPDATE public.staff SET default_processes = '{"supervision_canteado","optimizacion","despacho_materiales","mecanizado","corte"}' WHERE code = 'GF';
UPDATE public.staff SET default_processes = '{"planos","modelado","corte"}' WHERE code = 'AL';
UPDATE public.staff SET default_processes = '{"canteado","mantenimiento_maquinas"}' WHERE code = 'AA';
UPDATE public.staff SET default_processes = '{"ensamblaje","embalaje","instalacion","herrajes"}' WHERE code = 'CC';
UPDATE public.staff SET default_processes = '{"req_sistema","compra_materiales","despacho_admin"}' WHERE code = 'YC';

-- Clean up duplicates of per-material stages that have NO material
-- (these are leftovers from earlier versions)
DELETE FROM public.planning_tasks
WHERE stage IN ('optimizacion','corte','canteado','mecanizado')
  AND (material IS NULL OR material = '');
