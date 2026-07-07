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

// Set project status. Used by pause/resume. Status: 'active' | 'paused' | 'completed' | 'archived'
export async function setProjectStatus(id, status) {
  const { error } = await supabase.from('projects').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// Dismiss every weekly_plan_item that belongs to a project (current week or all weeks).
// Used when a manager pauses a project — clears its noise from personal plannings.
// Returns the count of items dismissed.
export async function dismissProjectFromWeek(projectId, weekStartStr = null) {
  try {
    let query = supabase.from('weekly_plan_items').update({ status: 'dismissed' }).eq('project_id', projectId).neq('status', 'done');
    if (weekStartStr) {
      // Join via plan_id: get plans for that week first
      const { data: plans } = await supabase.from('weekly_plans').select('id').eq('week_start', weekStartStr);
      const planIds = (plans || []).map((p) => p.id);
      if (planIds.length === 0) return 0;
      query = supabase.from('weekly_plan_items').update({ status: 'dismissed' }).eq('project_id', projectId).neq('status', 'done').in('plan_id', planIds);
    }
    const { error, count } = await query.select('id');
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('dismissProjectFromWeek error:', e);
    return 0;
  }
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
export async function createArea({ project_id, name, mecanizados_enabled = [], sort_order = 0, scheduled_week_start = null }) {
  const { data, error } = await supabase.from('areas').insert({ project_id, name, mecanizados_enabled, sort_order, scheduled_week_start }).select().single();
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

// Renombra un material del área y propaga el cambio a todas las tareas activas
// (planning_tasks y weekly_plan_items) que usan el nombre anterior en esa misma área.
// NO toca tareas ya completadas (status='done') ni descartadas ('dismissed'),
// para preservar el histórico real de producción.
export async function renameAreaMaterial(materialId, oldName, newName, areaId) {
  const oldTrim = (oldName || '').trim();
  const newTrim = (newName || '').trim();
  if (!newTrim) throw new Error('El nombre nuevo no puede estar vacío.');
  if (oldTrim === newTrim) return { renamed: 0, itemsUpdated: 0 };

  try {
    // 1) El registro maestro del material
    const { error: matErr } = await supabase.from('area_materials')
      .update({ name: newTrim })
      .eq('id', materialId);
    if (matErr) throw matErr;

    // 2) planning_tasks del área que aún están activas
    const { data: tasks, error: tErr } = await supabase.from('planning_tasks')
      .select('id, title, material')
      .eq('area_id', areaId)
      .eq('material', oldTrim)
      .not('status', 'in', '(done,dismissed)');
    if (tErr) throw tErr;

    const taskIds = (tasks || []).map((t) => t.id);
    if (taskIds.length > 0) {
      // Update material + regenerar title si contenía el nombre viejo entre paréntesis
      // El title generado tiene forma: "Proceso — Área (Material)"
      for (const task of tasks) {
        const updates = { material: newTrim };
        if (task.title && task.title.includes(`(${oldTrim})`)) {
          updates.title = task.title.replace(`(${oldTrim})`, `(${newTrim})`);
        }
        await supabase.from('planning_tasks').update(updates).eq('id', task.id);
      }
    }

    // 3) weekly_plan_items activos del área
    const { data: items, error: iErr } = await supabase.from('weekly_plan_items')
      .select('id')
      .eq('area_id', areaId)
      .eq('material', oldTrim)
      .not('status', 'in', '(done,dismissed)');
    if (iErr) throw iErr;

    if (items && items.length > 0) {
      const itemIds = items.map((i) => i.id);
      const { error: updErr } = await supabase.from('weekly_plan_items')
        .update({ material: newTrim })
        .in('id', itemIds);
      if (updErr) throw updErr;
    }

    return { renamed: taskIds.length, itemsUpdated: items?.length || 0 };
  } catch (e) {
    console.error('renameAreaMaterial error:', e);
    throw e;
  }
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
  const final = { ...updates, updated_at: new Date().toISOString() };
  // Stamp completed_at when status transitions to/from done
  if (updates.status === 'done') final.completed_at = new Date().toISOString();
  else if (updates.status && updates.status !== 'done') final.completed_at = null;
  const { error } = await supabase.from('planning_tasks').update(final).eq('id', id);
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

// Soft-delete: mark as dismissed so refresh/sync won't reinsert it this week.
export async function dismissWeeklyPlanItem(id) {
  const { error } = await supabase.from('weekly_plan_items').update({ status: 'dismissed' }).eq('id', id);
  if (error) throw error;
}

// Mueve un weekly_plan_item a la semana indicada (y opcionalmente a otro responsable).
// - deltaWeeks: entero (1 = próxima semana, -1 = semana anterior, 2 = en dos semanas, etc.)
// - targetStaffId: si se pasa, cambia el responsable (crea el plan de esa persona si no existe)
// - fromWeekStart: fecha ISO YYYY-MM-DD de la semana actual del item (para calcular la destino)
export async function moveWeeklyItemToWeek(itemId, { deltaWeeks = 1, targetStaffId = null, fromWeekStart }) {
  try {
    // Leer el item actual
    const { data: item, error: itemErr } = await supabase.from('weekly_plan_items').select('*').eq('id', itemId).single();
    if (itemErr) throw itemErr;

    // Calcular la fecha de la semana destino
    const fromDate = new Date(fromWeekStart + 'T00:00:00');
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + deltaWeeks * 7);
    const y = toDate.getFullYear();
    const m = String(toDate.getMonth() + 1).padStart(2, '0');
    const d = String(toDate.getDate()).padStart(2, '0');
    const toWeekStart = `${y}-${m}-${d}`;

    const newStaffId = targetStaffId || item.staff_id;

    // Buscar o crear el plan destino
    const { data: existingPlans } = await supabase.from('weekly_plans').select('*').eq('week_start', toWeekStart).eq('staff_id', newStaffId);
    let targetPlan = (existingPlans || [])[0];
    if (!targetPlan) {
      const created = await createWeeklyPlan({ staff_id: newStaffId, week_start: toWeekStart });
      targetPlan = created;
    }

    // Actualizar el item: plan_id, staff_id (por si cambia), conservando day_of_week/status/notes/estimated_hours
    const { error: updErr } = await supabase.from('weekly_plan_items').update({
      plan_id: targetPlan.id,
      staff_id: newStaffId,
    }).eq('id', itemId);
    if (updErr) throw updErr;

    return { ok: true, toWeekStart, targetPlanId: targetPlan.id, newStaffId };
  } catch (e) {
    console.error('moveWeeklyItemToWeek error:', e);
    throw e;
  }
}

// Reasigna un weekly_plan_item a otro miembro del equipo (misma semana).
// También actualiza el planning_task general si corresponde.
export async function reassignWeeklyItem(itemId, newStaffId) {
  try {
    const { data: item, error: itemErr } = await supabase.from('weekly_plan_items').select('*').eq('id', itemId).single();
    if (itemErr) throw itemErr;

    // Buscar el plan de la persona nueva para la MISMA semana
    const { data: currentPlan } = await supabase.from('weekly_plans').select('week_start').eq('id', item.plan_id).single();
    if (!currentPlan) throw new Error('Plan actual no encontrado');

    const { data: existingPlans } = await supabase.from('weekly_plans').select('*').eq('week_start', currentPlan.week_start).eq('staff_id', newStaffId);
    let targetPlan = (existingPlans || [])[0];
    if (!targetPlan) {
      targetPlan = await createWeeklyPlan({ staff_id: newStaffId, week_start: currentPlan.week_start });
    }

    // Mover el item
    const { error: updErr } = await supabase.from('weekly_plan_items').update({
      plan_id: targetPlan.id,
      staff_id: newStaffId,
    }).eq('id', itemId);
    if (updErr) throw updErr;

    // Actualizar la planning_task general si podemos identificarla
    if (item.project_id && item.stage_id) {
      try {
        const { data: tasks } = await supabase.from('planning_tasks').select('*')
          .eq('project_id', item.project_id)
          .eq('stage', item.stage_id);
        const match = (tasks || []).find((t) =>
          (t.area_id || null) === (item.area_id || null) &&
          (t.material || '') === (item.material || '')
        );
        if (match) {
          await supabase.from('planning_tasks').update({ assigned_to_id: newStaffId }).eq('id', match.id);
        }
      } catch (e) { console.error('No se pudo actualizar planning_task:', e); }
    }

    return { ok: true, targetPlanId: targetPlan.id };
  } catch (e) {
    console.error('reassignWeeklyItem error:', e);
    throw e;
  }
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
          stage_id: nextProc,
          material: completedTask.material || '',
          day_of_week: todayDay,
          sort_order: existingCount,
          status: 'pending',
          notes: '',
          estimated_hours: PROCESS_DEFAULT_HOURS[nextProc] ?? null,
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
export async function syncTaskToWeeklyPlan(task, staffList, opts = {}) {
  if (!task.stage) return;
  // Skip if project is paused: nothing should land in personal planning for a paused project
  if (task.project_id) {
    try {
      const { data: proj } = await supabase.from('projects').select('status').eq('id', task.project_id).single();
      if (proj && (proj.status === 'paused' || proj.status === 'archived')) return;
    } catch (e) { /* ignore — assume active */ }
  }
  // Respetar la semana programada. Si la fecha es futura y no se fuerza (opts.force),
  // no insertar aun. El item entrara cuando llegue esa semana via applyScheduledWeeks.
  if (!opts.force) {
    let scheduled = task.scheduled_week_start;
    // Fallback: si la tarea no trae la columna (undefined o null), leer del area
    if ((scheduled === undefined || scheduled === null) && task.area_id) {
      try {
        const { data: area } = await supabase.from('areas').select('scheduled_week_start').eq('id', task.area_id).single();
        if (area && area.scheduled_week_start) scheduled = area.scheduled_week_start;
      } catch (e) { /* ignore */ }
    }
    if (scheduled) {
      const currentMon = getCurrentMonday();
      // Comparar como Date para evitar problemas de tipo string vs Date
      const scheduledStr = typeof scheduled === 'string' ? scheduled : new Date(scheduled).toISOString().slice(0, 10);
      if (scheduledStr > currentMon) {
        console.log('[syncTaskToWeeklyPlan] Saltando tarea programada para', scheduledStr, '(actual:', currentMon, ')', task.stage, task.material || '');
        return;
      }
    }
  }
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
  const stageLabel = stageInfo?.label || task.stage;

  let plan;
  try {
    const weekPlans = await getWeeklyPlans(weekStart);
    plan = weekPlans.find((p) => p.staff_id === assignedStaff.id);
    if (!plan) plan = await createWeeklyPlan({ staff_id: assignedStaff.id, week_start: weekStart });
  } catch (e) { console.error(e); return; }

  try {
    const { data: existing } = await supabase.from('weekly_plan_items').select('*').eq('plan_id', plan.id);
    const norm = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

    const found = (existing || []).find((i) => {
      if (i.project_id !== task.project_id) return false;
      if ((i.area_id || null) !== (task.area_id || null)) return false;
      if ((i.material || '') !== (task.material || '')) return false;
      if (i.stage_id) return i.stage_id === task.stage;
      return norm(i.process) === norm(stageLabel);
    });

    if (found) {
      // Respect dismissed items: do NOT re-insert nor change their status
      if (found.status === 'dismissed') return;
      const targetStatus = task.status || 'pending';
      if (found.status !== targetStatus) {
        await supabase.from('weekly_plan_items').update({ status: targetStatus }).eq('id', found.id);
      }
      if (!found.stage_id) {
        await supabase.from('weekly_plan_items').update({ stage_id: task.stage }).eq('id', found.id);
      }
      return;
    }
    const count = existing?.length || 0;
    const hours = task.estimated_hours != null ? task.estimated_hours : (PROCESS_DEFAULT_HOURS[task.stage] ?? null);
    await createWeeklyPlanItemsBulk([{
      plan_id: plan.id, staff_id: assignedStaff.id,
      project_id: task.project_id, area_id: task.area_id,
      process: stageLabel, stage_id: task.stage,
      material: task.material || '',
      day_of_week: todayDay, sort_order: count,
      status: task.status || 'pending', notes: task.description || '',
      estimated_hours: hours,
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
import { PROCESS_DEPENDENCIES, AUTO_PLANNING_PROCESSES, STAGE_ORDER, PROCESS_DEFAULT_HOURS } from '../lib/constants.js';

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
          scheduled_week_start: area.scheduled_week_start || null,
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
        try {
          const stageInfo = STAGES.find((s) => s.id === task.stage);
          const label = stageInfo?.label || task.stage;
          const { data: matchItems } = await supabase.from('weekly_plan_items')
            .select('*')
            .eq('project_id', task.project_id)
            .eq('area_id', task.area_id);
          if (matchItems) {
            const norm = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
            for (const item of matchItems) {
              if ((item.material || '') !== (task.material || '')) continue;
              if (item.status === 'dismissed') continue;
              const sameStage = item.stage_id ? item.stage_id === task.stage : norm(item.process) === norm(label);
              if (sameStage && item.status === 'blocked') {
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

// Inverse of unlock: when a task is un-completed (done → pending/in_progress),
// re-block any successor tasks whose dependencies are no longer fully satisfied.
// Cascades: re-blocking a task also re-blocks ITS successors, etc.
export async function reblockDependentTasks(projectId, areaId) {
  try {
    const { data: tasks } = await supabase.from('planning_tasks').select('*')
      .eq('project_id', projectId)
      .eq('area_id', areaId);
    if (!tasks) return [];

    // Build a quick lookup of current statuses (mutated as we re-block)
    const statusById = {};
    tasks.forEach((t) => { statusById[t.id] = t.status; });

    const reblocked = [];
    let changed = true;
    // Iterate until no more changes (handles multi-level cascade)
    let safety = 0;
    while (changed && safety < 20) {
      changed = false;
      safety++;
      for (const task of tasks) {
        // Only consider tasks that are currently unlocked but not done
        const curStatus = statusById[task.id];
        if (curStatus === 'done' || curStatus === 'blocked') continue;

        const deps = PROCESS_DEPENDENCIES[task.stage] || [];
        if (deps.length === 0) continue; // no deps, never blocks (e.g. diseno, mediciones)

        const taskIsPerMaterial = PER_MATERIAL_STAGES.has(task.stage);
        const matCtx = task.material || '';

        // Are all dependencies still satisfied (done)?
        const allDepsDone = deps.every((depStage) => {
          const depPerMaterial = PER_MATERIAL_STAGES.has(depStage);
          const matchingDeps = tasks.filter((t) => {
            if (t.stage !== depStage) return false;
            if (taskIsPerMaterial && depPerMaterial) return (t.material || '') === matCtx;
            return true;
          });
          if (matchingDeps.length === 0) return false;
          return matchingDeps.every((t) => statusById[t.id] === 'done');
        });

        // If dependencies are NOT all done, this task must go back to blocked
        if (!allDepsDone) {
          statusById[task.id] = 'blocked';
          changed = true;
          await supabase.from('planning_tasks').update({ status: 'blocked' }).eq('id', task.id);
          reblocked.push({ ...task, status: 'blocked' });

          // Mirror to weekly_plan_items
          try {
            const stageInfo = STAGES.find((s) => s.id === task.stage);
            const label = stageInfo?.label || task.stage;
            const { data: matchItems } = await supabase.from('weekly_plan_items')
              .select('*')
              .eq('project_id', task.project_id)
              .eq('area_id', task.area_id);
            if (matchItems) {
              const norm = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
              for (const item of matchItems) {
                if ((item.material || '') !== (task.material || '')) continue;
                if (item.status === 'dismissed' || item.status === 'blocked' || item.status === 'done') continue;
                const sameStage = item.stage_id ? item.stage_id === task.stage : norm(item.process) === norm(label);
                if (sameStage) {
                  await supabase.from('weekly_plan_items').update({ status: 'blocked' }).eq('id', item.id);
                }
              }
            }
          } catch (e) { console.error('reblock weekly sync error:', e); }
        }
      }
    }
    return reblocked;
  } catch (e) {
    console.error('reblockDependentTasks error:', e);
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
    const norm = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const { data: items } = await supabase.from('weekly_plan_items')
      .select('*')
      .eq('project_id', task.project_id);
    if (!items) return;
    for (const item of items) {
      if ((item.area_id || null) !== (task.area_id || null)) continue;
      if ((item.material || '') !== (task.material || '')) continue;
      if (item.status === 'dismissed') continue;
      const sameStage = item.stage_id ? item.stage_id === task.stage : norm(item.process) === norm(label);
      if (sameStage && item.status !== newStatus) {
        await supabase.from('weekly_plan_items').update({ status: newStatus }).eq('id', item.id);
      }
    }
  } catch (e) {
    console.error('syncStatusToWeeklyItems error:', e);
  }
}

// ─── Assign ONE project's tasks to this week (used by the manager wizard) ───
export async function assignProjectToWeek({ projectId, weekStartStr, staffList, forceAreaIds = [] }) {
  const result = { assignedByStaff: {}, skipped: 0, total: 0, futureSkipped: 0 };
  if (!projectId) return result;
  try {
    const { data: tasks } = await supabase.from('planning_tasks').select('*')
      .eq('project_id', projectId).neq('status', 'done').neq('status', 'dismissed');
    if (!tasks || tasks.length === 0) return result;

    // Filtrar por semana programada. Solo entran tareas cuya semana ya llego,
    // o tareas de areas marcadas en forceAreaIds (adelantar).
    const filteredTasks = tasks.filter((t) => {
      if (!t.scheduled_week_start) return true;
      if (t.scheduled_week_start <= weekStartStr) return true;
      if (t.area_id && forceAreaIds.includes(t.area_id)) return true;
      result.futureSkipped++;
      return false;
    });
    if (filteredTasks.length === 0) return result;

    filteredTasks.sort((a, b) => {
      const ao = STAGE_ORDER[a.stage] ?? 99;
      const bo = STAGE_ORDER[b.stage] ?? 99;
      if (ao !== bo) return ao - bo;
      return (a.material || '').localeCompare(b.material || '');
    });

    // Loop usa filteredTasks
    const weekPlans = await getWeeklyPlans(weekStartStr);
    const planByStaffId = {};
    weekPlans.forEach((p) => { planByStaffId[p.staff_id] = p; });
    const existingItemsByPlan = {};
    for (const p of weekPlans) {
      try { existingItemsByPlan[p.id] = await getWeeklyPlanItems(p.id); } catch (e) { existingItemsByPlan[p.id] = []; }
    }

    const today = getTodayDayIndex();
    const workDays = [];
    for (let d = today; d <= 6; d++) workDays.push(d);
    if (workDays.length === 0) workDays.push(6);
    const cursorByStaff = {};
    const norm = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

    for (const task of filteredTasks) {
      result.total++;
      let assignedStaff = null;
      const primaryCode = PROCESS_PRIMARY_OWNER[task.stage];
      if (task.assigned_to_id) assignedStaff = staffList.find((m) => m.id === task.assigned_to_id);
      if (!assignedStaff && primaryCode) {
        assignedStaff = staffList.find((m) => m.code === primaryCode && (m.default_processes || []).includes(task.stage));
      }
      if (!assignedStaff) {
        for (const m of staffList) {
          if ((m.default_processes || []).includes(task.stage)) { assignedStaff = m; break; }
        }
      }
      if (!assignedStaff) { result.skipped++; continue; }

      let plan = planByStaffId[assignedStaff.id];
      if (!plan) {
        plan = await createWeeklyPlan({ staff_id: assignedStaff.id, week_start: weekStartStr });
        planByStaffId[assignedStaff.id] = plan;
        existingItemsByPlan[plan.id] = [];
      }

      const stageInfo = STAGES.find((s) => s.id === task.stage);
      const label = stageInfo?.label || task.stage;
      const existing = existingItemsByPlan[plan.id] || [];
      const dup = existing.find((i) => {
        if ((i.area_id || null) !== (task.area_id || null)) return false;
        if ((i.material || '') !== (task.material || '')) return false;
        return i.stage_id ? i.stage_id === task.stage : norm(i.process) === norm(label);
      });

      if (dup) {
        if (dup.status === 'dismissed') {
          await supabase.from('weekly_plan_items').update({ status: task.status || 'pending' }).eq('id', dup.id);
          dup.status = task.status || 'pending';
          result.assignedByStaff[assignedStaff.id] = (result.assignedByStaff[assignedStaff.id] || 0) + 1;
        } else {
          result.skipped++;
        }
        continue;
      }

      cursorByStaff[assignedStaff.id] = (cursorByStaff[assignedStaff.id] ?? existing.filter((i) => i.status !== 'dismissed' && i.status !== 'done').length);
      const day = workDays[cursorByStaff[assignedStaff.id] % workDays.length];
      cursorByStaff[assignedStaff.id]++;

      const hours = task.estimated_hours != null ? task.estimated_hours : (PROCESS_DEFAULT_HOURS[task.stage] ?? null);
      await createWeeklyPlanItemsBulk([{
        plan_id: plan.id, staff_id: assignedStaff.id,
        project_id: projectId, area_id: task.area_id,
        process: label, stage_id: task.stage,
        material: task.material || '',
        day_of_week: day, sort_order: existing.length,
        status: task.status || 'pending', notes: task.description || '',
        estimated_hours: hours,
        is_admin: false, is_general: false,
      }]);

      result.assignedByStaff[assignedStaff.id] = (result.assignedByStaff[assignedStaff.id] || 0) + 1;
      existing.push({ stage_id: task.stage, area_id: task.area_id, material: task.material || '', status: task.status || 'pending', process: label });
    }
  } catch (e) {
    console.error('assignProjectToWeek error:', e);
  }
  return result;
}

// Aplica todas las tareas cuya semana programada llego (<= lunes actual)
// y aun no aparecen en las planificaciones personales.
// Optimizada: 1 SELECT masivo de tareas + 1 SELECT de items existentes de la semana +
// creación bulk de planes faltantes + 1 INSERT bulk de items nuevos.
export async function applyScheduledWeeks() {
  const applied = { count: 0, areas: [] };
  try {
    const currentMon = getCurrentMonday();

    // 1) Tareas elegibles
    const { data: tasks, error } = await supabase.from('planning_tasks')
      .select('*')
      .lte('scheduled_week_start', currentMon)
      .not('status', 'in', '(done,dismissed)');
    if (error) throw error;
    if (!tasks || tasks.length === 0) return applied;

    // 2) Filtrar tareas de proyectos pausados/archivados (una sola query masiva)
    const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))];
    let pausedProjectIds = new Set();
    if (projectIds.length > 0) {
      const { data: projs } = await supabase.from('projects')
        .select('id, status').in('id', projectIds);
      pausedProjectIds = new Set((projs || []).filter((p) => p.status === 'paused' || p.status === 'archived').map((p) => p.id));
    }
    const activeTasks = tasks.filter((t) => !t.project_id || !pausedProjectIds.has(t.project_id));
    if (activeTasks.length === 0) return applied;

    // 3) Staff + planes de la semana actual
    const staffList = await getAllStaff();
    const weekPlans = await getWeeklyPlans(currentMon);
    const planByStaffId = {};
    weekPlans.forEach((p) => { planByStaffId[p.staff_id] = p; });

    // Crear planes faltantes de una sola vez (por si algún miembro no tiene semana aún)
    const missingPlans = staffList.filter((m) => !planByStaffId[m.id]).map((m) => ({ staff_id: m.id, week_start: currentMon }));
    if (missingPlans.length > 0) {
      const { data: created } = await supabase.from('weekly_plans').insert(missingPlans).select();
      (created || []).forEach((p) => { planByStaffId[p.staff_id] = p; });
    }

    // 4) Items existentes en la semana actual (todos los planes) — una sola query
    const planIds = Object.values(planByStaffId).map((p) => p.id);
    let existingItems = [];
    if (planIds.length > 0) {
      const { data } = await supabase.from('weekly_plan_items')
        .select('id, plan_id, staff_id, project_id, area_id, stage_id, material, status, process')
        .in('plan_id', planIds);
      existingItems = data || [];
    }
    const norm = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const existsKey = (projectId, areaId, stage, material, stageLabel) => {
      return existingItems.some((i) => {
        if ((i.project_id || null) !== (projectId || null)) return false;
        if ((i.area_id || null) !== (areaId || null)) return false;
        if ((i.material || '') !== (material || '')) return false;
        if (i.stage_id) return i.stage_id === stage;
        return norm(i.process) === norm(stageLabel);
      });
    };

    // 5) Preparar inserts en batch, respetando dismissed (no reinsertar)
    const dismissedKey = new Set();
    existingItems.forEach((i) => {
      if (i.status === 'dismissed') {
        dismissedKey.add(`${i.project_id||''}|${i.area_id||''}|${i.stage_id||''}|${i.material||''}`);
      }
    });

    const today = getTodayDayIndex();
    const cursorByStaff = {}; // para round-robin de days
    const workDays = [];
    for (let d = today; d <= 6; d++) workDays.push(d);
    if (workDays.length === 0) workDays.push(6);

    const toInsert = [];
    for (const task of activeTasks) {
      const stageInfo = STAGES.find((s) => s.id === task.stage);
      const label = stageInfo?.label || task.stage;

      // Saltar si dismissed en esta semana
      const dKey = `${task.project_id||''}|${task.area_id||''}|${task.stage||''}|${task.material||''}`;
      if (dismissedKey.has(dKey)) continue;

      // Saltar si ya existe (activo)
      if (existsKey(task.project_id, task.area_id, task.stage, task.material, label)) continue;

      // Responsable
      let assignedStaff = null;
      const primaryCode = PROCESS_PRIMARY_OWNER[task.stage];
      if (task.assigned_to_id) assignedStaff = staffList.find((m) => m.id === task.assigned_to_id);
      if (!assignedStaff && primaryCode) {
        assignedStaff = staffList.find((m) => m.code === primaryCode && (m.default_processes || []).includes(task.stage));
      }
      if (!assignedStaff) {
        for (const m of staffList) {
          if ((m.default_processes || []).includes(task.stage)) { assignedStaff = m; break; }
        }
      }
      if (!assignedStaff) continue;

      const plan = planByStaffId[assignedStaff.id];
      if (!plan) continue;

      // Round-robin de días por persona
      cursorByStaff[assignedStaff.id] = cursorByStaff[assignedStaff.id] ?? 0;
      const day = workDays[cursorByStaff[assignedStaff.id] % workDays.length];
      cursorByStaff[assignedStaff.id]++;

      const hours = task.estimated_hours != null ? task.estimated_hours : (PROCESS_DEFAULT_HOURS[task.stage] ?? null);

      toInsert.push({
        plan_id: plan.id, staff_id: assignedStaff.id,
        project_id: task.project_id, area_id: task.area_id,
        process: label, stage_id: task.stage,
        material: task.material || '',
        day_of_week: day, sort_order: 0,
        status: task.status || 'pending',
        notes: task.description || '',
        estimated_hours: hours,
        is_admin: false, is_general: false,
      });

      applied.count++;
      if (task.area_id && !applied.areas.includes(task.area_id)) applied.areas.push(task.area_id);
    }

    // 6) INSERT bulk
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('weekly_plan_items').insert(toInsert);
      if (insErr) {
        console.error('applyScheduledWeeks bulk insert error:', insErr);
        applied.count = 0;
      }
    }

    return applied;
  } catch (e) {
    console.error('applyScheduledWeeks error:', e);
    return applied;
  }
}

// Adelanta UNA sola tarea a la semana actual
export async function advanceTaskToCurrentWeek(taskId) {
  try {
    const { data: task } = await supabase.from('planning_tasks').select('*').eq('id', taskId).single();
    if (!task) throw new Error('Tarea no encontrada');
    const currentMon = getCurrentMonday();
    await supabase.from('planning_tasks').update({ scheduled_week_start: currentMon }).eq('id', taskId);
    const staffList = await getAllStaff();
    await syncTaskToWeeklyPlan({ ...task, scheduled_week_start: currentMon }, staffList, { force: true });
    return { ok: true };
  } catch (e) {
    console.error('advanceTaskToCurrentWeek error:', e);
    throw e;
  }
}

// Cambia la semana de arranque de un area y de todas sus planning_tasks aun no completadas
export async function updateAreaScheduledWeek(areaId, newWeekStart) {
  try {
    await supabase.from('areas').update({ scheduled_week_start: newWeekStart }).eq('id', areaId);
    await supabase.from('planning_tasks')
      .update({ scheduled_week_start: newWeekStart })
      .eq('area_id', areaId)
      .not('status', 'in', '(done,dismissed)');
    return { ok: true };
  } catch (e) {
    console.error('updateAreaScheduledWeek error:', e);
    throw e;
  }
}
