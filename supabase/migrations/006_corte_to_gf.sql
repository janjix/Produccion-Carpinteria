-- Migration 006: Corte goes to Gian Franco by default (Carpinteros only when manually assigned)
UPDATE public.staff SET default_processes = '{"supervision_canteado","optimizacion","despacho_materiales","mecanizado","corte"}' WHERE code = 'GF';
UPDATE public.staff SET default_processes = '{"ensamblaje","embalaje","instalacion","herrajes"}' WHERE code = 'CC';
