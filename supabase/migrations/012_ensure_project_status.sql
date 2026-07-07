-- Migration 012: Ensure projects.status column allows pause/resume workflow
-- The column already exists from 001_initial_schema.sql with check constraint
-- ('active','paused','completed','archived'). This migration just makes sure
-- all existing projects have a value (default 'active').

UPDATE public.projects SET status = 'active' WHERE status IS NULL;

-- Create an index on status for filtering performance
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
