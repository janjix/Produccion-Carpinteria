import { useState, useEffect, useCallback, useRef } from 'react';
import { Btn, Modal, InputField, Badge, EmptyState } from './UI.jsx';
import { STAGES, DAYS_OF_WEEK, DEFAULT_STAFF_PROCESSES, PROCESS_DEPENDENCIES, PROJECT_COLORS, PLANNING_STATUSES } from '../lib/constants.js';
import {
  useStaff,
  usePlanningTasks,
  getWeeklyPlans,
  createWeeklyPlan,
  createWeeklyPlanItemsBulk,
  getWeeklyPlanItems,
  updateWeeklyPlanItem,
  deleteWeeklyPlanItem,
  updatePlanningTask,
  updateArea,
  propagateNextProcesses,
  getAllPlanningTasks,
  getAllStaff,
  logActivity,
} from '../hooks/useSupabase.js';

function getMonday(d) {
  const date = new Date(d); const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff); date.setHours(0, 0, 0, 0); return date;
}
function formatWeek(monday) {
  const end = new Date(monday); end.setDate(end.getDate() + 5);
  const opts = { day: '2-digit', month: 'short' };
  return `${monday.toLocaleDateString('es-MX', opts)} — ${end.toLocaleDateString('es-MX', opts)}`;
}
function toDateStr(d) { return d.toISOString().split('T')[0]; }

export default function StaffView({ projects, allAreas, userName }) {
  const { data: staff } = useStaff();
  const { data: planningTasks } = usePlanningTasks();
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const [plans, setPlans] = useState([]);
  const [planItems, setPlanItems] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ process: '', project_id: '', area_id: '', material: '', day: 1, is_admin: false, is_general: false, notes: '' });

  const weekStr = toDateStr(currentMonday);
  const projectMap = {}; projects.forEach((p) => { projectMap[p.id] = p.name; });
  const projectColorMap = {}; projects.forEach((p, i) => { projectColorMap[p.id] = PROJECT_COLORS[i % PROJECT_COLORS.length]; });
  const areaMap = {}; allAreas.forEach((a) => { areaMap[a.id] = a.name; });

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const weekPlans = await getWeeklyPlans(weekStr); setPlans(weekPlans);
      const items = {};
      for (const plan of weekPlans) {
        const list = await getWeeklyPlanItems(plan.id);
        items[plan.staff_id] = { planId: plan.id, items: list };
      }
      setPlanItems(items);
    } catch (e) { console.error('Load plans error:', e); }
    setLoading(false);
  }, [weekStr]);

  useEffect(() => { loadPlans(); }, [loadPlans]);
  function prevWeek() { const d = new Date(currentMonday); d.setDate(d.getDate() - 7); setCurrentMonday(d); }
  function nextWeek() { const d = new Date(currentMonday); d.setDate(d.getDate() + 7); setCurrentMonday(d); }

  async function generateWeeklyPlan() {
    if (staff.length === 0) { alert('No hay personal registrado.'); return; }
    setLoading(true);
    try {
      const pendingTasks = planningTasks.filter((t) => t.status !== 'done');
      const usedTaskIds = new Set();

      // Get previous week's plans to carry over incomplete items
      const prevMonday = new Date(currentMonday);
      prevMonday.setDate(prevMonday.getDate() - 7);
      const prevWeekStr = toDateStr(prevMonday);
      let prevPlans = [];
      try { prevPlans = await getWeeklyPlans(prevWeekStr); } catch (e) { /* ok */ }
      const prevItemsMap = {};
      for (const pp of prevPlans) {
        try {
          const items = await getWeeklyPlanItems(pp.id);
          prevItemsMap[pp.staff_id] = items.filter((i) => i.status !== 'done');
        } catch (e) { /* ok */ }
      }

      for (const member of staff) {
        const existing = plans.find((p) => p.staff_id === member.id);
        if (existing) continue;

        const plan = await createWeeklyPlan({ staff_id: member.id, week_start: weekStr });
        const memberProcesses = member.default_processes || [];
        const items = [];
        let sortOrder = 0;
        const dayCounters = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

        // 1. Carry over incomplete tasks from previous week (put them on Monday)
        const carryOver = prevItemsMap[member.id] || [];
        for (const co of carryOver) {
          items.push({
            plan_id: plan.id, staff_id: member.id,
            project_id: co.project_id, area_id: co.area_id,
            process: co.process, material: co.material || '',
            day_of_week: 1, sort_order: sortOrder++,
            status: co.status === 'in_progress' ? 'in_progress' : 'pending',
            notes: co.notes || '', is_admin: co.is_admin, is_general: co.is_general,
          });
          dayCounters[1]++;
        }

        // 2. Assign new pending planning tasks for this person
        const relevantTasks = pendingTasks.filter((t) =>
          t.stage && memberProcesses.includes(t.stage) && !usedTaskIds.has(t.id)
        );
        for (const task of relevantTasks) {
          // Check if this task was already carried over
          const alreadyAdded = items.some((i) =>
            i.project_id === task.project_id && i.area_id === task.area_id &&
            i.process === (STAGES.find((s) => s.id === task.stage)?.label || task.stage) &&
            (i.material || '') === (task.material || '')
          );
          if (alreadyAdded) { usedTaskIds.add(task.id); continue; }

          let assignedDay = null;
          for (let d = 1; d <= 6; d++) {
            const max = d === 6 ? 3 : 5;
            if (dayCounters[d] < max) { assignedDay = d; break; }
          }
          if (!assignedDay) assignedDay = 1; // overflow to Monday, never leave empty

          items.push({
            plan_id: plan.id, staff_id: member.id,
            project_id: task.project_id, area_id: task.area_id,
            process: STAGES.find((s) => s.id === task.stage)?.label || task.stage,
            material: task.material || '', day_of_week: assignedDay, sort_order: sortOrder++,
            status: 'pending', notes: task.description || '', is_admin: false, is_general: false,
          });
          usedTaskIds.add(task.id);
          dayCounters[assignedDay]++;
        }

        // 3. Recurring: Mantenimiento viernes para Ayudantes
        if (member.code === 'AA') {
          items.push({ plan_id: plan.id, staff_id: member.id, project_id: null, area_id: null, process: 'Mantenimiento de Máquinas', material: '', day_of_week: 5, sort_order: sortOrder++, status: 'pending', notes: '', is_admin: false, is_general: true });
        }

        if (items.length > 0) await createWeeklyPlanItemsBulk(items);
      }

      await logActivity({ project_id: null, action: 'weekly_plan_generated', description: `Planificación semanal generada: ${formatWeek(currentMonday)}`, user_name: userName });
      await loadPlans();
    } catch (e) { alert('Error generando plan: ' + e.message); }
    setLoading(false);
  }

  // ─── Move task to different day ───
  async function moveItemToDay(item, newDay) {
    if (item.day_of_week === newDay) return;
    setPlanItems((prev) => {
      const copy = { ...prev }; const sd = copy[item.staff_id];
      if (sd) copy[item.staff_id] = { ...sd, items: sd.items.map((i) => i.id === item.id ? { ...i, day_of_week: newDay } : i) };
      return copy;
    });
    updateWeeklyPlanItem(item.id, { day_of_week: newDay });
  }

  // ─── Reorder within day ───
  async function moveItemInDay(item, direction, dayItems) {
    const idx = dayItems.findIndex((i) => i.id === item.id);
    const target = idx + direction;
    if (target < 0 || target >= dayItems.length) return;
    const swapItem = dayItems[target];
    setPlanItems((prev) => {
      const copy = { ...prev }; const sd = copy[item.staff_id];
      if (sd) copy[item.staff_id] = { ...sd, items: sd.items.map((i) => {
        if (i.id === item.id) return { ...i, sort_order: target };
        if (i.id === swapItem.id) return { ...i, sort_order: idx };
        return i;
      })};
      return copy;
    });
    updateWeeklyPlanItem(item.id, { sort_order: target });
    updateWeeklyPlanItem(swapItem.id, { sort_order: idx });
  }

  async function toggleItemStatus(item) {
    const order = ['pending', 'in_progress', 'done'];
    const idx = order.indexOf(item.status);
    const next = order[(idx + 1) % order.length];

    // Optimistic UI: update local state immediately
    setPlanItems((prev) => {
      const copy = { ...prev };
      const staffData = copy[item.staff_id];
      if (staffData) {
        copy[item.staff_id] = {
          ...staffData,
          items: staffData.items.map((i) => i.id === item.id ? { ...i, status: next } : i),
        };
      }
      return copy;
    });

    // Fire DB update (non-blocking)
    updateWeeklyPlanItem(item.id, { status: next });

    // Background sync when marking done
    if (next === 'done' && item.project_id) {
      const stageMatch = STAGES.find((s) => s.label === item.process);
      if (stageMatch) {
        (async () => {
          try {
            const allTasks = await getAllPlanningTasks();
            const matchingTask = allTasks.find((t) =>
              t.project_id === item.project_id && t.area_id === item.area_id &&
              t.stage === stageMatch.id && (t.material || '') === (item.material || '') && t.status !== 'done'
            );
            if (matchingTask) updatePlanningTask(matchingTask.id, { status: 'done' });

            // Check if all material tasks for this stage+area are done
            const pendingForStage = allTasks.filter((t) =>
              t.project_id === item.project_id && t.area_id === item.area_id &&
              t.stage === stageMatch.id && t.status !== 'done' && t.id !== matchingTask?.id
            );
            if (pendingForStage.length === 0 && item.area_id) {
              updateArea(item.area_id, { [`stage_${stageMatch.id}`]: true });
              logActivity({ project_id: item.project_id, area_id: item.area_id, action: 'stage_completed', stage: stageMatch.id, description: `${stageMatch.label} completado en ${areaMap[item.area_id] || ''}`, user_name: 'Sistema' });
            }

            // Propagate next processes
            if (matchingTask) {
              const areaName = allAreas.find((a) => a.id === item.area_id)?.name || '';
              const enrichedTask = { ...matchingTask, _area_name: areaName };
              const latestTasks = await getAllPlanningTasks();
              const staffList = await getAllStaff();
              const created = await propagateNextProcesses(enrichedTask, latestTasks, staffList);
              if (created.length > 0) {
                logActivity({ project_id: item.project_id, action: 'auto_propagated', description: `${created.length} proceso(s) creado(s) tras completar "${item.process}"`, user_name: 'Sistema' });
              }
            }
          } catch (e) { console.error('Sync error:', e); }
        })();
      }
    }
  }

  async function addManualItem() {
    if (!selectedStaff || !addForm.process.trim()) return;
    const staffPlan = planItems[selectedStaff];
    if (!staffPlan) { alert('Genera la planificación semanal primero.'); return; }
    try {
      await createWeeklyPlanItemsBulk([{
        plan_id: staffPlan.planId, staff_id: selectedStaff,
        project_id: addForm.project_id || null, area_id: addForm.area_id || null,
        process: addForm.process, material: addForm.material,
        day_of_week: addForm.day, sort_order: (staffPlan.items?.length || 0),
        status: 'pending', notes: addForm.notes, is_admin: addForm.is_admin, is_general: addForm.is_general,
      }]);
      setShowAddModal(false); await loadPlans();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function reassignItem(item, newStaffId) {
    const targetPlan = planItems[newStaffId];
    if (!targetPlan) { alert('La persona destino no tiene plan esta semana.'); return; }
    await updateWeeklyPlanItem(item.id, { staff_id: newStaffId, plan_id: targetPlan.planId });
    await loadPlans();
  }

  async function removeItem(item) {
    if (!confirm('¿Eliminar esta actividad?')) return;
    await deleteWeeklyPlanItem(item.id); await loadPlans();
  }

  function exportPDF(member) {
    const memberItems = planItems[member.id]?.items || [];
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Plan ${member.name}</title>
    <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Segoe UI', sans-serif; padding: 30px; color: #1a1a2e; font-size: 12px; } h1 { font-size: 18px; margin-bottom: 2px; } .subtitle { color: #7a7a9a; font-size: 11px; margin-bottom: 20px; } .day-header { background: #f5f5fa; padding: 6px 12px; font-weight: 700; font-size: 13px; border-radius: 6px; margin: 12px 0 6px; color: ${member.color}; } .item { padding: 8px 12px; border-left: 3px solid #e0e0ea; margin-bottom: 6px; } .process { font-weight: 700; font-size: 13px; } .material-tag { background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block; margin-top: 3px; } .meta { color: #7a7a9a; font-size: 10px; } .badge { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600; } .admin { background: #fef3c7; color: #92400e; } .general { background: #e0f2fe; color: #0369a1; } .done-item { opacity: 0.4; } @media print { body { padding: 15px; } }</style></head><body>`;
    html += `<h1>${member.name} (${member.code})</h1>`;
    html += `<div class="subtitle">${member.role} — Semana ${formatWeek(currentMonday)}</div>`;
    DAYS_OF_WEEK.forEach((day) => {
      const dayItems = memberItems.filter((i) => i.day_of_week === day.id);
      if (dayItems.length === 0) return;
      html += `<div class="day-header">${day.label}</div>`;
      dayItems.forEach((item) => {
        const pc = item.project_id ? projectColorMap[item.project_id] || '#7a8599' : '#7a8599';
        const doneClass = item.status === 'done' ? ' done-item' : '';
        html += `<div class="item${doneClass}" style="border-left-color:${pc}">`;
        html += `<span class="process">${item.process}</span>`;
        if (item.is_admin) html += ` <span class="badge admin">Admin</span>`;
        if (item.is_general) html += ` <span class="badge general">General</span>`;
        if (item.status === 'done') html += ` <span class="badge" style="background:#d1fae5;color:#065f46;">✓ Listo</span>`;
        if (item.material) html += `<br/><span class="material-tag">🪵 MATERIAL: ${item.material}</span>`;
        html += `<br/>`;
        if (item.project_id) html += `<span class="meta">📋 ${projectMap[item.project_id] || ''}</span> `;
        if (item.area_id) html += `<span class="meta">📐 ${areaMap[item.area_id] || ''}</span>`;
        if (item.notes) html += `<br/><span class="meta">${item.notes}</span>`;
        html += `</div>`;
      });
    });
    html += `</body></html>`;
    const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank'); if (w) w.onload = () => setTimeout(() => w.print(), 500);
  }

  const areasForAddProject = allAreas.filter((a) => a.project_id === addForm.project_id);
  const ss = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>Personal</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t2)' }}>Completar aquí actualiza Planificación y Proyectos. Usa ▲▼ y ◀▶ para reordenar.</p>
        </div>
        <Btn onClick={generateWeeklyPlan} disabled={loading}>{loading ? 'Generando...' : '⚡ Generar semana'}</Btn>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Btn variant="ghost" size="sm" onClick={prevWeek}>← Anterior</Btn>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{formatWeek(currentMonday)}</span>
        <Btn variant="ghost" size="sm" onClick={nextWeek}>Siguiente →</Btn>
      </div>

      {staff.length === 0 ? (
        <EmptyState icon="👥" title="Sin personal" description="Ejecuta la migración 003 en Supabase para crear el equipo." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {staff.map((member) => {
            const memberData = planItems[member.id];
            const items = memberData?.items || [];
            const doneCount = items.filter((i) => i.status === 'done').length;
            const totalCount = items.length;
            return (
              <div key={member.id} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: member.color + '08' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: member.color + '20', color: member.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{member.code}</span>
                    <div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{member.name}</div><div style={{ fontSize: 11, color: 'var(--t2)' }}>{member.role}</div></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {totalCount > 0 && <span style={{ fontSize: 12, color: doneCount === totalCount && totalCount > 0 ? '#2dcc9f' : 'var(--t2)', fontWeight: 600 }}>{doneCount}/{totalCount}</span>}
                    <Btn variant="ghost" size="xs" onClick={() => { setSelectedStaff(member.id); setAddForm({ process: '', project_id: '', area_id: '', material: '', day: 1, is_admin: false, is_general: false, notes: '' }); setShowAddModal(true); }}>+ Agregar</Btn>
                    <Btn variant="ghost" size="xs" onClick={() => exportPDF(member)}>📄 PDF</Btn>
                  </div>
                </div>
                {items.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--t2)' }}>Sin actividades esta semana.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0 }}>
                    {DAYS_OF_WEEK.map((day) => {
                      const dayItems = items.filter((i) => i.day_of_week === day.id).sort((a, b) => a.sort_order - b.sort_order);
                      return (
                        <div key={day.id} style={{ borderRight: day.id < 6 ? '1px solid var(--border)' : 'none', minHeight: 60 }}>
                          <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: day.id === 6 ? '#e6a23c' : 'var(--t2)', borderBottom: '1px solid var(--border)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{day.short}</div>
                          <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {dayItems.map((item, itemIdx) => {
                              const pc = item.project_id ? projectColorMap[item.project_id] || 'var(--border)' : 'var(--border)';
                              const sc = { pending: '#7a8599', in_progress: '#4a9eff', done: '#2dcc9f' };
                              const hasMaterial = !!item.material;
                              return (
                                <div key={item.id} style={{
                                  padding: '5px 6px', borderRadius: 5,
                                  background: item.status === 'done' ? '#2dcc9f0c' : hasMaterial ? '#e6a23c06' : 'var(--bg)',
                                  borderLeft: `3px solid ${pc}`,
                                  fontSize: 10, lineHeight: 1.3,
                                  border: hasMaterial ? `1px solid #e6a23c25` : 'none',
                                  borderLeftWidth: 3, borderLeftColor: pc,
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                    <button onClick={() => toggleItemStatus(item)}
                                      style={{
                                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                        border: `2px solid ${sc[item.status]}`,
                                        background: item.status === 'done' ? sc.done : item.status === 'in_progress' ? sc.in_progress + '30' : 'transparent',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: item.status === 'done' ? '#fff' : sc[item.status], fontSize: 10, fontWeight: 700, padding: 0,
                                      }}>
                                      {item.status === 'done' ? '✓' : item.status === 'in_progress' ? '◉' : ''}
                                    </button>
                                    <span style={{ fontWeight: 600, color: item.status === 'done' ? 'var(--t2)' : 'var(--t1)', textDecoration: item.status === 'done' ? 'line-through' : 'none', flex: 1 }}>
                                      {item.process}
                                    </span>
                                    {item.is_admin && <span style={{ fontSize: 7, color: '#e6a23c', fontWeight: 700 }}>ADM</span>}
                                    {item.is_general && <span style={{ fontSize: 7, color: '#4a9eff', fontWeight: 700 }}>GEN</span>}
                                  </div>
                                  {/* MATERIAL EMPHASIS */}
                                  {hasMaterial && (
                                    <div style={{
                                      background: '#e6a23c18', border: '1px solid #e6a23c30',
                                      borderRadius: 4, padding: '2px 5px', marginBottom: 2,
                                      fontSize: 9, fontWeight: 700, color: '#e6a23c',
                                      letterSpacing: '0.02em',
                                    }}>
                                      🪵 {item.material}
                                    </div>
                                  )}
                                  {item.project_id && <div style={{ color: pc, fontSize: 9, fontWeight: 600 }}>{projectMap[item.project_id] || ''}</div>}
                                  {item.area_id && <div style={{ color: 'var(--t2)', fontSize: 9 }}>📐 {areaMap[item.area_id] || 'Área'}</div>}
                                  {/* Controls: reorder + move day + reassign + delete */}
                                  <div style={{ display: 'flex', gap: 2, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span onClick={() => moveItemInDay(item, -1, dayItems)} style={{ cursor: 'pointer', fontSize: 9, color: 'var(--t2)', padding: '0 2px', userSelect: 'none' }} title="Subir">▲</span>
                                    <span onClick={() => moveItemInDay(item, 1, dayItems)} style={{ cursor: 'pointer', fontSize: 9, color: 'var(--t2)', padding: '0 2px', userSelect: 'none' }} title="Bajar">▼</span>
                                    {day.id > 1 && <span onClick={() => moveItemToDay(item, day.id - 1)} style={{ cursor: 'pointer', fontSize: 9, color: 'var(--t2)', padding: '0 2px', userSelect: 'none' }} title="Día anterior">◀</span>}
                                    {day.id < 6 && <span onClick={() => moveItemToDay(item, day.id + 1)} style={{ cursor: 'pointer', fontSize: 9, color: 'var(--t2)', padding: '0 2px', userSelect: 'none' }} title="Día siguiente">▶</span>}
                                    <select value={item.staff_id} onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => reassignItem(item, e.target.value)}
                                      style={{ fontSize: 8, padding: '0 1px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--t2)', fontFamily: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}>
                                      {staff.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                                    </select>
                                    <span onClick={() => removeItem(item)} style={{ cursor: 'pointer', color: '#f06060', fontSize: 9 }}>✕</span>
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
          })}
        </div>
      )}

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Agregar actividad" width={440}>
        <InputField label="Proceso / Actividad" value={addForm.process} onChange={(v) => setAddForm({ ...addForm, process: v })} placeholder="Ej: Corte, Revisión, Limpieza..." />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Proyecto</label><select value={addForm.project_id} onChange={(e) => setAddForm({ ...addForm, project_id: e.target.value, area_id: '' })} style={ss}><option value="">Sin proyecto</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Área</label><select value={addForm.area_id} onChange={(e) => setAddForm({ ...addForm, area_id: e.target.value })} style={ss}><option value="">Sin área</option>{areasForAddProject.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Día</label><select value={addForm.day} onChange={(e) => setAddForm({ ...addForm, day: parseInt(e.target.value) })} style={ss}>{DAYS_OF_WEEK.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <InputField label="Material" value={addForm.material} onChange={(v) => setAddForm({ ...addForm, material: v })} placeholder="Opcional" />
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}><input type="checkbox" checked={addForm.is_admin} onChange={(e) => setAddForm({ ...addForm, is_admin: e.target.checked })} /> Administrativa</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}><input type="checkbox" checked={addForm.is_general} onChange={(e) => setAddForm({ ...addForm, is_general: e.target.checked })} /> General</label>
        </div>
        <InputField label="Notas" value={addForm.notes} onChange={(v) => setAddForm({ ...addForm, notes: v })} placeholder="Observaciones..." textarea />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setShowAddModal(false)}>Cancelar</Btn>
          <Btn onClick={addManualItem} disabled={!addForm.process.trim()}>Agregar</Btn>
        </div>
      </Modal>
    </div>
  );
}
