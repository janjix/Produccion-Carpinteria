import { useState, useEffect, useCallback, useRef } from 'react';
import { Btn, Modal, InputField, Badge, EmptyState } from './UI.jsx';
import { MecanizadoChecklist } from './Planning.jsx';
import { supabase } from '../lib/supabase.js';

import { STAGES, DAYS_OF_WEEK, PROJECT_COLORS, MATERIAL_COLORS, MANAGER_CODES, STAGE_ORDER, PROCESS_PRIMARY_OWNER, PROCESS_DEFAULT_HOURS } from '../lib/constants.js';
import {
  useStaff, usePlanningTasks,
  getWeeklyPlans, createWeeklyPlan, createWeeklyPlanItemsBulk,
  getWeeklyPlanItems, updateWeeklyPlanItem, deleteWeeklyPlanItem, dismissWeeklyPlanItem,
  deleteCompletedWeeklyItems, updatePlanningTask, updateProject,
  createPlanningTask, createArea, ensureWednesdayMediciones,
  reblockDependentTasks, assignProjectToWeek,
  setProjectStatus, dismissProjectFromWeek,
  moveWeeklyItemToWeek, reassignWeeklyItem,
  applyScheduledWeeks, advanceTaskToCurrentWeek,
  propagateNextProcesses, getAllPlanningTasks, getAllStaff, logActivity,
} from '../hooks/useSupabase.js';

function getMonday(d) {
  const date = new Date(d); const day = date.getDay();
  date.setDate(date.getDate() - day + (day===0?-6:1));
  date.setHours(0,0,0,0); return date;
}
function formatWeek(monday) {
  const end = new Date(monday); end.setDate(end.getDate()+5);
  const o = { day:'2-digit', month:'short' };
  return `${monday.toLocaleDateString('es-MX',o)} — ${end.toLocaleDateString('es-MX',o)}`;
}
function toDateStr(d) {
  // Usar componentes locales para evitar corrimientos por zona horaria.
  // toISOString() convierte a UTC y puede regresar la fecha del día anterior
  // cuando la zona local está detrás de UTC (como Venezuela, UTC-4).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function getTodayDayIndex() { const d = new Date().getDay(); return d===0?1:d; }

function getMaterialColor(name, allNames) {
  const sorted = [...new Set(allNames.filter(Boolean))].sort();
  const i = sorted.indexOf(name);
  return MATERIAL_COLORS[i>=0 ? i%MATERIAL_COLORS.length : 0];
}

export default function StaffView({ projects, allAreas, userName, currentStaff }) {
  const { data: staff } = useStaff();
  const { data: planningTasks } = usePlanningTasks();
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const [plans, setPlans] = useState([]);
  const [planItems, setPlanItems] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTarget, setAddTarget] = useState(null);
  const [addForm, setAddForm] = useState({ process:'', project_id:'', area_name:'', material:'', day:1, notes:'', estimated_hours:'' });
  // Priority modal: opens before generating
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [priorityOrder, setPriorityOrder] = useState([]); // array of project ids in priority order

  // Project-by-project wizard
  const [showProjectWizard, setShowProjectWizard] = useState(false);
  const [wizardProjectId, setWizardProjectId] = useState('');
  const [wizardWeekPriority, setWizardWeekPriority] = useState('medium');
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardForceAreas, setWizardForceAreas] = useState([]); // areas a adelantar en este wizard

  // ─── Filters & view mode (v23) ───
  const [viewMode, setViewMode] = useState('people');
  const [showBlocked, setShowBlocked] = useState(false);
  const [onlyHighPriority, setOnlyHighPriority] = useState(false);
  const [onlyStalled, setOnlyStalled] = useState(false);
  const [hidePausedProjects, setHidePausedProjects] = useState(true);

  // ─── Menú "..." por tarea (v25) ───
  const [taskActionsFor, setTaskActionsFor] = useState(null); // item completo
  const [reassignModal, setReassignModal] = useState(null);   // { item }
  const [reassignShowAll, setReassignShowAll] = useState(false);
  const [moveModal, setMoveModal] = useState(null);           // { item }
  const [movePickerDate, setMovePickerDate] = useState('');

  const isManager = currentStaff && MANAGER_CODES.includes(currentStaff.code);
  const weekStr = toDateStr(currentMonday);

  const projectMap = {}; projects.forEach((p) => { projectMap[p.id] = p.name; });
  const projectColorMap = {}; projects.forEach((p,i) => { projectColorMap[p.id] = PROJECT_COLORS[i%PROJECT_COLORS.length]; });
  const areaMap = {}; allAreas.forEach((a) => { areaMap[a.id] = a.name; });
  const allMaterialNames = planningTasks.map((t) => t.material).filter(Boolean);

  // Flag: applyScheduledWeeks corre solo una vez por sesión, no en cada loadPlans
  const scheduledApplied = useRef(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      // Auto-aplicar tareas programadas: solo la primera vez que se abre Personal en esta sesión
      if (!scheduledApplied.current) {
        scheduledApplied.current = true;
        try { await applyScheduledWeeks(); } catch (e) { console.warn('applyScheduledWeeks skipped:', e); }
      }
      const weekPlans = await getWeeklyPlans(weekStr);
      setPlans(weekPlans);
      const items = {};
      for (const plan of weekPlans) {
        const list = await getWeeklyPlanItems(plan.id);
        // Hide dismissed items from UI but keep in DB so they don't auto-reappear
        const visible = list.filter((i) => i.status !== 'dismissed');
        items[plan.staff_id] = { planId: plan.id, items: visible };
      }
      setPlanItems(items);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [weekStr]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  // Botón manual: forzar re-aplicación de programadas
  async function forceApplyScheduled() {
    setLoading(true);
    try {
      const result = await applyScheduledWeeks();
      await loadPlans();
      alert(`✓ ${result.count} tarea(s) programadas aplicadas.`);
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setLoading(false);
  }

  // ─── Realtime: auto-reload when weekly items or planning tasks change ───
  // Debounce 3s: evita recargas encadenadas cuando el equipo marca tareas seguido.
  const reloadTimer = useRef(null);
  useEffect(() => {
    function scheduleReload() {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { loadPlans(); }, 3000);
    }
    const channel = supabase
      .channel('staffview-sync-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_plan_items' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_plans' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_tasks' }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [loadPlans]);

  // For regular users, show their own plan; for managers, show selected or overview
  const viewingStaffId = isManager ? selectedStaff : currentStaff?.id;

  // Open priority modal — sets initial order by current priority field
  function openPriorityModal() {
    const sorted = [...projects].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    setPriorityOrder(sorted.map((p) => p.id));
    setShowPriorityModal(true);
  }

  // Move a project up or down in the priority list
  function movePriority(idx, dir) {
    const next = idx + dir;
    if (next < 0 || next >= priorityOrder.length) return;
    const arr = [...priorityOrder];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setPriorityOrder(arr);
  }

  // Confirm priorities — persist to DB and trigger generation
  async function confirmPriorityAndGenerate() {
    setShowPriorityModal(false);
    // Persist priorities (lower number = higher priority)
    try {
      for (let i = 0; i < priorityOrder.length; i++) {
        await updateProject(priorityOrder[i], { priority: i });
      }
    } catch (e) { console.error('Priority save error:', e); }
    await generateWeeklyPlan(priorityOrder);
  }

  // Wizard: add ONE project to the week
  function openProjectWizard() {
    setWizardProjectId('');
    setWizardWeekPriority('medium');
    setWizardForceAreas([]);
    setShowProjectWizard(true);
  }

  async function confirmProjectWizard() {
    if (!wizardProjectId) return;
    setWizardBusy(true);
    try {
      const priorityNum = wizardWeekPriority === 'high' ? 0
        : wizardWeekPriority === 'medium' ? 50
        : 100;
      try { await updateProject(wizardProjectId, { priority: priorityNum }); } catch (e) { /* ok */ }

      const result = await assignProjectToWeek({
        projectId: wizardProjectId,
        weekStartStr: weekStr,
        staffList: staff,
        forceAreaIds: wizardForceAreas,
      });

      const assignedCount = Object.values(result.assignedByStaff || {}).reduce((a, b) => a + b, 0);
      const project = projects.find((p) => p.id === wizardProjectId);
      await logActivity({
        project_id: wizardProjectId, action: 'project_added_to_week',
        description: `Proyecto "${project?.name || ''}" añadido a la semana — ${assignedCount} tarea(s), prioridad ${wizardWeekPriority}`,
        user_name: userName,
      });

      await loadPlans();
      setShowProjectWizard(false);
      setWizardForceAreas([]);
      alert(`✓ ${assignedCount} tarea(s) añadidas al equipo.${result.skipped ? `\n${result.skipped} omitida(s) (ya estaban en la semana).` : ''}${result.futureSkipped ? `\n${result.futureSkipped} programada(s) para semanas futuras (no asignadas).` : ''}`);
    } catch (e) {
      alert('Error: ' + e.message);
      console.error(e);
    }
    setWizardBusy(false);
  }

  async function generateWeeklyPlan(orderedProjectIds = null) {
    setLoading(true);
    const debug = []; // collect per-member outcomes
    try {
      // Determine project priority order
      const projectPriority = {};
      const orderToUse = orderedProjectIds || [...projects].sort((a,b) => (a.priority||0) - (b.priority||0)).map((p) => p.id);
      orderToUse.forEach((pid, i) => { projectPriority[pid] = i; });

      // Sort pending tasks: project priority → stage order → material name
      const pending = planningTasks
        .filter((t) => t.status !== 'done')
        .sort((a, b) => {
          const ap = projectPriority[a.project_id] ?? 999;
          const bp = projectPriority[b.project_id] ?? 999;
          if (ap !== bp) return ap - bp;
          const ao = STAGE_ORDER[a.stage] ?? 99;
          const bo = STAGE_ORDER[b.stage] ?? 99;
          if (ao !== bo) return ao - bo;
          return (a.material || '').localeCompare(b.material || '');
        });

      const today = getTodayDayIndex();
      const usedTaskIds = new Set();

      // CRITICAL: reload current week plans from DB to avoid stale state
      let freshPlans = [];
      try { freshPlans = await getWeeklyPlans(weekStr); } catch (e) { console.error('Could not load plans:', e); }

      for (const member of staff) {
        const memberProcs = member.default_processes || [];
        const memberLog = { name: member.name, code: member.code, processes: memberProcs.length, created: 0, error: null };

        try {
          // Find or create plan, handling duplicates gracefully
          let plan = freshPlans.find((p) => p.staff_id === member.id);
          let existingItems = [];
          let sort = 0;

          if (plan) {
            try { existingItems = await getWeeklyPlanItems(plan.id); } catch (e) { /* ok */ }
            sort = existingItems.length;
            // Re-order existing INCOMPLETE items by new priority
            const incompleteExisting = existingItems.filter((i) => i.status !== 'done');
            incompleteExisting.sort((a, b) => {
              const ap = projectPriority[a.project_id] ?? 999;
              const bp = projectPriority[b.project_id] ?? 999;
              if (ap !== bp) return ap - bp;
              // Match by stage order using STAGES lookup
              const aStage = STAGES.find((s) => s.label === a.process)?.id;
              const bStage = STAGES.find((s) => s.label === b.process)?.id;
              const ao = STAGE_ORDER[aStage] ?? 99;
              const bo = STAGE_ORDER[bStage] ?? 99;
              if (ao !== bo) return ao - bo;
              return (a.material || '').localeCompare(b.material || '');
            });
            // Apply new sort_order (fire and forget)
            incompleteExisting.forEach((it, idx) => {
              if (it.sort_order !== idx) {
                updateWeeklyPlanItem(it.id, { sort_order: idx });
              }
            });
            sort = incompleteExisting.length + existingItems.filter((i) => i.status === 'done').length;
          } else {
            try {
              plan = await createWeeklyPlan({ staff_id: member.id, week_start: weekStr });
              freshPlans.push(plan);
            } catch (createErr) {
              // Maybe race condition — re-fetch
              const refreshed = await getWeeklyPlans(weekStr);
              plan = refreshed.find((p) => p.staff_id === member.id);
              if (!plan) throw createErr;
              freshPlans = refreshed;
              try { existingItems = await getWeeklyPlanItems(plan.id); } catch (e) { /* ok */ }
              sort = existingItems.length;
            }
          }

          const items = [];
          const dayCount = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
          existingItems.forEach((i) => { if (i.day_of_week) dayCount[i.day_of_week] = (dayCount[i.day_of_week]||0) + 1; });
          const maxPerDay = (d) => d === 6 ? 3 : 5;

          // Carry over from previous week (only if no items yet)
          if (existingItems.length === 0) {
            try {
              const prevMonday = new Date(currentMonday);
              prevMonday.setDate(prevMonday.getDate() - 7);
              const prevStr = toDateStr(prevMonday);
              const prevPlans = await getWeeklyPlans(prevStr);
              const myPrevPlan = prevPlans.find((p) => p.staff_id === member.id);
              if (myPrevPlan) {
                const prevItems = await getWeeklyPlanItems(myPrevPlan.id);
                for (const pi of prevItems.filter((i) => i.status !== 'done')) {
                  items.push({
                    plan_id: plan.id, staff_id: member.id,
                    project_id: pi.project_id || null, area_id: pi.area_id || null,
                    process: pi.process, material: pi.material || '',
                    day_of_week: today, sort_order: sort++,
                    status: 'pending', notes: pi.notes || '',
                    is_admin: pi.is_admin || false, is_general: pi.is_general || false,
                  });
                  dayCount[today]++;
                }
              }
            } catch (e) { /* carry-over is optional, log silently */ console.warn('Carryover failed for', member.code, e); }
          }

          // Add pending tasks matching this person's processes
          // RULE: primary owner of a process gets first pick. Backup people only get
          // tasks already assigned to them, or that the primary couldn't take.
          const relevant = pending.filter((t) => {
            if (!t.stage || !memberProcs.includes(t.stage) || usedTaskIds.has(t.id)) return false;
            const primaryCode = PROCESS_PRIMARY_OWNER[t.stage];
            // If there is a primary and this member is NOT it, skip unless task was
            // explicitly assigned to this member
            if (primaryCode && primaryCode !== member.code) {
              if (t.assigned_to_id && t.assigned_to_id === member.id) return true;
              return false;
            }
            return true;
          });

          // Distribute tasks ACROSS THE WEEK using round-robin from today onwards.
          // First pass: one task per day (today, today+1, ..., Sat). Second pass: round-robin again.
          // This way all working days get filled, not just the first available.
          const workDays = [];
          for (let d = today; d <= 6; d++) workDays.push(d);
          if (workDays.length === 0) workDays.push(6);
          let cursor = 0;

          for (const task of relevant) {
            const label = STAGES.find((s) => s.id === task.stage)?.label || task.stage;
            const alreadyExists =
              existingItems.some((i) =>
                i.project_id === task.project_id && i.area_id === task.area_id &&
                i.process === label && (i.material || '') === (task.material || '')
              ) ||
              items.some((i) =>
                i.project_id === task.project_id && i.area_id === task.area_id &&
                i.process === label && (i.material || '') === (task.material || '')
              );
            if (alreadyExists) { usedTaskIds.add(task.id); continue; }

            // Round-robin across working days
            const assignedDay = workDays[cursor % workDays.length];
            cursor++;

            items.push({
              plan_id: plan.id, staff_id: member.id,
              project_id: task.project_id, area_id: task.area_id,
              process: label, material: task.material || '',
              day_of_week: assignedDay, sort_order: sort++,
              status: task.status || 'pending', notes: task.description || '',
              is_admin: false, is_general: false,
            });
            usedTaskIds.add(task.id);
            dayCount[assignedDay]++;
          }

          // Mantenimiento Friday for AA
          if (member.code === 'AA') {
            const hasMaint = [...existingItems, ...items].some((i) => i.process === 'Mantenimiento de Máquinas');
            if (!hasMaint) {
              items.push({ plan_id:plan.id, staff_id:member.id, project_id:null, area_id:null,
                process:'Mantenimiento de Máquinas', material:'', day_of_week:5, sort_order:sort++,
                status:'pending', notes:'', is_admin:false, is_general:true });
            }
          }

          if (items.length > 0) {
            await createWeeklyPlanItemsBulk(items);
            memberLog.created = items.length;
          }
        } catch (memberErr) {
          memberLog.error = memberErr.message;
          console.error(`generateWeeklyPlan failed for ${member.code}:`, memberErr);
        }

        debug.push(memberLog);
      }

      // Auto-generate Wednesday "Mediciones" for AV (no dependency)
      try { await ensureWednesdayMediciones(staff, weekStr); } catch (e) { console.warn('Mediciones gen failed:', e); }

      // Show a summary
      const failures = debug.filter((d) => d.error);
      const empty = debug.filter((d) => !d.error && d.created === 0);
      const summary =
        `Generación completada.\n\n` +
        debug.map((d) => `• ${d.code} (${d.name}): ${d.error ? `❌ ${d.error}` : `${d.created} tareas`}`).join('\n');
      if (failures.length > 0 || empty.length > 0) console.log(summary);
      await logActivity({ project_id: null, action: 'weekly_plan_generated',
        description: `Semana ${formatWeek(currentMonday)}: ${debug.map((d) => `${d.code}=${d.created}`).join(', ')}`,
        user_name: userName });
      await loadPlans();
    } catch (e) {
      alert('Error: ' + e.message);
      console.error('generateWeeklyPlan top-level error:', e);
    }
    setLoading(false);
  }

  async function toggleItemStatus(item) {
    const order = ['pending','in_progress','done'];
    const next = order[(order.indexOf(item.status)+1) % order.length];
    const wasDone = item.status === 'done';
    // Optimistic update
    setPlanItems((prev) => {
      const c = { ...prev }; const sd = c[item.staff_id];
      if (sd) c[item.staff_id] = { ...sd, items: sd.items.map((i) => i.id===item.id ? {...i,status:next} : i) };
      return c;
    });
    await updateWeeklyPlanItem(item.id, { status: next });

    if (item.project_id) {
      // Resolve the stage by matching the planning_task directly (robust against label drift)
      (async () => {
        try {
          const allTasks = await getAllPlanningTasks();
          // Find the planning task that corresponds to this weekly item
          let match = allTasks.find((t) =>
            t.project_id===item.project_id && t.area_id===item.area_id &&
            (t.material||'')===(item.material||'') &&
            (STAGES.find((s) => s.id === t.stage)?.label === item.process)
          );
          // Fallback: match by normalized label comparison
          if (!match) {
            const norm = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
            match = allTasks.find((t) =>
              t.project_id===item.project_id && t.area_id===item.area_id &&
              (t.material||'')===(item.material||'') &&
              norm(STAGES.find((s) => s.id === t.stage)?.label) === norm(item.process)
            );
          }

          const stageId = match?.stage || STAGES.find((s) => s.label === item.process)?.id;
          if (match && match.status !== next) await updatePlanningTask(match.id, { status: next });

          if (next === 'done' && stageId) {
            // Forward cascade: unlock / create successors
            const refreshed = await getAllPlanningTasks();
            const staffList = await getAllStaff();
            const areaName = allAreas.find((a) => a.id===item.area_id)?.name || '';
            const base = match || { project_id:item.project_id, area_id:item.area_id, stage:stageId, material:item.material||'', _area_name: areaName };
            await propagateNextProcesses({ ...base, _area_name: areaName }, refreshed, staffList);
          } else if (wasDone && next !== 'done' && item.area_id) {
            // Inverse cascade: task was un-completed → re-block dependents
            await reblockDependentTasks(item.project_id, item.area_id);
          }
          await loadPlans();
        } catch (e) { console.error(e); }
      })();
    }
  }

  async function moveItemToDay(item, newDay) {
    if (item.day_of_week === newDay) return;
    setPlanItems((prev) => { const c={...prev}; const sd=c[item.staff_id]; if(sd) c[item.staff_id]={...sd,items:sd.items.map((i)=>i.id===item.id?{...i,day_of_week:newDay}:i)}; return c; });
    updateWeeklyPlanItem(item.id, { day_of_week: newDay });
  }

  async function moveItemInDay(item, dir, dayItems) {
    const idx = dayItems.findIndex((i) => i.id===item.id);
    const target = idx+dir;
    if (target<0||target>=dayItems.length) return;
    const swap = dayItems[target];
    setPlanItems((prev) => { const c={...prev}; const sd=c[item.staff_id]; if(sd) c[item.staff_id]={...sd,items:sd.items.map((i)=>{ if(i.id===item.id) return{...i,sort_order:target}; if(i.id===swap.id) return{...i,sort_order:idx}; return i; })}; return c; });
    updateWeeklyPlanItem(item.id,{sort_order:target});
    updateWeeklyPlanItem(swap.id,{sort_order:idx});
  }

  async function addManualItem() {
    if (!addTarget||!addForm.process.trim()) return;
    const staffPlan = planItems[addTarget];
    if (!staffPlan) { alert('Genera la planificación primero.'); return; }
    try {
      // Resolve area: existing one (case-insensitive) or create a new one on the fly
      let areaId = null;
      let areaName = (addForm.area_name || '').trim();
      if (areaName && addForm.project_id) {
        const projectAreas = allAreas.filter((a) => a.project_id === addForm.project_id);
        const existing = projectAreas.find((a) => a.name.toLowerCase() === areaName.toLowerCase());
        if (existing) {
          areaId = existing.id; areaName = existing.name;
        } else {
          try {
            const newArea = await createArea({
              project_id: addForm.project_id, name: areaName,
              mecanizados_enabled: [], sort_order: projectAreas.length,
            });
            areaId = newArea.id;
          } catch (e) { console.error('Could not create area:', e); }
        }
      }

      const matchedStage = STAGES.find((s) => s.label === addForm.process || s.id === addForm.process);
      const stageId = matchedStage?.id || '';
      const stageLabel = matchedStage?.label || addForm.process;

      const hours = addForm.estimated_hours !== '' && !Number.isNaN(parseFloat(addForm.estimated_hours))
        ? parseFloat(addForm.estimated_hours)
        : (stageId && PROCESS_DEFAULT_HOURS[stageId] != null ? PROCESS_DEFAULT_HOURS[stageId] : null);

      await createWeeklyPlanItemsBulk([{
        plan_id:staffPlan.planId, staff_id:addTarget,
        project_id:addForm.project_id||null, area_id: areaId,
        process: stageLabel, stage_id: stageId || null,
        material:addForm.material,
        day_of_week:addForm.day, sort_order:staffPlan.items?.length||0,
        status:'pending', notes:addForm.notes, estimated_hours: hours,
        is_admin:false, is_general:false,
      }]);

      if (addForm.project_id && stageId) {
        const existing = planningTasks.find((t) =>
          t.project_id === addForm.project_id && (t.area_id || null) === areaId &&
          t.stage === stageId && (t.material||'') === (addForm.material||'')
        );
        if (!existing) {
          const matSuffix = addForm.material ? ` (${addForm.material})` : '';
          await createPlanningTask({
            project_id: addForm.project_id, area_id: areaId,
            title: `${stageLabel} — ${areaName}${matSuffix}`,
            stage: stageId, status: 'pending', priority: planningTasks.length,
            material: addForm.material || '', description: addForm.notes || '',
            estimated_hours: hours,
            assigned_to_id: addTarget,
          });
        }
      }
      setShowAddModal(false); await loadPlans();
    } catch (e) { alert('Error: '+e.message); }
  }

  async function handleMoveItem(item, deltaWeeks, customDateStr = null) {
    try {
      if (customDateStr) {
        // Calcular deltaWeeks desde la fecha personalizada
        const from = new Date(weekStr + 'T00:00:00');
        const to = new Date(customDateStr + 'T00:00:00');
        const diffDays = Math.round((to - from) / 86400000);
        deltaWeeks = Math.round(diffDays / 7);
        if (deltaWeeks === 0) { alert('La fecha destino es la misma semana actual.'); return; }
      }
      await moveWeeklyItemToWeek(item.id, { deltaWeeks, fromWeekStart: weekStr });
      const suffix = deltaWeeks > 0 ? `${deltaWeeks} semana${deltaWeeks > 1 ? 's' : ''} adelante` : `${Math.abs(deltaWeeks)} semana${Math.abs(deltaWeeks) > 1 ? 's' : ''} atrás`;
      await logActivity({
        project_id: item.project_id, area_id: item.area_id,
        action: 'task_moved', description: `Tarea "${item.process}" movida ${suffix}.`,
        user_name: userName,
      });
      setTaskActionsFor(null);
      setMoveModal(null);
      setMovePickerDate('');
      await loadPlans();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function handleReassignItem(item, newStaffId) {
    if (!newStaffId || newStaffId === item.staff_id) { setReassignModal(null); return; }
    try {
      await reassignWeeklyItem(item.id, newStaffId);
      const newMember = staff.find((m) => m.id === newStaffId);
      await logActivity({
        project_id: item.project_id, area_id: item.area_id,
        action: 'task_reassigned',
        description: `Tarea "${item.process}" reasignada a ${newMember?.name || 'otra persona'}.`,
        user_name: userName,
      });
      setReassignModal(null);
      setReassignShowAll(false);
      setTaskActionsFor(null);
      await loadPlans();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function removeItem(item) {
    if (!confirm('¿Quitar esta tarea de la semana?\n\nQueda registrada como descartada para que no vuelva sola al refrescar. Para reagregarla, usa el asistente "Añadir proyecto a la semana".')) return;
    await dismissWeeklyPlanItem(item.id);
    await loadPlans();
  }

  // Refresh ONE person's plan: pull pending tasks that match their processes but aren't in the week
  async function refreshPersonPlan(memberId) {
    setLoading(true);
    try {
      const member = staff.find((m) => m.id === memberId);
      if (!member) return;

      // Use current project priorities
      const projectPriority = {};
      [...projects].sort((a,b) => (a.priority||0) - (b.priority||0)).forEach((p, i) => { projectPriority[p.id] = i; });

      const allTasks = await getAllPlanningTasks();
      const memberProcs = member.default_processes || [];
      const today = getTodayDayIndex();

      // Get or create plan
      let plan = plans.find((p) => p.staff_id === memberId);
      let existingItems = [];
      if (plan) {
        existingItems = await getWeeklyPlanItems(plan.id);
      } else {
        plan = await createWeeklyPlan({ staff_id: memberId, week_start: weekStr });
      }

      // Find tasks that should belong to this person and aren't already in the week
      const pending = allTasks
        .filter((t) => t.status !== 'done' && t.stage && memberProcs.includes(t.stage))
        .filter((t) => {
          const primaryCode = PROCESS_PRIMARY_OWNER[t.stage];
          if (primaryCode && primaryCode !== member.code) {
            return t.assigned_to_id === memberId;
          }
          return true;
        })
        .sort((a, b) => {
          const ap = projectPriority[a.project_id] ?? 999;
          const bp = projectPriority[b.project_id] ?? 999;
          if (ap !== bp) return ap - bp;
          const ao = STAGE_ORDER[a.stage] ?? 99;
          const bo = STAGE_ORDER[b.stage] ?? 99;
          if (ao !== bo) return ao - bo;
          return (a.material || '').localeCompare(b.material || '');
        });

      const workDays = [];
      for (let d = today; d <= 6; d++) workDays.push(d);
      if (workDays.length === 0) workDays.push(6);
      let cursor = 0;
      let sort = existingItems.length;
      const newItems = [];

      const norm = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
      for (const task of pending) {
        const label = STAGES.find((s) => s.id === task.stage)?.label || task.stage;
        // Treat dismissed items as "already here": user removed them on purpose, don't reinsert
        const alreadyHere = existingItems.some((i) => {
          if (i.project_id !== task.project_id) return false;
          if ((i.area_id || null) !== (task.area_id || null)) return false;
          if ((i.material || '') !== (task.material || '')) return false;
          return i.stage_id ? i.stage_id === task.stage : norm(i.process) === norm(label);
        });
        if (alreadyHere) continue;
        const assignedDay = workDays[cursor % workDays.length];
        cursor++;
        newItems.push({
          plan_id: plan.id, staff_id: memberId,
          project_id: task.project_id, area_id: task.area_id,
          process: label, stage_id: task.stage,
          material: task.material || '',
          day_of_week: assignedDay, sort_order: sort++,
          status: task.status || 'pending', notes: task.description || '',
          is_admin: false, is_general: false,
        });
      }

      if (newItems.length > 0) await createWeeklyPlanItemsBulk(newItems);
      await loadPlans();
      alert(`✓ Refrescado: ${newItems.length} tarea(s) agregada(s) a la semana.`);
    } catch (e) { alert('Error: ' + e.message); console.error(e); }
    setLoading(false);
  }

  // ─── Item filtering (v23) ───
  function filterItems(items) {
    return items.filter((i) => {
      if (hidePausedProjects && i.project_id) {
        const p = projects.find((pp) => pp.id === i.project_id);
        if (p && (p.status === 'paused' || p.status === 'archived')) return false;
      }
      if (!showBlocked && i.status === 'blocked') return false;
      if (onlyHighPriority && i.project_id) {
        const p = projects.find((pp) => pp.id === i.project_id);
        if (!p || (p.priority || 0) >= 50) return false;
      }
      if (onlyStalled) {
        if (!i.created_at) return false;
        const ageDays = Math.floor((Date.now() - new Date(i.created_at).getTime()) / 86400000);
        if (ageDays < 7) return false;
      }
      return true;
    });
  }

  function groupItemsByProject() {
    const groups = {};
    Object.entries(planItems).forEach(([staffId, sd]) => {
      const items = filterItems(sd.items || []);
      items.forEach((item) => {
        const pid = item.project_id || '_no_project';
        if (!groups[pid]) groups[pid] = { project_id: item.project_id, items: [], byStaff: {} };
        groups[pid].items.push({ ...item, _staffId: staffId });
        if (!groups[pid].byStaff[staffId]) groups[pid].byStaff[staffId] = [];
        groups[pid].byStaff[staffId].push(item);
      });
    });
    return Object.values(groups).sort((a, b) => {
      const pa = projects.find((p) => p.id === a.project_id);
      const pb = projects.find((p) => p.id === b.project_id);
      return (pa?.priority || 999) - (pb?.priority || 999);
    });
  }

  async function pauseProjectFromStaff(projectId) {
    const p = projects.find((pp) => pp.id === projectId);
    if (!p) return;
    if (!confirm(`¿Pausar "${p.name}"?\n\nSus tareas dejarán de aparecer en las planificaciones personales.`)) return;
    try {
      await setProjectStatus(projectId, 'paused');
      await dismissProjectFromWeek(projectId);
      await logActivity({
        project_id: projectId, action: 'project_paused',
        description: `Proyecto "${p.name}" pausado desde Personal.`,
        user_name: userName,
      });
      await loadPlans();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function removeProjectFromThisWeek(projectId) {
    const p = projects.find((pp) => pp.id === projectId);
    if (!p) return;
    if (!confirm(`¿Quitar todas las tareas de "${p.name}" solo de esta semana?\n\nEl proyecto sigue activo. Las tareas pueden re-agregarse con el asistente.`)) return;
    try {
      await dismissProjectFromWeek(projectId, weekStr);
      await logActivity({
        project_id: projectId, action: 'project_removed_from_week',
        description: `Proyecto "${p.name}" quitado de la semana del ${weekStr}.`,
        user_name: userName,
      });
      await loadPlans();
    } catch (e) { alert('Error: ' + e.message); }
  }

  function exportPDF(member) {
    const items = planItems[member.id]?.items||[];

    // Calcular fechas reales por día
    const weekMondayDate = new Date(weekStr + 'T00:00:00');
    const dateForDay = (dayId) => {
      const d = new Date(weekMondayDate);
      d.setDate(d.getDate() + (dayId - 1));
      return d;
    };
    const fmtDate = (d) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

    const fmtHours = (h) => {
      if (h == null || h === '' || Number.isNaN(Number(h))) return '';
      const n = Number(h);
      return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
    };

    const totalWeekHours = items.reduce((s, i) => s + (i.estimated_hours != null && i.estimated_hours !== '' ? Number(i.estimated_hours) : 0), 0);
    const anyHoursSet = items.some((i) => i.estimated_hours != null && i.estimated_hours !== '');

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Plan ${member.name} — Semana ${weekStr}</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI','Helvetica Neue',sans-serif;padding:28px;color:#1a1a2e;font-size:11px;line-height:1.4}
      .header{border-bottom:2px solid #1a1a2e;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end}
      .brand{font-size:10px;letter-spacing:0.18em;color:#7a7a9a;font-weight:700;text-transform:uppercase;margin-bottom:4px}
      h1{font-size:20px;font-weight:800;letter-spacing:-0.02em}
      .sub{font-size:12px;color:#3a3a5a;margin-top:4px;font-weight:600}
      .kpi{background:#f5f5fa;border-radius:6px;padding:8px 14px;text-align:right}
      .kpi-num{font-size:22px;font-weight:800;color:#7c6df0}
      .kpi-lbl{font-size:9px;color:#7a7a9a;text-transform:uppercase;letter-spacing:0.06em;font-weight:600}
      .day-block{margin-bottom:16px;page-break-inside:avoid}
      .day-head{background:#7c6df010;border-left:3px solid #7c6df0;padding:6px 10px;font-weight:800;font-size:13px;color:#1a1a2e;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
      .day-name{text-transform:uppercase;letter-spacing:0.04em}
      .day-date{font-size:11px;color:#7a7a9a;font-weight:600}
      .day-hours{color:#7c6df0;font-weight:800;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#f5f5fa;text-align:left;padding:6px 8px;font-weight:700;color:#7a7a9a;text-transform:uppercase;letter-spacing:0.04em;font-size:9px;border-bottom:1px solid #d8d8e0}
      td{padding:6px 8px;border-bottom:1px solid #ececf2;vertical-align:top}
      tr:last-child td{border-bottom:none}
      .process{font-weight:700;color:#1a1a2e}
      .project{font-size:9px;color:#7a7a9a;margin-top:1px}
      .material{display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;background:#f59e0b20;color:#c98a1f;margin-right:3px}
      .notes{font-size:9px;color:#3a3a5a;font-style:italic;margin-top:2px}
      .hcol{text-align:right;font-weight:800;color:#7c6df0;white-space:nowrap;width:60px}
      .done td{opacity:0.5}
      .done .process{text-decoration:line-through}
      .empty{padding:26px;text-align:center;color:#7a7a9a;background:#f5f5fa;border-radius:6px}
      .footer{margin-top:22px;padding-top:10px;border-top:1px solid #d8d8e0;color:#7a7a9a;font-size:9px;display:flex;justify-content:space-between}
      .disclaimer{font-size:9px;color:#a0a0b8;font-style:italic;text-align:center;margin-top:8px}
      @media print{body{padding:16px}.day-block{page-break-inside:avoid}}
    </style></head><body>`;

    html += `<div class="header">
      <div>
        <div class="brand">TECC Producción · Plan semanal</div>
        <h1>${member.name}</h1>
        <div class="sub">${member.role || ''} · Código ${member.code}</div>
        <div class="sub" style="font-size:11px;color:#7a7a9a">Semana del ${fmtDate(weekMondayDate)} al ${fmtDate(dateForDay(6))}</div>
      </div>`;
    if (anyHoursSet) {
      html += `<div class="kpi">
        <div class="kpi-num">${fmtHours(totalWeekHours) || '—'}</div>
        <div class="kpi-lbl">Horas planeadas</div>
      </div>`;
    }
    html += `</div>`;

    let anyDay = false;
    DAYS_OF_WEEK.forEach((day) => {
      const di = items.filter((i) => i.day_of_week === day.id).sort((a, b) => a.sort_order - b.sort_order);
      if (di.length === 0) return;
      anyDay = true;
      const dayHours = di.reduce((s, i) => s + (i.estimated_hours != null && i.estimated_hours !== '' ? Number(i.estimated_hours) : 0), 0);
      const dayDate = dateForDay(day.id);
      html += `<div class="day-block">
        <div class="day-head">
          <span><span class="day-name">${day.label}</span> <span class="day-date">· ${fmtDate(dayDate)}</span></span>
          ${dayHours > 0 ? `<span class="day-hours">⏱ ${fmtHours(dayHours)}</span>` : ''}
        </div>
        <table>
          <thead><tr>
            <th>Proceso · Proyecto</th>
            <th>Material</th>
            <th>Notas</th>
            <th class="hcol">Horas</th>
          </tr></thead>
          <tbody>`;
      di.forEach((item) => {
        const pn = item.project_id ? (projectMap[item.project_id] || '') : '';
        const an = item.area_id ? (areaMap[item.area_id] || '') : '';
        const projLine = pn ? `${pn}${an ? ' · ' + an : ''}` : (an || '');
        const matBadge = item.material ? `<span class="material">🪵 ${(item.material+'').replace(/</g,'&lt;')}</span>` : '';
        const notes = item.notes && item.notes.trim() ? `<div class="notes">${item.notes.replace(/</g,'&lt;')}</div>` : '';
        const hoursCell = fmtHours(item.estimated_hours) || '<span style="color:#a0a0b8">—</span>';
        const doneCls = item.status === 'done' ? ' class="done"' : '';
        html += `<tr${doneCls}>
          <td>
            <div class="process">${(item.process || '').replace(/</g,'&lt;')}</div>
            ${projLine ? `<div class="project">${projLine.replace(/</g,'&lt;')}</div>` : ''}
          </td>
          <td>${matBadge || '<span style="color:#a0a0b8">—</span>'}</td>
          <td>${notes || '<span style="color:#a0a0b8">—</span>'}</td>
          <td class="hcol">${hoursCell}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    });

    if (!anyDay) {
      html += `<div class="empty">Sin tareas asignadas esta semana.</div>`;
    }

    html += `<div class="disclaimer">Los tiempos son estimaciones informativas y pueden variar según la complejidad de cada tarea.</div>`;
    html += `<div class="footer">
      <span>Generado por ${userName || 'Usuario'}</span>
      <span>${new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    </div>`;
    html += `</body></html>`;
    const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
    if (w) w.onload = () => setTimeout(() => w.print(), 400);
  }

  const areasForAdd = allAreas.filter((a)=>a.project_id===addForm.project_id);
  const ss={width:'100%',padding:'8px 12px',borderRadius:6,border:'1.5px solid var(--border)',background:'var(--bg)',color:'var(--t1)',fontSize:13,fontFamily:'inherit'};

  // ─── Render: manager vs regular user ───
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:8 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:'var(--t1)', letterSpacing:'-0.03em' }}>Personal</h2>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--t2)' }}>
            {isManager ? 'Vista de gerencia — añade proyectos a la semana uno a uno o genera todos.' : `Planificación de ${currentStaff?.name||'tu semana'}`}
          </p>
        </div>
        {isManager && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <Btn onClick={openProjectWizard} disabled={loading || wizardBusy}>➕ Añadir proyecto a la semana</Btn>
            <Btn variant="secondary" onClick={openPriorityModal} disabled={loading || wizardBusy}>{loading?'Generando...':'⚡ Generar todos'}</Btn>
            <Btn variant="ghost" size="sm" onClick={forceApplyScheduled} disabled={loading} title="Aplica las tareas cuya semana programada llegó">🔄 Aplicar programadas</Btn>
          </div>
        )}
      </div>

      {/* Filters & view mode (v23) */}
      {isManager && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap', padding:'10px 12px', background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', gap:4, padding:2, background:'var(--bg)', borderRadius:6, border:'1px solid var(--border)' }}>
            <button onClick={() => setViewMode('people')}
              style={{ padding:'5px 12px', borderRadius:4, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700,
                background: viewMode==='people' ? '#7c6df0' : 'transparent',
                color: viewMode==='people' ? '#fff' : 'var(--t2)' }}>👥 Por personal</button>
            <button onClick={() => setViewMode('projects')}
              style={{ padding:'5px 12px', borderRadius:4, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700,
                background: viewMode==='projects' ? '#7c6df0' : 'transparent',
                color: viewMode==='projects' ? '#fff' : 'var(--t2)' }}>📂 Por proyecto</button>
          </div>
          <div style={{ width:1, height:24, background:'var(--border)' }} />
          <FilterChip active={hidePausedProjects} onClick={() => setHidePausedProjects(!hidePausedProjects)}>
            {hidePausedProjects ? '⏸ Ocultando pausados' : '⏸ Mostrar pausados'}
          </FilterChip>
          <FilterChip active={!showBlocked} onClick={() => setShowBlocked(!showBlocked)}>
            {showBlocked ? '🔒 Mostrando bloqueadas' : '🔒 Ocultando bloqueadas'}
          </FilterChip>
          <FilterChip active={onlyHighPriority} onClick={() => setOnlyHighPriority(!onlyHighPriority)}>
            🔴 Solo prioridad alta
          </FilterChip>
          <FilterChip active={onlyStalled} onClick={() => setOnlyStalled(!onlyStalled)}>
            ⏰ Solo estancadas (+7 días)
          </FilterChip>
        </div>
      )}

      {/* Week navigation */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <Btn variant="ghost" size="sm" onClick={() => { const d=new Date(currentMonday); d.setDate(d.getDate()-7); setCurrentMonday(d); }}>← Anterior</Btn>
        <span style={{ fontWeight:700, fontSize:14, color:'var(--t1)' }}>{formatWeek(currentMonday)}</span>
        <Btn variant="ghost" size="sm" onClick={() => { const d=new Date(currentMonday); d.setDate(d.getDate()+7); setCurrentMonday(d); }}>Siguiente →</Btn>
      </div>

      {isManager && viewMode === 'projects' ? (
        <ProjectGroupedView
          groups={groupItemsByProject()}
          projects={projects}
          allAreas={allAreas}
          staff={staff}
          projectMap={projectMap}
          areaMap={areaMap}
          projectColorMap={projectColorMap}
          onToggleItem={toggleItemStatus}
          onRemoveItem={removeItem}
          onOpenActions={setTaskActionsFor}
          onPauseProject={pauseProjectFromStaff}
          onRemoveProjectFromWeek={removeProjectFromThisWeek}
        />
      ) : isManager ? (
        // ─── MANAGER VIEW: person selector + full plan ───
        <div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20 }}>
            {staff.map((m) => (
              <button key={m.id} onClick={() => setSelectedStaff(m.id===selectedStaff?null:m.id)}
                style={{
                  display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
                  borderRadius:10, border: selectedStaff===m.id ? `2px solid ${m.color}` : '1.5px solid var(--border)',
                  background: selectedStaff===m.id ? m.color+'15' : 'var(--surface)',
                  cursor:'pointer', fontFamily:'inherit',
                }}>
                <span style={{ width:26, height:26, borderRadius:6, background:m.color+'20', color:m.color, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:11 }}>{m.code}</span>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--t1)' }}>{m.name}</div>
                  <div style={{ fontSize:10, color:'var(--t2)' }}>{(planItems[m.id]?.items||[]).filter((i)=>i.status!=='done').length} pendientes</div>
                </div>
              </button>
            ))}
          </div>
          {selectedStaff && staff.find((m)=>m.id===selectedStaff) && (
            <PersonPlan
              member={staff.find((m)=>m.id===selectedStaff)}
              items={filterItems(planItems[selectedStaff]?.items||[])}
              planId={planItems[selectedStaff]?.planId}
              staff={staff}
              projectMap={projectMap} areaMap={areaMap} projectColorMap={projectColorMap}
              allMaterialNames={allMaterialNames} allAreas={allAreas} onToggleDone={toggleItemStatus}
              onToggle={toggleItemStatus} onMoveDay={moveItemToDay} onMoveInDay={moveItemInDay}
              onRemove={removeItem} onAdd={(sid)=>{ setAddTarget(sid); setAddForm({process:'',project_id:'',area_name:'',material:'',day:getTodayDayIndex(),notes:'',estimated_hours:''}); setShowAddModal(true); }}
              onRefresh={refreshPersonPlan} onOpenActions={setTaskActionsFor} onExport={exportPDF} onClear={async(planId,count)=>{ if(!confirm(`¿Limpiar ${count} completadas?`)) return; await deleteCompletedWeeklyItems(planId); await loadPlans(); }}
              weekStr={weekStr}
            />
          )}
          {!selectedStaff && <div style={{ textAlign:'center', padding:40, color:'var(--t2)', fontSize:13 }}>Selecciona una persona para ver su planificación.</div>}
        </div>
      ) : (
        // ─── REGULAR USER VIEW: only their own plan ───
        currentStaff && (
          <PersonPlan
            member={currentStaff}
            items={filterItems(planItems[currentStaff.id]?.items||[])}
            planId={planItems[currentStaff.id]?.planId}
            staff={staff}
            projectMap={projectMap} areaMap={areaMap} projectColorMap={projectColorMap}
            allMaterialNames={allMaterialNames} allAreas={allAreas} onToggleDone={toggleItemStatus}
            onToggle={toggleItemStatus} onMoveDay={moveItemToDay} onMoveInDay={moveItemInDay}
            onRemove={removeItem} onAdd={(sid)=>{ setAddTarget(sid); setAddForm({process:'',project_id:'',area_name:'',material:'',day:getTodayDayIndex(),notes:'',estimated_hours:''}); setShowAddModal(true); }}
            onRefresh={refreshPersonPlan} onOpenActions={setTaskActionsFor} onExport={exportPDF} onClear={async(planId,count)=>{ if(!confirm(`¿Limpiar ${count} completadas?`)) return; await deleteCompletedWeeklyItems(planId); await loadPlans(); }}
            weekStr={weekStr}
          />
        )
      )}

      {/* Priority order modal */}
      <Modal open={showPriorityModal} onClose={() => setShowPriorityModal(false)} title="Prioridad de proyectos" width={480}>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14, lineHeight: 1.5 }}>
          Ordena los proyectos del <strong style={{ color:'var(--t1)' }}>más urgente al menos urgente</strong>.
          Las tareas se distribuirán en este orden a cada persona del equipo.
        </p>
        {priorityOrder.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--t2)', textAlign: 'center', padding: 20 }}>No hay proyectos activos.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 380, overflowY: 'auto' }}>
            {priorityOrder.map((pid, idx) => {
              const project = projects.find((p) => p.id === pid);
              if (!project) return null;
              const color = projectColorMap[pid] || '#7c6df0';
              return (
                <div key={pid} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--bg)', border: `1px solid ${color}30`,
                  borderLeft: `4px solid ${color}`,
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: color + '20', color: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 13, flexShrink: 0,
                  }}>{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{project.name}</div>
                    {project.client && <div style={{ fontSize: 11, color: 'var(--t2)' }}>{project.client}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={() => movePriority(idx, -1)} disabled={idx === 0}
                      style={{ width: 28, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: idx === 0 ? 'var(--bg)' : 'var(--surface)', color: idx === 0 ? 'var(--border)' : 'var(--t1)', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 11, fontFamily: 'inherit' }}>▲</button>
                    <button onClick={() => movePriority(idx, 1)} disabled={idx === priorityOrder.length - 1}
                      style={{ width: 28, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: idx === priorityOrder.length - 1 ? 'var(--bg)' : 'var(--surface)', color: idx === priorityOrder.length - 1 ? 'var(--border)' : 'var(--t1)', cursor: idx === priorityOrder.length - 1 ? 'default' : 'pointer', fontSize: 11, fontFamily: 'inherit' }}>▼</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="secondary" onClick={() => setShowPriorityModal(false)}>Cancelar</Btn>
          <Btn onClick={confirmPriorityAndGenerate} disabled={priorityOrder.length === 0}>⚡ Generar con esta prioridad</Btn>
        </div>
      </Modal>

      <Modal open={showProjectWizard} onClose={() => !wizardBusy && setShowProjectWizard(false)} title="Añadir proyecto a la semana" width={500}>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14, lineHeight: 1.5 }}>
          Selecciona un proyecto. Sus tareas pendientes se repartirán entre el equipo correspondiente a lo largo de la semana, desde hoy en adelante.
        </p>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Proyecto</label>
          <select
            value={wizardProjectId}
            onChange={(e) => setWizardProjectId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 14, fontFamily: 'inherit' }}
          >
            <option value="">Selecciona un proyecto...</option>
            {[...projects].sort((a,b) => (a.priority||0) - (b.priority||0)).map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 6 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prioridad esta semana</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { id: 'high', label: 'Alta', desc: 'Cumplir esta semana', color: '#ef4444' },
              { id: 'medium', label: 'Media', desc: 'Avanzar lo posible', color: '#f59e0b' },
              { id: 'low', label: 'Baja', desc: 'Si queda tiempo', color: '#64748b' },
            ].map((p) => {
              const active = wizardWeekPriority === p.id;
              return (
                <button key={p.id} onClick={() => setWizardWeekPriority(p.id)}
                  style={{
                    padding: '10px 8px', borderRadius: 8,
                    border: active ? `2px solid ${p.color}` : '1.5px solid var(--border)',
                    background: active ? p.color + '15' : 'var(--bg)',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                  }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: active ? p.color : 'var(--t1)' }}>{p.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 2 }}>{p.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
        {wizardProjectId && (() => {
          const projectTasks = planningTasks.filter((t) => t.project_id === wizardProjectId && t.status !== 'done' && t.status !== 'dismissed');
          if (projectTasks.length === 0) {
            return <div style={{ marginTop: 14, padding: 10, fontSize: 12, color: 'var(--t2)', background: 'var(--bg)', borderRadius: 6, textAlign: 'center' }}>Este proyecto no tiene tareas pendientes.</div>;
          }
          // Agrupar tareas por area
          const areasOfProject = allAreas.filter((a) => a.project_id === wizardProjectId);
          const tasksByArea = {};
          projectTasks.forEach((t) => {
            const key = t.area_id || '_none';
            if (!tasksByArea[key]) tasksByArea[key] = [];
            tasksByArea[key].push(t);
          });
          const futureAreas = wizardForceAreas || [];
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Áreas del proyecto
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {areasOfProject.map((area) => {
                  const areaTasks = tasksByArea[area.id] || [];
                  const isScheduledFuture = area.scheduled_week_start && area.scheduled_week_start > weekStr;
                  const isForced = futureAreas.includes(area.id);
                  const isPaused = area.status === 'paused' || area.status === 'archived';
                  const isDisabled = isPaused;
                  return (
                    <div key={area.id} style={{
                      padding:'8px 10px', borderRadius:6,
                      background: isPaused ? 'var(--bg)' : isScheduledFuture ? '#f59e0b08' : 'var(--bg)',
                      border: `1px solid ${isForced ? '#7c6df0' : isScheduledFuture ? '#f59e0b40' : 'var(--border)'}`,
                      opacity: isPaused ? 0.5 : 1,
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--t1)', flex:1 }}>📐 {area.name}</span>
                        <span style={{ fontSize:10, color:'var(--t2)', fontWeight:600 }}>{areaTasks.length} tarea{areaTasks.length !== 1 ? 's' : ''}</span>
                        {isPaused && <span style={{ fontSize:10, color:'#f59e0b', fontWeight:700 }}>PAUSADA</span>}
                      </div>
                      {isScheduledFuture && !isPaused && (
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                          <span style={{ fontSize:11, color:'#c98a1f', fontWeight:600 }}>
                            ⏳ Programada para semana del {area.scheduled_week_start}
                          </span>
                          <button
                            onClick={() => setWizardForceAreas((prev) => isForced ? prev.filter((x) => x !== area.id) : [...prev, area.id])}
                            style={{
                              padding:'2px 8px', borderRadius:4,
                              border:`1px solid ${isForced ? '#7c6df0' : '#f59e0b60'}`,
                              background: isForced ? '#7c6df015' : 'transparent',
                              color: isForced ? '#7c6df0' : '#c98a1f',
                              fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                              marginLeft:'auto',
                            }}
                          >
                            {isForced ? '✓ Se adelantará' : '⏩ Adelantar'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize:10, color:'var(--t2)', marginTop:8, fontStyle:'italic' }}>
                Las áreas programadas para el futuro no se asignarán salvo que las adelantes manualmente.
              </div>
            </div>
          );
        })()}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Btn variant="secondary" onClick={() => setShowProjectWizard(false)} disabled={wizardBusy}>Cancelar</Btn>
          <Btn onClick={confirmProjectWizard} disabled={!wizardProjectId || wizardBusy}>
            {wizardBusy ? 'Asignando...' : '✓ Añadir a la semana'}
          </Btn>
        </div>
      </Modal>

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Agregar actividad" width={420}>
        <InputField label="Proceso" value={addForm.process} onChange={(v) => setAddForm({...addForm,process:v})} placeholder="Ej: Corte, Revisión..." />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Proyecto</label>
            <select value={addForm.project_id} onChange={(e)=>setAddForm({...addForm,project_id:e.target.value,area_name:''})} style={ss}>
              <option value="">Sin proyecto</option>
              {projects.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Área (escribe o selecciona)</label>
            <input
              type="text"
              value={addForm.area_name}
              onChange={(e)=>setAddForm({...addForm,area_name:e.target.value})}
              list={`areas-list-${addTarget||'x'}`}
              placeholder={addForm.project_id ? 'Existente o nueva' : 'Selecciona un proyecto primero'}
              disabled={!addForm.project_id}
              style={ss}
            />
            <datalist id={`areas-list-${addTarget||'x'}`}>
              {areasForAdd.map((a) => <option key={a.id} value={a.name} />)}
            </datalist>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ marginBottom:14 }}><label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Día</label><select value={addForm.day} onChange={(e)=>setAddForm({...addForm,day:parseInt(e.target.value)})} style={ss}>{DAYS_OF_WEEK.map((d)=><option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <InputField label="Material" value={addForm.material} onChange={(v)=>setAddForm({...addForm,material:v})} placeholder="Opcional" />
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>
            Duración estimada (horas) {(() => {
              const st = STAGES.find((x) => x.label === addForm.process || x.id === addForm.process);
              const def = st && PROCESS_DEFAULT_HOURS[st.id];
              return def != null ? <span style={{ color:'var(--t2)', fontWeight:400, fontSize:11 }}>· sugerido: {def}h</span> : null;
            })()}
          </label>
          <input
            type="number" step="0.5" min="0"
            value={addForm.estimated_hours}
            onChange={(e) => setAddForm({...addForm, estimated_hours: e.target.value})}
            placeholder={(() => {
              const st = STAGES.find((x) => x.label === addForm.process || x.id === addForm.process);
              const def = st && PROCESS_DEFAULT_HOURS[st.id];
              return def != null ? String(def) : 'Ej: 2.5';
            })()}
            style={ss}
          />
        </div>
        <InputField label="Notas" value={addForm.notes} onChange={(v)=>setAddForm({...addForm,notes:v})} placeholder="..." textarea />
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
          <Btn variant="secondary" onClick={() => setShowAddModal(false)}>Cancelar</Btn>
          <Btn onClick={addManualItem} disabled={!addForm.process.trim()}>Agregar</Btn>
        </div>
      </Modal>

      {/* ─── Menú de acciones por tarea (v25) ─── */}
      <Modal open={!!taskActionsFor} onClose={() => setTaskActionsFor(null)} title="Acciones de la tarea" width={380}>
        {taskActionsFor && (() => {
          const currentAssignee = staff.find((m) => m.id === taskActionsFor.staff_id);
          return (
            <>
              <div style={{ marginBottom:14, padding:'10px 12px', background:'var(--bg)', borderRadius:8, border:'1px solid var(--border)' }}>
                <div style={{ fontWeight:700, fontSize:14, color:'var(--t1)' }}>{taskActionsFor.process}{taskActionsFor.material ? ` · 🪵 ${taskActionsFor.material}` : ''}</div>
                <div style={{ fontSize:11, color:'var(--t2)', marginTop:2 }}>
                  {projectMap[taskActionsFor.project_id] || 'Sin proyecto'}
                  {taskActionsFor.area_id ? ` · 📐 ${areaMap[taskActionsFor.area_id] || ''}` : ''}
                </div>
                {currentAssignee && (
                  <div style={{ fontSize:11, color:'var(--t2)', marginTop:2 }}>Actual: {currentAssignee.name} ({currentAssignee.code})</div>
                )}
              </div>

              {(() => {
                // Si la tarea/proyecto tiene scheduled_week_start > weekStr, mostrar boton adelantar
                const t = taskActionsFor;
                const scheduled = t.scheduled_week_start || null;
                if (!scheduled || scheduled <= weekStr) return null;
                return (
                  <div style={{ marginBottom:14, padding:'10px 12px', background:'#f59e0b10', borderRadius:8, border:'1px solid #f59e0b40' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#c98a1f', marginBottom:6 }}>
                      ⏳ Programada para semana del {scheduled}
                    </div>
                    <Btn variant="secondary" size="sm" style={{ width:'100%' }} onClick={async () => {
                      try {
                        await advanceTaskToCurrentWeek(t.id);
                        await logActivity({ project_id: t.project_id, area_id: t.area_id, action:'task_advanced', description: `Tarea "${t.process}" adelantada a la semana actual.`, user_name: userName });
                        setTaskActionsFor(null); await loadPlans();
                      } catch (e) { alert('Error: ' + e.message); }
                    }}>⏩ Adelantar a esta semana</Btn>
                  </div>
                );
              })()}

              <div style={{ fontSize:11, fontWeight:700, color:'var(--t2)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>Mover a otra semana</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                <Btn variant="secondary" size="sm" onClick={() => handleMoveItem(taskActionsFor, 1)}>→ Próxima semana</Btn>
                <Btn variant="secondary" size="sm" onClick={() => handleMoveItem(taskActionsFor, 2)}>→ En 2 semanas</Btn>
                <Btn variant="secondary" size="sm" onClick={() => handleMoveItem(taskActionsFor, -1)}>← Semana anterior</Btn>
                <Btn variant="secondary" size="sm" onClick={() => { setMoveModal({ item: taskActionsFor }); const d = new Date(weekStr + 'T00:00:00'); d.setDate(d.getDate() + 14); setMovePickerDate(d.toISOString().slice(0,10)); }}>📅 Elegir fecha</Btn>
              </div>

              <div style={{ height:1, background:'var(--border)', margin:'14px 0' }} />

              <div style={{ fontSize:11, fontWeight:700, color:'var(--t2)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>Reasignar a otra persona</div>
              <Btn variant="secondary" size="sm" onClick={() => setReassignModal({ item: taskActionsFor })} style={{ width:'100%' }}>
                👤 Cambiar responsable
              </Btn>

              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
                <Btn variant="ghost" onClick={() => setTaskActionsFor(null)}>Cerrar</Btn>
              </div>
            </>
          );
        })()}
      </Modal>

      {/* Modal: elegir fecha personalizada para mover */}
      <Modal open={!!moveModal} onClose={() => { setMoveModal(null); setMovePickerDate(''); }} title="Mover a fecha específica" width={340}>
        {moveModal && (
          <>
            <p style={{ fontSize:13, color:'var(--t2)', marginBottom:12 }}>
              Elige la semana destino (se toma el lunes de la semana de la fecha elegida).
            </p>
            <input
              type="date"
              value={movePickerDate}
              onChange={(e) => setMovePickerDate(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--t1)', fontSize:14, fontFamily:'inherit' }}
            />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
              <Btn variant="secondary" onClick={() => { setMoveModal(null); setMovePickerDate(''); }}>Cancelar</Btn>
              <Btn disabled={!movePickerDate} onClick={() => {
                // Ajustar la fecha al lunes de esa semana
                const picked = new Date(movePickerDate + 'T00:00:00');
                const dow = picked.getDay();
                const diff = dow === 0 ? -6 : 1 - dow;
                picked.setDate(picked.getDate() + diff);
                const y = picked.getFullYear();
                const m = String(picked.getMonth() + 1).padStart(2, '0');
                const d = String(picked.getDate()).padStart(2, '0');
                handleMoveItem(moveModal.item, 0, `${y}-${m}-${d}`);
              }}>✓ Mover</Btn>
            </div>
          </>
        )}
      </Modal>

      {/* Modal: reasignar responsable */}
      <Modal open={!!reassignModal} onClose={() => { setReassignModal(null); setReassignShowAll(false); }} title="Reasignar responsable" width={420}>
        {reassignModal && (() => {
          const item = reassignModal.item;
          const stageId = item.stage_id || STAGES.find((s) => s.label === item.process)?.id;
          // Filtrar personal por el proceso, salvo que se pida "ver todos"
          const eligible = reassignShowAll
            ? staff
            : staff.filter((m) => stageId && (m.default_processes || []).includes(stageId));
          return (
            <>
              <p style={{ fontSize:13, color:'var(--t2)', marginBottom:12 }}>
                Elige quién asumirá esta tarea.
                {!reassignShowAll && ` Mostrando solo quienes tienen "${item.process}" en su rol.`}
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:320, overflowY:'auto', marginBottom:12 }}>
                {eligible.length === 0 && (
                  <div style={{ padding:12, textAlign:'center', color:'var(--t2)', fontSize:12, background:'var(--bg)', borderRadius:6 }}>
                    Nadie tiene este proceso en su rol. Activa "Ver todos" para elegir a cualquiera.
                  </div>
                )}
                {eligible.map((m) => {
                  const isCurrent = m.id === item.staff_id;
                  return (
                    <button key={m.id}
                      onClick={() => !isCurrent && handleReassignItem(item, m.id)}
                      disabled={isCurrent}
                      style={{
                        display:'flex', alignItems:'center', gap:10,
                        padding:'10px 12px', borderRadius:8,
                        border:`1.5px solid ${isCurrent ? m.color : 'var(--border)'}`,
                        background: isCurrent ? m.color+'12' : 'var(--bg)',
                        cursor: isCurrent ? 'default' : 'pointer',
                        fontFamily:'inherit', textAlign:'left',
                        opacity: isCurrent ? 0.7 : 1,
                      }}>
                      <span style={{ width:28, height:28, borderRadius:6, background:m.color+'25', color:m.color, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:11 }}>{m.code}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:'var(--t1)' }}>{m.name}</div>
                        <div style={{ fontSize:10, color:'var(--t2)' }}>{m.role}</div>
                      </div>
                      {isCurrent && <span style={{ fontSize:10, color:m.color, fontWeight:700 }}>ACTUAL</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--t2)', cursor:'pointer' }}>
                  <input type="checkbox" checked={reassignShowAll} onChange={(e) => setReassignShowAll(e.target.checked)} />
                  Ver todos (para cubrir a alguien)
                </label>
                <Btn variant="ghost" onClick={() => { setReassignModal(null); setReassignShowAll(false); }}>Cancelar</Btn>
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}

// ─── PersonPlan: reusable weekly grid for one person ───
function PersonPlan({ member, items, planId, staff, projectMap, areaMap, projectColorMap, allMaterialNames, allAreas, onToggle, onMoveDay, onMoveInDay, onRemove, onAdd, onExport, onClear, onToggleDone, onRefresh, onOpenActions }) {
  const today = getTodayDayIndex();
  const doneCount = items.filter((i)=>i.status==='done').length;

  return (
    <div style={{ background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid var(--border)', background:member.color+'08' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:34, height:34, borderRadius:8, background:member.color+'20', color:member.color, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13 }}>{member.code}</span>
          <div><div style={{ fontWeight:700, fontSize:15, color:'var(--t1)' }}>{member.name}</div><div style={{ fontSize:11, color:'var(--t2)' }}>{member.role}</div></div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {items.length > 0 && <span style={{ fontSize:12, color:doneCount===items.length&&items.length>0?'#2dcc9f':'var(--t2)', fontWeight:600 }}>{doneCount}/{items.length}</span>}
          {(() => {
            const totalH = items.reduce((sum, it) => sum + (it.estimated_hours != null && it.estimated_hours !== '' ? Number(it.estimated_hours) : 0), 0);
            if (totalH <= 0) return null;
            const display = totalH % 1 === 0 ? totalH : totalH.toFixed(1);
            return <span style={{ fontSize:11, color:'#7c6df0', fontWeight:700, background:'#7c6df015', padding:'2px 6px', borderRadius:4 }}>⏱ {display}h</span>;
          })()}
          <Btn variant="ghost" size="xs" onClick={() => onRefresh(member.id)}>🔄 Refrescar</Btn>
          <Btn variant="ghost" size="xs" onClick={() => onAdd(member.id)}>+ Agregar</Btn>
          <Btn variant="ghost" size="xs" onClick={() => onExport(member)}>📄 PDF</Btn>
          {doneCount > 0 && planId && <Btn variant="ghost" size="xs" onClick={() => onClear(planId, doneCount)}>🗑 Limpiar</Btn>}
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--t2)' }}>
          <div style={{ marginBottom:6 }}>Sin actividades esta semana.</div>
          <div style={{ fontSize:11, color:'var(--t2)', opacity:0.8 }}>
            Procesos asignados: {(member.default_processes||[]).join(', ') || '(ninguno)'}
          </div>
          <div style={{ fontSize:11, color:'var(--t2)', opacity:0.7, marginTop:4 }}>
            Aparecerán tareas cuando existan en Planificación, o cuando se desbloqueen al completar el proceso anterior.
          </div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)' }}>
          {DAYS_OF_WEEK.map((day) => {
            const dayItems = items.filter((i)=>i.day_of_week===day.id).sort((a,b)=>a.sort_order-b.sort_order);
            const isToday = day.id === today;
            return (
              <div key={day.id} style={{ borderRight:day.id<6?'1px solid var(--border)':'none' }}>
                <div style={{
                  padding:'4px 8px', fontSize:10, fontWeight:700, textAlign:'center',
                  textTransform:'uppercase', letterSpacing:'0.05em',
                  borderBottom:'1px solid var(--border)',
                  color: isToday ? member.color : day.id===6 ? '#e6a23c' : 'var(--t2)',
                  background: isToday ? member.color+'10' : 'transparent',
                }}>
                  {day.short}
                  {isToday && <span style={{ display:'block', fontSize:7, marginTop:1, opacity:0.7 }}>HOY</span>}
                  {(() => {
                    const dayHours = dayItems.reduce((sum, it) => sum + (it.estimated_hours != null && it.estimated_hours !== '' ? Number(it.estimated_hours) : 0), 0);
                    if (dayHours <= 0) return null;
                    const display = dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1);
                    return <div style={{ fontSize:7, marginTop:1, color:'var(--t2)', fontWeight:600, opacity:0.85 }}>{display}h</div>;
                  })()}
                </div>
                <div style={{ padding:4, display:'flex', flexDirection:'column', gap:3 }}>
                  {dayItems.map((item, itemIdx) => {
                    const pc = item.project_id ? projectColorMap[item.project_id]||'#7a8599' : '#7a8599';
                    const mc = item.material ? getMaterialColor(item.material, allMaterialNames) : null;
                    const sc = { blocked:'#9ca3af', pending:'#7a8599', in_progress:'#4a9eff', done:'#2dcc9f' };
                    const borderColor = mc || pc;
                    const isBlocked = item.status === 'blocked';
                    return (
                      <div key={item.id} style={{
                        borderRadius:5, fontSize:10, lineHeight:1.3,
                        background: item.status==='done' ? '#2dcc9f06' : isBlocked ? 'var(--bg)' : mc ? mc+'08' : 'var(--bg)',
                        borderLeft:`3px solid ${borderColor}`,
                        border:`1px solid ${mc?mc+'30':'transparent'}`,
                        borderLeftWidth:3, borderLeftColor:borderColor,
                        opacity: item.status==='done' ? 0.6 : isBlocked ? 0.55 : 1,
                        overflow:'hidden',
                      }}>
                        {/* MATERIAL BANNER */}
                        {mc && item.material && (
                          <div style={{
                            background: mc+'22',
                            borderBottom: `1px solid ${mc}40`,
                            padding: '3px 5px',
                            fontSize: 9, fontWeight: 800, color: mc,
                            textTransform:'uppercase', letterSpacing:'0.02em',
                            display:'flex', alignItems:'center', gap:3,
                          }}>
                            <span>🪵</span>
                            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.material}</span>
                          </div>
                        )}
                        <div style={{ padding:'5px 6px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:3, marginBottom:2 }}>
                            <button onClick={() => isBlocked ? null : onToggle(item)}
                              style={{ width:16, height:16, borderRadius:4, flexShrink:0, border:`2px solid ${sc[item.status]}`, background: item.status==='done'?sc.done:item.status==='in_progress'?sc.in_progress+'30':'transparent', cursor: isBlocked?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:item.status==='done'?'#fff':sc[item.status], fontSize:9, fontWeight:700, padding:0 }}>
                              {item.status==='done'?'✓':item.status==='in_progress'?'◉':isBlocked?'🔒':''}
                            </button>
                            <span style={{ fontWeight:600, color:item.status==='done'?'var(--t2)':'var(--t1)', textDecoration:item.status==='done'?'line-through':'none', flex:1 }}>{item.process}</span>
                            {onOpenActions && item.status !== 'done' && (
                              <button onClick={(e) => { e.stopPropagation(); onOpenActions(item); }}
                                title="Más acciones"
                                style={{ width:16, height:16, borderRadius:3, border:'none', background:'transparent', color:'var(--t2)', cursor:'pointer', fontSize:12, fontWeight:800, padding:0, lineHeight:1 }}>
                                ⋯
                              </button>
                            )}
                          </div>
                          {item.project_id && <div style={{ color:pc, fontSize:8, fontWeight:600 }}>{projectMap[item.project_id]||''}</div>}
                          {item.area_id && <div style={{ color:'var(--t2)', fontSize:8 }}>📐 {areaMap[item.area_id]||'Área'}</div>}
                          {item.notes && item.notes.trim().length > 0 && (
                            <div style={{ marginTop:3, padding:'3px 5px', background:'var(--surface)', borderLeft:'2px solid #e6a23c', borderRadius:'0 3px 3px 0', fontSize:9, color:'var(--t2)', lineHeight:1.3, fontStyle:'italic' }}
                              title={item.notes}>
                              📝 {item.notes.length > 60 ? item.notes.slice(0,60)+'…' : item.notes}
                            </div>
                          )}
                          {item.estimated_hours != null && item.estimated_hours !== '' && (
                            <div style={{ marginTop:3, fontSize:9, fontWeight:700, color:'#7c6df0', display:'inline-flex', alignItems:'center', gap:3, background:'#7c6df015', padding:'2px 5px', borderRadius:3 }}>
                              ⏱ {Number(item.estimated_hours) % 1 === 0 ? Number(item.estimated_hours) : Number(item.estimated_hours).toFixed(1)}h
                            </div>
                          )}
                          {(() => {
                            // Indicator: show if item was created more than 7 days ago and still not done
                            if (item.status === 'done' || !item.created_at) return null;
                            const ageDays = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000);
                            if (ageDays < 7) return null;
                            const weeks = Math.floor(ageDays / 7);
                            return (
                              <div style={{ marginTop:3, fontSize:8, fontWeight:700, color:'#ef4444', background:'#ef444415', padding:'2px 5px', borderRadius:3, display:'inline-block' }}>
                                ⏰ {weeks === 1 ? '+1 semana' : `+${weeks} semanas`}
                              </div>
                            );
                          })()}
                          {/* Mecanizado checklist when applicable */}
                          {item.process === 'Mecanizado' && item.area_id && allAreas && (
                            <div style={{ marginTop:4 }}>
                              <MecanizadoChecklist
                                area={allAreas.find((a) => a.id === item.area_id)}
                                taskId={item.id}
                                onAllDone={() => { if (item.status !== 'done') onToggleDone(item); }}
                              />
                            </div>
                          )}
                          <div style={{ display:'flex', gap:2, marginTop:3, alignItems:'center' }}>
                            <span onClick={()=>onMoveInDay(item,-1,dayItems)} style={{ cursor:'pointer', fontSize:9, color:'var(--t2)', userSelect:'none', padding:'0 2px' }}>▲</span>
                            <span onClick={()=>onMoveInDay(item,1,dayItems)} style={{ cursor:'pointer', fontSize:9, color:'var(--t2)', userSelect:'none', padding:'0 2px' }}>▼</span>
                            {day.id>1 && <span onClick={()=>onMoveDay(item,day.id-1)} style={{ cursor:'pointer', fontSize:9, color:'var(--t2)', userSelect:'none', padding:'0 2px' }}>◀</span>}
                            {day.id<6 && <span onClick={()=>onMoveDay(item,day.id+1)} style={{ cursor:'pointer', fontSize:9, color:'var(--t2)', userSelect:'none', padding:'0 2px' }}>▶</span>}
                            <span onClick={()=>onRemove(item)} style={{ cursor:'pointer', color:'#f06060', fontSize:9, marginLeft:'auto' }}>✕</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── FilterChip (v23) ───
function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 6, border: '1px solid',
        borderColor: active ? '#7c6df0' : 'var(--border)',
        background: active ? '#7c6df015' : 'var(--bg)',
        color: active ? '#7c6df0' : 'var(--t2)',
        fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}>{children}</button>
  );
}

// ─── ProjectGroupedView (v23) ───
function ProjectGroupedView({ groups, projects, allAreas, staff, projectMap, areaMap, projectColorMap, onToggleItem, onRemoveItem, onOpenActions, onPauseProject, onRemoveProjectFromWeek }) {
  if (groups.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--t2)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        No hay tareas que mostrar con los filtros actuales.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map((group, idx) => {
        const proj = projects.find((p) => p.id === group.project_id);
        const color = projectColorMap[group.project_id] || '#7c6df0';
        const projName = proj?.name || 'Sin proyecto';
        const isPaused = proj?.status === 'paused';
        const total = group.items.length;
        const done = group.items.filter((i) => i.status === 'done').length;
        const stalled = group.items.filter((i) => {
          if (i.status === 'done' || !i.created_at) return false;
          const ageDays = Math.floor((Date.now() - new Date(i.created_at).getTime()) / 86400000);
          return ageDays >= 7;
        }).length;

        return (
          <div key={group.project_id || idx} style={{
            background: 'var(--surface)', borderRadius: 12,
            border: '1px solid var(--border)', borderLeft: `4px solid ${color}`, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: color + '08', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--t1)' }}>{projName}</span>
                {proj?.client && <span style={{ fontSize: 12, color: 'var(--t2)' }}>· {proj.client}</span>}
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg)', color: 'var(--t2)', fontWeight: 700 }}>
                  {done}/{total} listas
                </span>
                {(() => {
                  const projHours = group.items.reduce((sum, it) => sum + (it.estimated_hours != null && it.estimated_hours !== '' ? Number(it.estimated_hours) : 0), 0);
                  if (projHours <= 0) return null;
                  const display = projHours % 1 === 0 ? projHours : projHours.toFixed(1);
                  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#7c6df015', color: '#7c6df0', fontWeight: 700 }}>⏱ {display}h</span>;
                })()}
                {stalled > 0 && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#ef444415', color: '#ef4444', fontWeight: 700 }}>
                    ⏰ {stalled} estancada{stalled !== 1 ? 's' : ''}
                  </span>
                )}
                {isPaused && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f59e0b15', color: '#f59e0b', fontWeight: 700 }}>⏸ Pausado</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!isPaused && group.project_id && (
                  <>
                    <button onClick={() => onRemoveProjectFromWeek(group.project_id)}
                      title="Quitar todas estas tareas solo de esta semana"
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t2)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      🗑 Quitar de la semana
                    </button>
                    <button onClick={() => onPauseProject(group.project_id)}
                      title="Pausar el proyecto entero — sus tareas dejarán de aparecer"
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #f59e0b50', background: '#f59e0b15', color: '#f59e0b', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      ⏸ Pausar proyecto
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ padding: 10 }}>
              {Object.entries(group.byStaff).map(([staffId, sItems]) => {
                const member = staff.find((m) => m.id === staffId);
                if (!member) return null;
                return (
                  <div key={staffId} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: member.color + '25', color: member.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 9 }}>{member.code}</span>
                      {member.name}
                      <span style={{ fontWeight: 600, color: 'var(--t2)' }}>· {sItems.length} tarea{sItems.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {sItems.map((item) => {
                        const isDone = item.status === 'done';
                        const isBlocked = item.status === 'blocked';
                        const isProgress = item.status === 'in_progress';
                        return (
                          <div key={item.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px', borderRadius: 6,
                            background: isDone ? '#2dcc9f10' : isProgress ? '#4a9eff10' : 'var(--bg)',
                            border: `1px solid ${isDone ? '#2dcc9f30' : isProgress ? '#4a9eff30' : 'var(--border)'}`,
                            opacity: isBlocked ? 0.6 : 1,
                          }}>
                            <span onClick={() => onToggleItem(item)}
                              style={{ cursor: 'pointer', width: 18, height: 18, borderRadius: 4, border: `2px solid ${isDone ? '#2dcc9f' : isProgress ? '#4a9eff' : 'var(--border)'}`, background: isDone ? '#2dcc9f' : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                              {isDone ? '✓' : isProgress ? '◉' : isBlocked ? '🔒' : ''}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: isDone ? '#2dcc9f' : 'var(--t1)', textDecoration: isDone ? 'line-through' : 'none' }}>
                                {item.process}{item.material && <span style={{ color: 'var(--t2)', fontWeight: 500 }}> · 🪵 {item.material}</span>}
                              </div>
                              {item.area_id && <div style={{ fontSize: 10, color: 'var(--t2)' }}>📐 {areaMap[item.area_id]}</div>}
                              {item.estimated_hours != null && item.estimated_hours !== '' && (
                                <div style={{ fontSize: 10, color: '#7c6df0', fontWeight: 700, marginTop: 1 }}>
                                  ⏱ {Number(item.estimated_hours) % 1 === 0 ? Number(item.estimated_hours) : Number(item.estimated_hours).toFixed(1)}h
                                </div>
                              )}
                              {item.notes && item.notes.trim() && (
                                <div style={{ fontSize: 10, color: 'var(--t2)', fontStyle: 'italic', marginTop: 2 }}>
                                  📝 {item.notes.length > 80 ? item.notes.slice(0, 80) + '…' : item.notes}
                                </div>
                              )}
                            </div>
                            {item.status !== 'done' && (
                              <button onClick={() => onOpenActions(item)}
                                title="Más acciones"
                                style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--t2)', cursor: 'pointer', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', lineHeight: 1 }}>⋯</button>
                            )}
                            <button onClick={() => onRemoveItem(item)}
                              title="Quitar esta tarea de la semana (descartar)"
                              style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
