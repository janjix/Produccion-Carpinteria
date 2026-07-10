-- Migration 004: Add Yenifer (run this if you already executed 003)
insert into public.staff (name, code, role, default_processes, color, sort_order) values
  ('Yenifer', 'YC', 'Administración', '{"despacho_admin"}', '#ec4899', 7)
on conflict (code) do nothing;
