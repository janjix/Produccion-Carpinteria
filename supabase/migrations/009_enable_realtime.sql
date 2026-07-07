-- Migration 009: Enable realtime replication for the planning tables.
-- Without this, the StaffView won't auto-update when tasks unlock/complete on
-- another device or via the dependency cascade.

-- Add tables to the supabase_realtime publication (ignore errors if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_plan_items;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_plans;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.planning_tasks;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.areas;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
