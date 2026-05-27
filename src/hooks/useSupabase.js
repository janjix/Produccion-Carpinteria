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
  // Strip any id field so Supabase generates its own UUIDs
  const clean = items.map(({ id, created_at, updated_at, ...rest }) => rest);
  const { data, error } = await supabase.from('weekly_plan_items').insert(clean).select();
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
import { PROCESS_SUCCESSORS, STAGES, PROCESS_PRIMARY_OWNER } from '../lib/constants.js';

function getCurrentMonday() {
  const d = new Date(); const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff); d.setHours(0,0,0,0);
  return d.toISOString().split('T')[0];
}

// Returns 1-6 (Mon-Sat). Today if it's a work day, or Monday if Sunday.
function getTodayDayIndex() {
  const day = new Date().getDay(); // 0=Sun,1=Mon...6=Sat
  if (day === 0) return 1; // Sunday → put on Monday
  return day; // 1-6
}

export async function propagateNextProcesses(completedTask, allPlanningTasks, staffList) {
  if (!completedTask.stage || !completedTask.project_id) return [];
  const successors = PROCESS_SUCCESSORS[completedTask.stage] || [];
  if (successors.length === 0) return [];

  // Resolve area name
  let resolvedAreaName = completedTask._area_name || '';
  if (!resolvedAreaName && completedTask.area_id) {
    try {
      const { data } = await supabase.from('areas').select('name').eq('id', completedTask.area_id).single();
      if (data) resolvedAreaName = data.name;
    } catch (e) { /* ok */ }
  }

  const weekStart = getCurrentMonday();
  const todayDay = getTodayDayIndex();

  // Load week plans once
  let weekPlans = [];
  try { weekPlans = await getWeeklyPlans(weekStart); } catch (e) { console.error(e); }

  const created = [];

  // First, try to unlock any blocked tasks for this area/material
  if (completedTask.area_id) {
    const unlocked = await unlockReadyTasks(completedTask.project_id, completedTask.area_id, completedTask.material);
    for (const u of unlocked) {
      // Push the unlocked tasks into the responsible person's weekly plan
      try { await syncTaskToWeeklyPlan(u, staffList); } catch (e) { console.error(e); }
      created.push(u);
    }
  }

  for (const nextProc of successors) {
    const alreadyExists = allPlanningTasks.some((t) =>
      t.project_id === completedTask.project_id &&
      t.area_id === completedTask.area_id &&
      t.stage === nextProc &&
      (t.material || '') === (completedTask.material || '')
    );
    if (alreadyExists) continue;

    // Find responsible staff member: PRIMARY owner first, then fallback to anyone with the process
    let assignedStaff = null;
    const primaryCode = PROCESS_PRIMARY_OWNER[nextProc];
    if (primaryCode) {
      assignedStaff = staffList.find((m) => m.code === primaryCode && (m.default_processes || []).includes(nextProc));
    }
    if (!assignedStaff) {
      for (const member of staffList) {
        if ((member.default_processes || []).includes(nextProc)) {
          assignedStaff = member; break;
        }
      }
    }

    const stageInfo = STAGES.find((s) => s.id === nextProc);
    const matLabel = completedTask.material ? ` (${completedTask.material})` : '';
    const taskTitle = `${stageInfo?.label || nextProc} — ${resolvedAreaName}${matLabel}`;

    const newTask = {
      project_id: completedTask.project_id,
      area_id: completedTask.area_id,
      title: taskTitle,
      stage: nextProc,
      status: 'pending',
      priority: allPlanningTasks.length + created.length,
      material: completedTask.material || '',
      description: '',
      assigned_to_id: assignedStaff?.id || null,
    };

    try {
      const result = await createPlanningTask(newTask);
      created.push(result);

      // Insert directly into staff's weekly plan for TODAY (or next available day)
      if (assignedStaff) {
        let plan = weekPlans.find((p) => p.staff_id === assignedStaff.id);
        if (!plan) {
          plan = await createWeeklyPlan({ staff_id: assignedStaff.id, week_start: weekStart });
          weekPlans.push(plan);
        }

        // Get current items to find a good sort_order
        let existingCount = 0;
        try {
          const { data: existingItems } = await supabase
            .from('weekly_plan_items').select('id').eq('plan_id', plan.id);
          existingCount = existingItems?.length || 0;
        } catch (e) { /* ok */ }

        await createWeeklyPlanItemsBulk([{
          plan_id: plan.id,
          staff_id: assignedStaff.id,
          project_id: completedTask.project_id,
          area_id: completedTask.area_id,
          process: stageInfo?.label || nextProc,
          material: completedTask.material || '',
          day_of_week: todayDay,
          sort_order: existingCount,
          status: 'pending',
          notes: '',
          is_admin: false,
          is_general: false,
        }]);
      }
    } catch (e) {
      console.error('Propagation error for', nextProc, ':', e);
    }
  }

  return created;
}

// Helper: insert a planning task into the responsible person's current weekly plan
export async function syncTaskToWeeklyPlan(task, staffList) {
  if (!task.stage) return;
  // Find responsible staff: PRIMARY owner first, then fallback
  let assignedStaff = null;
  const primaryCode = PROCESS_PRIMARY_OWNER[task.stage];
  if (primaryCode) {
    assignedStaff = staffList.find((m) => m.code === primaryCode && (m.default_processes || []).includes(task.stage));
  }
  if (!assignedStaff) {
    for (const m of staffList) {
      if ((m.default_processes || []).includes(task.stage)) { assignedStaff = m; break; }
    }
  }
  if (!assignedStaff) return;

  const weekStart = getCurrentMonday();
  const todayDay = getTodayDayIndex();
  const stageInfo = STAGES.find((s) => s.id === task.stage);

  // Get or create plan
  let plan;
  try {
    const weekPlans = await getWeeklyPlans(weekStart);
    plan = weekPlans.find((p) => p.staff_id === assignedStaff.id);
    if (!plan) plan = await createWeeklyPlan({ staff_id: assignedStaff.id, week_start: weekStart });
  } catch (e) { console.error(e); return; }

  // Check if item already exists for this plan
  try {
    const { data: existing } = await supabase.from('weekly_plan_items').select('*').eq('plan_id', plan.id);
    const found = (existing || []).find((i) =>
      i.project_id === task.project_id && i.area_id === task.area_id &&
      i.process === (stageInfo?.label || task.stage) && (i.material || '') === (task.material || '')
    );
    if (found) return; // already there
    const count = existing?.length || 0;
    await createWeeklyPlanItemsBulk([{
      plan_id: plan.id, staff_id: assignedStaff.id,
      project_id: task.project_id, area_id: task.area_id,
      process: stageInfo?.label || task.stage,
      material: task.material || '',
      day_of_week: todayDay, sort_order: count,
      status: task.status || 'pending', notes: task.description || '',
      is_admin: false, is_general: false,
    }]);
  } catch (e) { console.error(e); }
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

// ─── Pipeline generation: create ALL tasks for an area, with proper blocked state ───
// Tasks whose predecessors aren't done are created as status='blocked'.
// Mediciones is NOT included here — it's auto-generated every Wednesday separately.
import { PROCESS_DEPENDENCIES, AUTO_PLANNING_PROCESSES } from '../lib/constants.js';

const ALL_PIPELINE_STAGES = [
  'diseno','revision_diseno','creacion_partidas',
  'req_materiales','req_herrajes','req_sistema','compra_materiales',
  'modelado','planos',
  'optimizacion','corte','canteado','supervision_canteado','mecanizado',
  'ensamblaje','herrajes','supervision_ensamblaje',
  'despacho_materiales','embalaje','instalacion',
  'supervision_instalacion','despacho_admin',
];

const PER_MATERIAL_STAGES = new Set(['optimizacion','corte','canteado','mecanizado']);
// Note: supervision_canteado is per-area (not per-material) since it supervises the whole canteado activity

export async function generateAreaPipeline({ project, area, materials, staffList, existingTasks }) {
  if (!project || !area) return [];
  const created = [];
  let priority = (existingTasks?.length || 0);

  for (const stageId of ALL_PIPELINE_STAGES) {
    const stageInfo = STAGES.find((s) => s.id === stageId);
    if (!stageInfo) continue;

    const isPerMaterial = PER_MATERIAL_STAGES.has(stageId);
    const materialsToUse = isPerMaterial ? (materials || []) : [null];

    // Skip per-material stages if no materials defined
    if (isPerMaterial && materialsToUse.length === 0) continue;

    for (const matObj of materialsToUse) {
      const matName = matObj?.name || '';
      // Skip if task already exists
      const exists = (existingTasks || []).some((t) =>
        t.project_id === project.id && t.area_id === area.id &&
        t.stage === stageId && (t.material || '') === matName
      ) || created.some((t) =>
        t.project_id === project.id && t.area_id === area.id &&
        t.stage === stageId && (t.material || '') === matName
      );
      if (exists) continue;

      // Determine initial status: blocked unless this is the very first stage (diseno)
      const deps = PROCESS_DEPENDENCIES[stageId] || [];
      const initialStatus = deps.length === 0 ? 'pending' : 'blocked';

      const matLabel = matName ? ` (${matName})` : '';
      const title = `${stageInfo.label} — ${area.name}${matLabel}`;

      try {
        const task = await createPlanningTask({
          project_id: project.id, area_id: area.id,
          title, stage: stageId, status: initialStatus,
          priority: priority++,
          material: matName, description: '',
        });
        created.push(task);
        // Sync to staff's weekly plan regardless of status — blocked tasks
        // appear in the person's week visible but locked until unlocked.
        if (staffList) {
          await syncTaskToWeeklyPlan(task, staffList);
        }
      } catch (e) {
        console.error('generateAreaPipeline failed for', stageId, matName, e);
      }
    }
  }
  return created;
}

// Unlock tasks whose predecessors are all done
export async function unlockReadyTasks(projectId, areaId, material) {
  try {
    const { data: tasks } = await supabase.from('planning_tasks').select('*')
      .eq('project_id', projectId)
      .eq('area_id', areaId);
    if (!tasks) return [];

    // Match by material context (for per-material stages, match same material)
    const unlocked = [];
    for (const task of tasks) {
      if (task.status !== 'blocked') continue;
      const deps = PROCESS_DEPENDENCIES[task.stage] || [];
      if (deps.length === 0) continue;

      // Check all predecessors are done for this material context
      const matCtx = task.material || '';
      const taskIsPerMaterial = PER_MATERIAL_STAGES.has(task.stage);
      const allDepsDone = deps.every((depStage) => {
        const depPerMaterial = PER_MATERIAL_STAGES.has(depStage);
        // If both per-material, match material; if mixed, match any done task for that stage in area
        const matchingDeps = tasks.filter((t) => {
          if (t.stage !== depStage) return false;
          if (taskIsPerMaterial && depPerMaterial) return (t.material || '') === matCtx;
          return true;
        });
        if (matchingDeps.length === 0) return false;
        return matchingDeps.every((t) => t.status === 'done');
      });

      if (allDepsDone) {
        await supabase.from('planning_tasks').update({ status: 'pending' }).eq('id', task.id);
        unlocked.push({ ...task, status: 'pending' });
        // Also update any matching weekly_plan_items so the person's UI shows it as unlocked
        try {
          const stageInfo = STAGES.find((s) => s.id === task.stage);
          const label = stageInfo?.label || task.stage;
          const { data: matchItems } = await supabase.from('weekly_plan_items')
            .select('*')
            .eq('project_id', task.project_id)
            .eq('area_id', task.area_id)
            .eq('process', label);
          if (matchItems) {
            for (const item of matchItems) {
              if ((item.material || '') === (task.material || '') && item.status === 'blocked') {
                await supabase.from('weekly_plan_items').update({ status: 'pending' }).eq('id', item.id);
              }
            }
          }
        } catch (e) { console.error('Could not sync weekly_plan_item unlock:', e); }
      }
    }
    return unlocked;
  } catch (e) {
    console.error('unlockReadyTasks error:', e);
    return [];
  }
}

// One-time cleanup: delete tasks of per-material stages that have NO material.
// These are leftovers from earlier versions when per-material logic wasn't enforced.
export async function cleanupMaterialessTasks() {
  const stagesToCheck = ['optimizacion','corte','canteado','mecanizado'];
  try {
    // Find all tasks for those stages with empty/null material
    const { data: tasks, error } = await supabase.from('planning_tasks')
      .select('*').in('stage', stagesToCheck);
    if (error) throw error;
    const toDelete = (tasks || []).filter((t) => !t.material || t.material.trim() === '');
    let deleted = 0;
    for (const t of toDelete) {
      try {
        await supabase.from('planning_tasks').delete().eq('id', t.id);
        deleted++;
      } catch (e) { console.error('Failed to delete', t.id, e); }
    }
    return deleted;
  } catch (e) {
    console.error('cleanupMaterialessTasks error:', e);
    return 0;
  }
}

// Mediciones is auto-generated every Wednesday for AV.
// Call once when manager opens the week — creates a single weekly item if not present.
export async function ensureWednesdayMediciones(staffList, weekStartStr) {
  try {
    const av = staffList.find((m) => m.code === 'AV');
    if (!av) return null;
    const plans = await getWeeklyPlans(weekStartStr);
    let plan = plans.find((p) => p.staff_id === av.id);
    if (!plan) plan = await createWeeklyPlan({ staff_id: av.id, week_start: weekStartStr });
    // Check if mediciones item already exists for this week
    const { data: items } = await supabase.from('weekly_plan_items').select('*').eq('plan_id', plan.id);
    const hasMediciones = (items || []).some((i) => i.process === 'Mediciones');
    if (hasMediciones) return null;
    await createWeeklyPlanItemsBulk([{
      plan_id: plan.id, staff_id: av.id,
      project_id: null, area_id: null,
      process: 'Mediciones', material: '',
      day_of_week: 3, // Miércoles
      sort_order: (items?.length || 0),
      status: 'pending', notes: 'Mediciones semanales programadas (miércoles).',
      is_admin: false, is_general: true,
    }]);
    return true;
  } catch (e) {
    console.error('ensureWednesdayMediciones error:', e);
    return null;
  }
}

// Sync a planning_task's status change to any matching weekly_plan_item
export async function syncStatusToWeeklyItems(task, newStatus) {
  if (!task.stage || !task.project_id) return;
  try {
    const stageInfo = STAGES.find((s) => s.id === task.stage);
    const label = stageInfo?.label || task.stage;
    const { data: items } = await supabase.from('weekly_plan_items')
      .select('*')
      .eq('project_id', task.project_id)
      .eq('process', label);
    if (!items) return;
    for (const item of items) {
      if (
        (item.area_id || '') === (task.area_id || '') &&
        (item.material || '') === (task.material || '') &&
        item.status !== newStatus
      ) {
        await supabase.from('weekly_plan_items').update({ status: newStatus }).eq('id', item.id);
      }
    }
  } catch (e) {
    console.error('syncStatusToWeeklyItems error:', e);
  }
}
