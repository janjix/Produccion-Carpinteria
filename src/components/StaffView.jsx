import { useState, useEffect, useCallback } from 'react';
import { Btn, Modal, InputField, Badge, EmptyState } from './UI.jsx';
import { STAGES, DAYS_OF_WEEK, PROJECT_COLORS, MATERIAL_COLORS, MANAGER_CODES, STAGE_ORDER } from '../lib/constants.js';
import {
  useStaff, usePlanningTasks,
  getWeeklyPlans, createWeeklyPlan, createWeeklyPlanItemsBulk,
  getWeeklyPlanItems, updateWeeklyPlanItem, deleteWeeklyPlanItem,
  deleteCompletedWeeklyItems, updatePlanningTask, updateProject,
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
function toDateStr(d) { return d.toISOString().split('T')[0]; }
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
  const [addForm, setAddForm] = useState({ process:'', project_id:'', area_id:'', material:'', day:1, notes:'' });
  // Priority modal: opens before generating
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [priorityOrder, setPriorityOrder] = useState([]); // array of project ids in priority order

  const isManager = currentStaff && MANAGER_CODES.includes(currentStaff.code);
  const weekStr = toDateStr(currentMonday);

  const projectMap = {}; projects.forEach((p) => { projectMap[p.id] = p.name; });
  const projectColorMap = {}; projects.forEach((p,i) => { projectColorMap[p.id] = PROJECT_COLORS[i%PROJECT_COLORS.length]; });
  const areaMap = {}; allAreas.forEach((a) => { areaMap[a.id] = a.name; });
  const allMaterialNames = planningTasks.map((t) => t.material).filter(Boolean);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const weekPlans = await getWeeklyPlans(weekStr);
      setPlans(weekPlans);
      const items = {};
      for (const plan of weekPlans) {
        const list = await getWeeklyPlanItems(plan.id);
        items[plan.staff_id] = { planId: plan.id, items: list };
      }
      setPlanItems(items);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [weekStr]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

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

  async function generateWeeklyPlan(orderedProjectIds = null) {
    setLoading(true);
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

      for (const member of staff) {
        const memberProcs = member.default_processes || [];

        let plan = plans.find((p) => p.staff_id === member.id);
        let existingItems = [];
        let sort = 0;
        if (plan) {
          try { existingItems = await getWeeklyPlanItems(plan.id); } catch (e) { /* ok */ }
          sort = existingItems.length;
        } else {
          plan = await createWeeklyPlan({ staff_id: member.id, week_start: weekStr });
        }

        const items = [];
        const dayCount = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
        existingItems.forEach((i) => { if (i.day_of_week) dayCount[i.day_of_week] = (dayCount[i.day_of_week]||0) + 1; });
        const maxPerDay = (d) => d === 6 ? 3 : 5;

        // Carry over from previous week (only if no plan existed yet)
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
          } catch (e) { /* ok */ }
        }

        // Now add pending planning tasks (already sorted by project priority)
        const relevant = pending.filter((t) =>
          t.stage && memberProcs.includes(t.stage) && !usedTaskIds.has(t.id)
        );

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

          let assignedDay = today;
          for (let d = today; d <= 6; d++) {
            if ((dayCount[d] || 0) < maxPerDay(d)) { assignedDay = d; break; }
          }

          items.push({
            plan_id: plan.id, staff_id: member.id,
            project_id: task.project_id, area_id: task.area_id,
            process: label, material: task.material || '',
            day_of_week: assignedDay, sort_order: sort++,
            status: 'pending', notes: task.description || '',
            is_admin: false, is_general: false,
          });
          usedTaskIds.add(task.id);
          dayCount[assignedDay]++;
        }

        if (member.code === 'AA') {
          const hasMaint = [...existingItems, ...items].some((i) => i.process === 'Mantenimiento de Máquinas');
          if (!hasMaint) {
            items.push({ plan_id:plan.id, staff_id:member.id, project_id:null, area_id:null,
              process:'Mantenimiento de Máquinas', material:'', day_of_week:5, sort_order:sort++,
              status:'pending', notes:'', is_admin:false, is_general:true });
          }
        }

        if (items.length > 0) await createWeeklyPlanItemsBulk(items);
      }

      await logActivity({ project_id: null, action: 'weekly_plan_generated',
        description: `Planificación generada con prioridades — ${formatWeek(currentMonday)}`,
        user_name: userName });
      await loadPlans();
    } catch (e) { alert('Error: ' + e.message); console.error(e); }
    setLoading(false);
  }

  async function toggleItemStatus(item) {
    const order = ['pending','in_progress','done'];
    const next = order[(order.indexOf(item.status)+1) % order.length];
    // Optimistic update
    setPlanItems((prev) => {
      const c = { ...prev }; const sd = c[item.staff_id];
      if (sd) c[item.staff_id] = { ...sd, items: sd.items.map((i) => i.id===item.id ? {...i,status:next} : i) };
      return c;
    });
    await updateWeeklyPlanItem(item.id, { status: next });

    if (next === 'done' && item.project_id) {
      const stageMatch = STAGES.find((s) => s.label === item.process);
      if (stageMatch) {
        (async () => {
          try {
            const allTasks = await getAllPlanningTasks();
            // Mark planning task done
            const match = allTasks.find((t) =>
              t.project_id===item.project_id && t.area_id===item.area_id &&
              t.stage===stageMatch.id && (t.material||'')===(item.material||'') && t.status!=='done'
            );
            if (match) await updatePlanningTask(match.id, { status:'done' });
            // Propagate successors
            const refreshed = await getAllPlanningTasks();
            const staffList = await getAllStaff();
            const areaName = allAreas.find((a) => a.id===item.area_id)?.name || '';
            const base = match || { project_id:item.project_id, area_id:item.area_id, stage:stageMatch.id, material:item.material||'', _area_name: areaName };
            await propagateNextProcesses({ ...base, _area_name: areaName }, refreshed, staffList);
            await loadPlans(); // reload to show new propagated items
          } catch (e) { console.error(e); }
        })();
      }
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
      await createWeeklyPlanItemsBulk([{
        plan_id:staffPlan.planId, staff_id:addTarget,
        project_id:addForm.project_id||null, area_id:addForm.area_id||null,
        process:addForm.process, material:addForm.material,
        day_of_week:addForm.day, sort_order:staffPlan.items?.length||0,
        status:'pending', notes:addForm.notes, is_admin:false, is_general:false,
      }]);
      setShowAddModal(false); await loadPlans();
    } catch (e) { alert('Error: '+e.message); }
  }

  async function removeItem(item) { if(!confirm('¿Eliminar?')) return; await deleteWeeklyPlanItem(item.id); await loadPlans(); }

  function exportPDF(member) {
    const items = planItems[member.id]?.items||[];
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${member.name}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:28px;color:#1a1a2e;font-size:12px}h1{font-size:17px;margin-bottom:2px}.sub{color:#7a7a9a;font-size:11px;margin-bottom:18px}.day{background:#f5f5fa;padding:5px 10px;font-weight:700;font-size:12px;border-radius:5px;margin:10px 0 5px;color:${member.color}}.item{padding:5px 10px;border-left:3px solid #e0e0ea;margin-bottom:4px}.proc{font-weight:700}.mat{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;margin-top:2px}.meta{color:#7a7a9a;font-size:10px}.done{opacity:0.4;text-decoration:line-through}@media print{body{padding:14px}}</style></head><body>`;
    html+=`<h1>${member.name} (${member.code})</h1><div class="sub">${member.role} — ${formatWeek(currentMonday)}</div>`;
    DAYS_OF_WEEK.forEach((day)=>{
      const di=items.filter((i)=>i.day_of_week===day.id).sort((a,b)=>a.sort_order-b.sort_order);
      if(!di.length) return;
      html+=`<div class="day">${day.label}</div>`;
      di.forEach((item)=>{
        const pc=item.project_id?projectColorMap[item.project_id]||'#7a8599':'#7a8599';
        const mc=item.material?getMaterialColor(item.material,allMaterialNames):'';
        html+=`<div class="item ${item.status==='done'?'done':''}" style="border-left-color:${pc}">`;
        html+=`<span class="proc">${item.process}</span>`;
        if(item.material) html+=` <span class="mat" style="background:${mc}20;color:${mc};border:1px solid ${mc}40">🪵 ${item.material}</span>`;
        html+=`<br/>`;
        if(item.project_id) html+=`<span class="meta">📋 ${projectMap[item.project_id]||''} </span>`;
        if(item.area_id) html+=`<span class="meta">📐 ${areaMap[item.area_id]||''}</span>`;
        if(item.notes) html+=`<br/><span class="meta">${item.notes}</span>`;
        html+=`</div>`;
      });
    });
    html+=`</body></html>`;
    const w=window.open(URL.createObjectURL(new Blob([html],{type:'text/html'})),'_blank');
    if(w) w.onload=()=>setTimeout(()=>w.print(),400);
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
            {isManager ? 'Vista de gerencia — selecciona una persona o genera la semana.' : `Planificación de ${currentStaff?.name||'tu semana'}`}
          </p>
        </div>
        {isManager && <Btn onClick={openPriorityModal} disabled={loading}>{loading?'Generando...':'⚡ Generar semana'}</Btn>}
      </div>

      {/* Week navigation */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <Btn variant="ghost" size="sm" onClick={() => { const d=new Date(currentMonday); d.setDate(d.getDate()-7); setCurrentMonday(d); }}>← Anterior</Btn>
        <span style={{ fontWeight:700, fontSize:14, color:'var(--t1)' }}>{formatWeek(currentMonday)}</span>
        <Btn variant="ghost" size="sm" onClick={() => { const d=new Date(currentMonday); d.setDate(d.getDate()+7); setCurrentMonday(d); }}>Siguiente →</Btn>
      </div>

      {isManager ? (
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
              items={planItems[selectedStaff]?.items||[]}
              planId={planItems[selectedStaff]?.planId}
              staff={staff}
              projectMap={projectMap} areaMap={areaMap} projectColorMap={projectColorMap}
              allMaterialNames={allMaterialNames}
              onToggle={toggleItemStatus} onMoveDay={moveItemToDay} onMoveInDay={moveItemInDay}
              onRemove={removeItem} onAdd={(sid)=>{ setAddTarget(sid); setAddForm({process:'',project_id:'',area_id:'',material:'',day:getTodayDayIndex(),notes:''}); setShowAddModal(true); }}
              onExport={exportPDF} onClear={async(planId,count)=>{ if(!confirm(`¿Limpiar ${count} completadas?`)) return; await deleteCompletedWeeklyItems(planId); await loadPlans(); }}
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
            items={planItems[currentStaff.id]?.items||[]}
            planId={planItems[currentStaff.id]?.planId}
            staff={staff}
            projectMap={projectMap} areaMap={areaMap} projectColorMap={projectColorMap}
            allMaterialNames={allMaterialNames}
            onToggle={toggleItemStatus} onMoveDay={moveItemToDay} onMoveInDay={moveItemInDay}
            onRemove={removeItem} onAdd={(sid)=>{ setAddTarget(sid); setAddForm({process:'',project_id:'',area_id:'',material:'',day:getTodayDayIndex(),notes:''}); setShowAddModal(true); }}
            onExport={exportPDF} onClear={async(planId,count)=>{ if(!confirm(`¿Limpiar ${count} completadas?`)) return; await deleteCompletedWeeklyItems(planId); await loadPlans(); }}
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

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Agregar actividad" width={420}>
        <InputField label="Proceso" value={addForm.process} onChange={(v) => setAddForm({...addForm,process:v})} placeholder="Ej: Corte, Revisión..." />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ marginBottom:14 }}><label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Proyecto</label><select value={addForm.project_id} onChange={(e)=>setAddForm({...addForm,project_id:e.target.value,area_id:''})} style={ss}><option value="">Sin proyecto</option>{projects.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div style={{ marginBottom:14 }}><label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Área</label><select value={addForm.area_id} onChange={(e)=>setAddForm({...addForm,area_id:e.target.value})} style={ss}><option value="">Sin área</option>{areasForAdd.map((a)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ marginBottom:14 }}><label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Día</label><select value={addForm.day} onChange={(e)=>setAddForm({...addForm,day:parseInt(e.target.value)})} style={ss}>{DAYS_OF_WEEK.map((d)=><option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <InputField label="Material" value={addForm.material} onChange={(v)=>setAddForm({...addForm,material:v})} placeholder="Opcional" />
        </div>
        <InputField label="Notas" value={addForm.notes} onChange={(v)=>setAddForm({...addForm,notes:v})} placeholder="..." textarea />
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
          <Btn variant="secondary" onClick={() => setShowAddModal(false)}>Cancelar</Btn>
          <Btn onClick={addManualItem} disabled={!addForm.process.trim()}>Agregar</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─── PersonPlan: reusable weekly grid for one person ───
function PersonPlan({ member, items, planId, staff, projectMap, areaMap, projectColorMap, allMaterialNames, onToggle, onMoveDay, onMoveInDay, onRemove, onAdd, onExport, onClear }) {
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
          <Btn variant="ghost" size="xs" onClick={() => onAdd(member.id)}>+ Agregar</Btn>
          <Btn variant="ghost" size="xs" onClick={() => onExport(member)}>📄 PDF</Btn>
          {doneCount > 0 && planId && <Btn variant="ghost" size="xs" onClick={() => onClear(planId, doneCount)}>🗑 Limpiar</Btn>}
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--t2)' }}>Sin actividades. Genera la semana o agrega manualmente.</div>
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
                }}>{day.short}{isToday && <span style={{ display:'block', fontSize:7, marginTop:1, opacity:0.7 }}>HOY</span>}</div>
                <div style={{ padding:4, display:'flex', flexDirection:'column', gap:3 }}>
                  {dayItems.map((item, itemIdx) => {
                    const pc = item.project_id ? projectColorMap[item.project_id]||'#7a8599' : '#7a8599';
                    const mc = item.material ? getMaterialColor(item.material, allMaterialNames) : null;
                    const sc = { pending:'#7a8599', in_progress:'#4a9eff', done:'#2dcc9f' };
                    const borderColor = mc || pc;
                    return (
                      <div key={item.id} style={{
                        borderRadius:5, fontSize:10, lineHeight:1.3,
                        background: item.status==='done' ? '#2dcc9f06' : mc ? mc+'08' : 'var(--bg)',
                        borderLeft:`3px solid ${borderColor}`,
                        border:`1px solid ${mc?mc+'30':'transparent'}`,
                        borderLeftWidth:3, borderLeftColor:borderColor,
                        opacity: item.status==='done' ? 0.6 : 1,
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
                            <button onClick={() => onToggle(item)}
                              style={{ width:16, height:16, borderRadius:4, flexShrink:0, border:`2px solid ${sc[item.status]}`, background: item.status==='done'?sc.done:item.status==='in_progress'?sc.in_progress+'30':'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:item.status==='done'?'#fff':sc[item.status], fontSize:9, fontWeight:700, padding:0 }}>
                              {item.status==='done'?'✓':item.status==='in_progress'?'◉':''}
                            </button>
                            <span style={{ fontWeight:600, color:item.status==='done'?'var(--t2)':'var(--t1)', textDecoration:item.status==='done'?'line-through':'none', flex:1 }}>{item.process}</span>
                          </div>
                          {item.project_id && <div style={{ color:pc, fontSize:8, fontWeight:600 }}>{projectMap[item.project_id]||''}</div>}
                          {item.area_id && <div style={{ color:'var(--t2)', fontSize:8 }}>📐 {areaMap[item.area_id]||'Área'}</div>}
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
