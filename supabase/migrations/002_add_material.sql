-- Add material column to planning_tasks
alter table public.planning_tasks add column if not exists material text default '';
