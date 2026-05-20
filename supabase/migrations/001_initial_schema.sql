-- ============================================================
-- MS Producción — Supabase Schema
-- ============================================================

-- ─── Projects ───
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text default '',
  notes text default '',
  priority int default 0,
  status text default 'active' check (status in ('active','paused','completed','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Areas ───
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  notes text default '',
  -- Area-level checklist (NOT per-furniture)
  stage_modelado boolean default false,
  stage_planos boolean default false,
  stage_corte boolean default false,
  stage_canteado boolean default false,
  stage_mecanizado boolean default false,
  stage_qc boolean default false,
  stage_acabados boolean default false,
  stage_herrajes boolean default false,
  stage_ensamblaje boolean default false,
  stage_embalaje boolean default false,
  stage_instalacion boolean default false,
  -- Comments per stage (when something is incomplete or has exceptions)
  comment_modelado text default '',
  comment_planos text default '',
  comment_corte text default '',
  comment_canteado text default '',
  comment_mecanizado text default '',
  comment_qc text default '',
  comment_acabados text default '',
  comment_herrajes text default '',
  comment_ensamblaje text default '',
  comment_embalaje text default '',
  comment_instalacion text default '',
  -- Which mecanizados apply to this area (configurable per area)
  mecanizados_enabled text[] default '{}',
  mecanizados_completed text[] default '{}',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Furniture (pieces within an area) ───
create table public.furniture (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references public.areas(id) on delete cascade not null,
  name text not null,
  notes text default '',
  image_url text default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ─── Activity Log ───
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  action text not null,         -- e.g. 'stage_completed', 'furniture_added', 'comment_added'
  stage text default '',        -- which stage was affected
  description text not null,    -- human-readable: "Corte completado en Cocina"
  user_name text default '',    -- who did it (simple text, no auth yet)
  created_at timestamptz default now()
);

-- ─── Planning Tasks (cross-project scheduling) ───
create table public.planning_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  title text not null,
  description text default '',
  stage text default '',
  priority int default 0,       -- lower = higher priority
  status text default 'pending' check (status in ('pending','in_progress','blocked','done')),
  depends_on uuid references public.planning_tasks(id) on delete set null,
  start_date date,
  due_date date,
  assigned_to text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Indexes ───
create index idx_areas_project on public.areas(project_id);
create index idx_furniture_area on public.furniture(area_id);
create index idx_activity_project on public.activity_log(project_id);
create index idx_activity_created on public.activity_log(created_at desc);
create index idx_planning_project on public.planning_tasks(project_id);
create index idx_planning_status on public.planning_tasks(status);

-- ─── Row Level Security (open for now, tighten later with auth) ───
alter table public.projects enable row level security;
alter table public.areas enable row level security;
alter table public.furniture enable row level security;
alter table public.activity_log enable row level security;
alter table public.planning_tasks enable row level security;

-- Open policies (replace with auth-based policies when you add login)
create policy "Allow all on projects" on public.projects for all using (true) with check (true);
create policy "Allow all on areas" on public.areas for all using (true) with check (true);
create policy "Allow all on furniture" on public.furniture for all using (true) with check (true);
create policy "Allow all on activity_log" on public.activity_log for all using (true) with check (true);
create policy "Allow all on planning_tasks" on public.planning_tasks for all using (true) with check (true);

-- ─── Storage bucket for furniture images ───
insert into storage.buckets (id, name, public) values ('furniture-images', 'furniture-images', true);

create policy "Anyone can upload furniture images"
  on storage.objects for insert
  with check (bucket_id = 'furniture-images');

create policy "Anyone can view furniture images"
  on storage.objects for select
  using (bucket_id = 'furniture-images');
