-- ============================================================
-- Migration 003: Staff, Materials, Updated Planning
-- ============================================================

-- ─── Staff members ───
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,        -- AS, AV, DJ, GF, AL, AA, CC
  role text default '',
  default_processes text[] default '{}',
  color text default '#7c6df0',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ─── Area materials (an area can have multiple materials) ───
create table if not exists public.area_materials (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references public.areas(id) on delete cascade not null,
  name text not null,               -- e.g. "MDF 18mm blanco"
  notes text default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ─── Weekly plans (auto-generated per person per week) ───
create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff(id) on delete cascade not null,
  week_start date not null,         -- Monday of the week
  created_at timestamptz default now()
);

-- ─── Weekly plan items (individual tasks assigned) ───
create table if not exists public.weekly_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.weekly_plans(id) on delete cascade not null,
  staff_id uuid references public.staff(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  process text not null,
  material text default '',
  day_of_week int default 1,        -- 1=Mon, 2=Tue ... 6=Sat
  sort_order int default 0,
  status text default 'pending' check (status in ('pending','in_progress','done')),
  notes text default '',
  is_admin boolean default false,
  is_general boolean default false,
  created_at timestamptz default now()
);

-- Add columns to planning_tasks if missing
alter table public.planning_tasks add column if not exists material text default '';
alter table public.planning_tasks add column if not exists assigned_to_id uuid references public.staff(id) on delete set null;

-- Add columns to areas for materials
alter table public.areas add column if not exists materials_list text[] default '{}';

-- Indexes
create index if not exists idx_area_materials_area on public.area_materials(area_id);
create index if not exists idx_weekly_plans_staff on public.weekly_plans(staff_id);
create index if not exists idx_weekly_plans_week on public.weekly_plans(week_start);
create index if not exists idx_weekly_items_plan on public.weekly_plan_items(plan_id);
create index if not exists idx_weekly_items_staff on public.weekly_plan_items(staff_id);

-- RLS
alter table public.staff enable row level security;
alter table public.area_materials enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_items enable row level security;

create policy "Allow all on staff" on public.staff for all using (true) with check (true);
create policy "Allow all on area_materials" on public.area_materials for all using (true) with check (true);
create policy "Allow all on weekly_plans" on public.weekly_plans for all using (true) with check (true);
create policy "Allow all on weekly_plan_items" on public.weekly_plan_items for all using (true) with check (true);

-- ─── Insert default staff ───
insert into public.staff (name, code, role, default_processes, color, sort_order) values
  ('Adriana', 'AS', 'Diseño', '{"diseno","creacion_partidas"}', '#e86daa', 0),
  ('Angel', 'AV', 'Coordinación', '{"revision_diseno","req_materiales","req_herrajes","mediciones","supervision_instalacion","creacion_partidas"}', '#4a9eff', 1),
  ('David', 'DJ', 'Modelado / Supervisión', '{"modelado","optimizacion","supervision_ensamblaje"}', '#7c6df0', 2),
  ('Gian Franco', 'GF', 'Producción', '{"supervision_canteado","optimizacion","despacho_materiales"}', '#2dcc9f', 3),
  ('Asdrubal', 'AL', 'Planos / Modelado', '{"planos","modelado"}', '#f09030', 4),
  ('Ayudantes', 'AA', 'Producción', '{"canteado","mantenimiento_maquinas"}', '#20b8d0', 5),
  ('Carpinteros', 'CC', 'Carpintería', '{"ensamblaje","corte","embalaje","instalacion"}', '#e6a23c', 6)
on conflict (code) do nothing;
