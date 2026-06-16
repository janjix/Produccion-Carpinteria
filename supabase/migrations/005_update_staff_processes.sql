-- Migration 005: Update staff processes (run if you already executed 003/004)
-- Adds: qc to Angel and David, mecanizado to Gian Franco, herrajes to Carpinteros

UPDATE public.staff SET default_processes = '{"revision_diseno","req_materiales","req_herrajes","mediciones","supervision_instalacion","creacion_partidas","qc"}' WHERE code = 'AV';
UPDATE public.staff SET default_processes = '{"modelado","optimizacion","supervision_ensamblaje","qc"}' WHERE code = 'DJ';
UPDATE public.staff SET default_processes = '{"supervision_canteado","optimizacion","despacho_materiales","mecanizado"}' WHERE code = 'GF';
UPDATE public.staff SET default_processes = '{"ensamblaje","corte","embalaje","instalacion","herrajes"}' WHERE code = 'CC';
