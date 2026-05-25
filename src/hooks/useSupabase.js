import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

let channelCounter = 0;

// ─── Generic realtime hook ───
export function useRealtimeTable(table, orderBy = 'created_at', filter = null) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const filterCol = filter?.column || null;
  const filterVal = filter?.value || null;

  const fetchData = useCallback(async () => {
    let query = supabase.from(table).select('*').order(orderBy);
    if (filterCol && filterVal) {
      query = query.eq(filterCol, filterVal);
    }
    const { data: rows, error } = await query;
    if (!error) setData(rows || []);
    setLoading(false);
  }, [table, orderBy, filterCol, filterVal]);

  useEffect(() => {
    if (filter && !filterVal) {
      setData([]);
      setLoading(false);
      return;
    }

    fetchData();

    channelCounter++;
    const channelName = `${table}-${filterVal || 'all'}-${channelCounter}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filterCol && filterVal ? { filter: `${filterCol}=eq.${filterVal}` } : {}),
        },
        () => { fetchData(); }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchData, table, filterCol, filterVal]);

  return { data, loading, refetch: fetchData };
}

// ─── Specific hooks ───
export function useProjects() {
  return useRealtimeTable('projects', 'priority');
}

export function useAreas(projectId) {
  return useRealtimeTable('areas', 'sort_order', projectId ? { column: 'project_id', value: projectId } : null);
}

export function useFurniture(areaId) {
  return useRealtimeTable('furniture', 'sort_order', areaId ? { column: 'area_id', value: areaId } : null);
}

export function useStaff() {
  return useRealtimeTable('staff', 'sort_order');
}

export function useAreaMaterials(areaId) {
  return useRealtimeTable('area_materials', 'sort_order', areaId ? { column: 'area_id', value: areaId } : null);
}

export function usePlanningTasks() {
  return useRealtimeTable('planning_tasks', 'priority');
}

export function useWeeklyPlanItems(planId) {
  return useRealtimeTable('weekly_plan_items', 'sort_order', planId ? { column: 'plan_id', value: planId } : null);
}

// ─── Activity Log (custom, no filter in realtime) ───
export function useActivityLog(projectId = null) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    let query = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    const { data: rows } = await query;
    setData(rows || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchData();
    channelCounter++;
    const channelName = `activity-log-${projectId || 'all'}-${channelCounter}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => fetchData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchData]);

  return { data, loading, refetch: fetchData };
}

// ─── CRUD: Projects ───
export async function createProject({ name, client, notes, priority }) {
  const { data, error } = await supabase.from('projects').insert({ name, client, notes, priority }).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, updates) {
  const { error } = await supabase.from('projects').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// ─── CRUD: Areas ───
export async function createArea({ project_id, name, mecanizados_enabled = [], sort_order = 0 }) {
  const { data, error } = await supabase.from('areas').insert({ project_id, name, mecanizados_enabled, sort_order }).select().single();
  if (error) throw error;
  return data;
}

export async function updateArea(id, updates) {
  const { error } = await supabase.from('areas').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteArea(id) {
  const { error } = await supabase.from('areas').delete().eq('id', id);
  if (error) throw error;
}

// ─── CRUD: Area Materials ───
export async function createAreaMaterial({ area_id, name, notes = '', sort_order = 0 }) {
  const { data, error } = await supabase.from('area_materials').insert({ area_id, name, notes, sort_order }).select().single();
  if (error) throw error;
  return data;
}

export async function updateAreaMaterial(id, updates) {
  const { error } = await supabase.from('area_materials').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteAreaMaterial(id) {
  const { error } = await supabase.from('area_materials').delete().eq('id', id);
  if (error) throw error;
}

export async function getAreaMaterialsForArea(areaId) {
  const { data, error } = await supabase.from('area_materials').select('*').eq('area_id', areaId).order('sort_order');
  if (error) throw error;
  return data || [];
}

// ─── CRUD: Furniture ───
export async function createFurniture({ area_id, name, notes = '', image_url = '', sort_order = 0 }) {
  const { data, error } = await supabase.from('furniture').insert({ area_id, name, notes, image_url, sort_order }).select().single();
  if (error) throw error;
  return data;
}

export async function updateFurniture(id, updates) {
  const { error } = await supabase.from('furniture').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteFurniture(id) {
  const { error } = await supabase.from('furniture').delete().eq('id', id);
  if (error) throw error;
}

// ─── CRUD: Planning Tasks ───
export async function createPlanningTask(task) {
  const { data, error } = await supabase.from('planning_tasks').insert(task).select().single();
  if (error) throw error;
  return data;
}

export async function createPlanningTasksBulk(tasks) {
  const { data, error } = await supabase.from('planning_tasks').insert(tasks).select();
  if (error) throw error;
  return data;
}

export async function updatePlanningTask(id, updates) {
  const { error } = await supabase.from('planning_tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function reorderPlanningTasks(orderedIds) {
  const updates = orderedIds.map((id, idx) =>
    supabase.from('planning_tasks').update({ priority: idx }).eq('id', id)
  );
  await Promise.all(updates);
}

export async function deletePlanningTask(id) {
  const { error } = await supabase.from('planning_tasks').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteCompletedPlanningTasks() {
  const { error } = await supabase.from('planning_tasks').delete().eq('status', 'done');
  if (error) throw error;
}

export async function deleteCompletedWeeklyItems(planId) {
  const { error } = await supabase.from('weekly_plan_items').delete().eq('plan_id', planId).eq('status', 'done');
  if (error) throw error;
}

// ─── CRUD: Staff ───
export async function updateStaff(id, updates) {
  const { error } = await supabase.from('staff').update(updates).eq('id', id);
  if (error) throw error;
}

// ─── CRUD: Weekly Plans ───
export async function getWeeklyPlans(weekStart) {
  const { data, error } = await supabase.from('weekly_plans').select('*').eq('week_start', weekStart);
  if (error) throw error;
  return data || [];
}

export async function createWeeklyPlan({ staff_id, week_start }) {
  const { data, error } = await supabase.from('weekly_plans').insert({ staff_id, week_start }).select().single();
  if (error) throw error;
  return data;
}

export async function createWeeklyPlanItemsBulk(items) {
  const { data, error } = await supabase.from('weekly_plan_items').insert(items).select();
  if (error) throw error;
  return data;
}

export async function getWeeklyPlanItems(planId) {
  const { data, error } = await supabase.from('weekly_plan_items').select('*').eq('plan_id', planId).order('day_of_week').order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function updateWeeklyPlanItem(id, updates) {
  const { error } = await supabase.from('weekly_plan_items').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteWeeklyPlanItem(id) {
  const { error } = await supabase.from('weekly_plan_items').delete().eq('id', id);
  if (error) throw error;
}

// ─── Activity Log ───
export async function logActivity({ project_id, area_id = null, action, stage = '', description, user_name = '' }) {
  const { error } = await supabase.from('activity_log').insert({ project_id, area_id, action, stage, description, user_name });
  if (error) console.error('Activity log error:', error);
}

// ─── Image upload ───
export async function uploadFurnitureImage(file) {
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;
  const { data, error } = await supabase.storage.from('furniture-images').upload(fileName, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('furniture-images').getPublicUrl(data.path);
  return urlData.publicUrl;
}

// ─── Auto-propagation engine ───
// When a planning task is marked done, find successor processes, create
// planning tasks AND insert them into the responsible person's weekly plan.
import { PROCESS_SUCCESSORS, STAGES, DEFAULT_STAFF_PROCESSES } from '../lib/constants.js';

function getCurrentMonday() {
  const d = new Date(); const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff); d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export async function propagateNextProcesses(completedTask, allPlanningTasks, staffList) {
  if (!completedTask.stage || !completedTask.project_id) return [];

  const successors = PROCESS_SUCCESSORS[completedTask.stage] || [];
  if (successors.length === 0) return [];

  const created = [];
  const weekStart = getCurrentMonday();

  // Resolve area name: use provided or fetch from DB
  let areaLabel = completedTask._area_name || '';
  if (!areaLabel && completedTask.area_id) {
    try {
      const { data } = await supabase.from('areas').select('name').eq('id', completedTask.area_id).single();
      if (data) areaLabel = data.name;
    } catch (e) { /* ok */ }
  }

  // Get current week's plans to insert items
  let weekPlans = [];
  try { weekPlans = await getWeeklyPlans(weekStart); } catch (e) { console.error(e); }

  for (const nextProc of successors) {
    const alreadyExists = allPlanningTasks.some((t) =>
      t.project_id === completedTask.project_id &&
      t.area_id === completedTask.area_id &&
      t.stage === nextProc &&
      (t.material || '') === (completedTask.material || '')
    );
    if (alreadyExists) continue;

    // Find responsible staff
    let assignedStaff = null;
    for (const member of staffList) {
      const procs = member.default_processes || [];
      if (procs.includes(nextProc)) { assignedStaff = member; break; }
    }

    const stageInfo = STAGES.find((s) => s.id === nextProc);
    const areaLabel = completedTask._area_name || '';
    const matLabel = completedTask.material ? ` (${completedTask.material})` : '';

    const newTask = {
      project_id: completedTask.project_id,
      area_id: completedTask.area_id,
      title: `${stageInfo?.label || nextProc} — ${areaLabel}${matLabel}`,
      stage: nextProc, status: 'pending',
      priority: allPlanningTasks.length + created.length,
      material: completedTask.material || '',
      description: '',
      assigned_to_id: assignedStaff?.id || null,
    };

    try {
      const result = await createPlanningTask(newTask);
      created.push({ ...result, _assigned_staff_id: assignedStaff?.id || null });

      // Also insert into the person's weekly plan
      if (assignedStaff) {
        let plan = weekPlans.find((p) => p.staff_id === assignedStaff.id);
        if (!plan) {
          try {
            plan = await createWeeklyPlan({ staff_id: assignedStaff.id, week_start: weekStart });
            weekPlans.push(plan);
          } catch (e) { console.error('Create plan error:', e); }
        }
        if (plan) {
          // Find next available day (today or later, prefer tomorrow)
          const today = new Date().getDay(); // 0=Sun, 1=Mon...
          const todayIdx = today === 0 ? 6 : today; // 1-6 Mon-Sat
          const startDay = Math.min(todayIdx + 1, 6); // prefer tomorrow, cap at Sat
          try {
            await createWeeklyPlanItemsBulk([{
              plan_id: plan.id, staff_id: assignedStaff.id,
              project_id: completedTask.project_id, area_id: completedTask.area_id,
              process: stageInfo?.label || nextProc,
              material: completedTask.material || '',
              day_of_week: startDay, sort_order: 99,
              status: 'pending', notes: '',
              is_admin: false, is_general: false,
            }]);
          } catch (e) { console.error('Create weekly item error:', e); }
        }
      }
    } catch (e) {
      console.error('Auto-propagation error:', e);
    }
  }

  return created;
}

// Helper: get all staff from DB (non-hook, for use in event handlers)
export async function getAllStaff() {
  const { data, error } = await supabase.from('staff').select('*').order('sort_order');
  if (error) throw error;
  return data || [];
}

// Helper: get all planning tasks (non-hook)
export async function getAllPlanningTasks() {
  const { data, error } = await supabase.from('planning_tasks').select('*').order('priority');
  if (error) throw error;
  return data || [];
}
