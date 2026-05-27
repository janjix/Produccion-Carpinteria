import { useState, useRef, useMemo } from 'react';
import { Btn, Modal, InputField, Badge, EmptyState } from './UI.jsx';
import { STAGES, PLANNING_STATUSES, AUTO_PLANNING_PROCESSES, PROJECT_COLORS, MATERIAL_COLORS, STAGE_ORDER } from '../lib/constants.js';
import {
  usePlanningTasks, useStaff,
  createPlanningTask, createPlanningTasksBulk,
  updatePlanningTask, reorderPlanningTasks,
  deletePlanningTask, deleteCompletedPlanningTasks,
  getAreaMaterialsForArea, updateArea,
  syncTaskToWeeklyPlan, syncStatusToWeeklyItems,
  propagateNextProcesses, getAllPlanningTasks, logActivity,
} from '../hooks/useSupabase.js';

// Stable color per material name
function getMaterialColor(materialName, allMaterials) {
  const names = [...new Set(allMaterials.filter(Boolean))].sort();
  const idx = names.indexOf(materialName);
  return MATERIAL_COLORS[idx >= 0 ? idx % MATERIAL_COLORS.length : 0];
}

export default function Planning({ projects, allAreas, userName }) {
  const { data: tasks } = usePlanningTasks();
  const { data: staffList } = useStaff();
  const [showModal, setShowModal] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterProject, setFilterProject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [autoForm, setAutoForm] = useState({ project_id: '', area_id: '' });
  const [autoLoading, setAutoLoading] = useState(false);
  const [form, setForm] = useState({ project_id:'', area_id:'', title:'', description:'', stage:'', status:'pending', material:'' });

  const projectColorMap = useMemo(() => {
    const m = {}; projects.forEach((p,i) => { m[p.id] = PROJECT_COLORS[i % PROJECT_COLORS.length]; }); return m;
  }, [projects]);
  const projectMap = useMemo(() => { const m = {}; projects.forEach((p) => { m[p.id] = p.name; }); return m; }, [projects]);
  const areaMap = useMemo(() => { const m = {}; allAreas.forEach((a) => { m[a.id] = a.name; }); return m; }, [allAreas]);

  // All unique material names for color assignment
  const allMaterialNames = useMemo(() => tasks.map((t) => t.material).filter(Boolean), [tasks]);

  const filtered = useMemo(() => {
    const projectPriorityMap = {};
    projects.forEach((p) => { projectPriorityMap[p.id] = p.priority || 0; });
    return tasks
      .filter((t) => {
        if (filterProject !== 'all' && t.project_id !== filterProject) return false;
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by project PRIORITY, then area, then stage order, then material
        const ap = projectPriorityMap[a.project_id] ?? 999;
        const bp = projectPriorityMap[b.project_id] ?? 999;
        if (ap !== bp) return ap - bp;
        if (a.area_id !== b.area_id) return (a.area_id || '').localeCompare(b.area_id || '');
        const ao = STAGE_ORDER[a.stage] ?? 99;
        const bo = STAGE_ORDER[b.stage] ?? 99;
        if (ao !== bo) return ao - bo;
        return (a.material || '').localeCompare(b.material || '');
      });
  }, [tasks, filterProject, filterStatus, projects]);

  async function autoGenerate() {
    if (!autoForm.project_id || !autoForm.area_id) return;
    setAutoLoading(true);
    const area = allAreas.find((a) => a.id === autoForm.area_id);
    const project = projects.find((p) => p.id === autoForm.project_id);
    if (!area || !project) { setAutoLoading(false); return; }
    try {
      const materials = await getAreaMaterialsForArea(autoForm.area_id);
      const existing = tasks.filter((t) => t.area_id === autoForm.area_id);
      const newTasks = [];
      let priority = tasks.length;

      for (const proc of AUTO_PLANNING_PROCESSES) {
        if (proc.perMaterial) {
          // Requires material — skip if no materials defined
          if (materials.length === 0) continue;
          for (const mat of materials) {
            const exists = existing.some((t) => t.stage === proc.id && t.material === mat.name);
            if (!exists) {
              newTasks.push({
                project_id: autoForm.project_id, area_id: autoForm.area_id,
                title: `${proc.label} — ${area.name} (${mat.name})`,
                stage: proc.id, status: 'pending', priority: priority++,
                material: mat.name, description: '',
              });
            }
          }
        } else {
          const exists = existing.some((t) => t.stage === proc.id && !t.material);
          if (!exists) {
            newTasks.push({
              project_id: autoForm.project_id, area_id: autoForm.area_id,
              title: `${proc.label} — ${area.name}`,
              stage: proc.id, status: 'pending', priority: priority++,
              material: '', description: '',
            });
          }
        }
      }

      if (newTasks.length === 0) {
        alert(materials.length === 0
          ? 'Primero agrega materiales al área. Optimización, Corte, Canteado y Mecanizado requieren material.'
          : 'Ya existen todas las tareas para esta área.');
      } else {
        const inserted = await createPlanningTasksBulk(newTasks);
        // Sync each to responsible staff's weekly plan
        for (const t of inserted || newTasks) {
          syncTaskToWeeklyPlan(t, staffList);
        }
        await logActivity({ project_id: autoForm.project_id, area_id: autoForm.area_id, action: 'tasks_auto_generated', description: `${newTasks.length} procesos generados para ${area.name} (${project.name})`, user_name: userName });
      }
      setShowAutoModal(false);
    } catch (e) { alert('Error: ' + e.message); }
    setAutoLoading(false);
  }

  function openNew() { setEditing(null); setForm({ project_id: projects[0]?.id||'', area_id:'', title:'', description:'', stage:'', status:'pending', material:'' }); setShowModal(true); }
  function openEdit(t) { setEditing(t); setForm({ project_id:t.project_id||'', area_id:t.area_id||'', title:t.title, description:t.description||'', stage:t.stage||'', status:t.status, material:t.material||'' }); setShowModal(true); }

  async function save() {
    if (!form.title.trim()) return;
    try {
      if (editing) {
        await updatePlanningTask(editing.id, { ...form, area_id: form.area_id||null });
      } else {
        const created = await createPlanningTask({ ...form, area_id: form.area_id||null, priority: tasks.length });
        // Also push to responsible staff's weekly plan
        if (created.stage && created.project_id) {
          syncTaskToWeeklyPlan(created, staffList);
        }
      }
      setShowModal(false);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function cycleStatus(task) {
    const order = ['pending','in_progress','done'];
    const next = order[(order.indexOf(task.status)+1) % order.length];
    updatePlanningTask(task.id, { status: next }); // fire-and-forget
    // Mirror to weekly_plan_items so person's view stays in sync
    syncStatusToWeeklyItems(task, next);
    if (next === 'done' && task.stage && task.project_id) {
      (async () => {
        try {
          const areaName = allAreas.find((a) => a.id === task.area_id)?.name || '';
          const allTasks = await getAllPlanningTasks();
          await propagateNextProcesses({ ...task, _area_name: areaName }, allTasks, staffList);
        } catch (e) { console.error(e); }
      })();
    }
  }

  // Auto-mark task done when all its mecanizados are completed
  async function cycleToDoneIfNotAlready(task) {
    if (task.status === 'done') return;
    updatePlanningTask(task.id, { status: 'done' });
    if (task.stage && task.project_id) {
      try {
        const areaName = allAreas.find((a) => a.id === task.area_id)?.name || '';
        const allTasks = await getAllPlanningTasks();
        await propagateNextProcesses({ ...task, _area_name: areaName }, allTasks, staffList);
      } catch (e) { console.error(e); }
    }
  }

  async function handleDelete(t) { if (!confirm(`¿Eliminar "${t.title}"?`)) return; await deletePlanningTask(t.id); }

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const areasForAutoProject = allAreas.filter((a) => a.project_id === autoForm.project_id);
  const areasForFormProject = allAreas.filter((a) => a.project_id === form.project_id);
  const ss = { width:'100%', padding:'8px 12px', borderRadius:6, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--t1)', fontSize:13, fontFamily:'inherit' };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:8 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:'var(--t1)', letterSpacing:'-0.03em' }}>Planificación</h2>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--t2)' }}>Ordenado por proyecto → área → proceso. Optimización, Corte, Canteado y Mecanizado requieren material.</p>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {doneCount > 0 && <Btn variant="ghost" onClick={async () => { if (!confirm(`¿Eliminar ${doneCount} tareas completadas?`)) return; await deleteCompletedPlanningTasks(); }}>🗑 Limpiar {doneCount} completadas</Btn>}
          <Btn variant="secondary" onClick={() => { setAutoForm({ project_id: projects[0]?.id||'', area_id:'' }); setShowAutoModal(true); }}>⚡ Auto-generar</Btn>
          <Btn onClick={openNew}>+ Manual</Btn>
        </div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ ...ss, width:'auto' }}>
          <option value="all">Todos los proyectos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ display:'flex', gap:4 }}>
          <FilterBtn active={filterStatus==='all'} onClick={() => setFilterStatus('all')} color="var(--t2)">Todas</FilterBtn>
          {PLANNING_STATUSES.map((s) => <FilterBtn key={s.id} active={filterStatus===s.id} onClick={() => setFilterStatus(s.id)} color={s.color}>{s.label}</FilterBtn>)}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="📅" title="Sin tareas" description="Agrega materiales a las áreas y usa Auto-generar." action={<Btn onClick={() => { setAutoForm({ project_id: projects[0]?.id||'', area_id:'' }); setShowAutoModal(true); }}>⚡ Auto-generar</Btn>} />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          {filtered.map((t) => {
            const statusInfo = PLANNING_STATUSES.find((s) => s.id === t.status) || PLANNING_STATUSES[0];
            const stageInfo = t.stage ? STAGES.find((s) => s.id === t.stage) : null;
            const projColor = t.project_id ? projectColorMap[t.project_id]||'#7a8599' : '#7a8599';
            const matColor = t.material ? getMaterialColor(t.material, allMaterialNames) : null;
            return (
              <div key={t.id} style={{
                background:'var(--surface)', borderRadius:8,
                border:`1px solid ${t.material ? matColor+'30' : 'var(--border)'}`,
                borderLeft:`4px solid ${t.material ? matColor : projColor}`,
                overflow:'hidden',
              }}>
                {/* MATERIAL BANNER — prominent at top for material-based processes */}
                {t.material && (
                  <div style={{
                    background: matColor+'15',
                    borderBottom: `1px solid ${matColor}30`,
                    padding: '6px 14px',
                    display:'flex', alignItems:'center', gap:8,
                  }}>
                    <span style={{ fontSize:14 }}>🪵</span>
                    <span style={{
                      fontSize:13, fontWeight:800, color: matColor,
                      letterSpacing:'0.02em', textTransform:'uppercase',
                    }}>{t.material}</span>
                    {stageInfo && (
                      <span style={{ fontSize:10, color:matColor, opacity:0.7, marginLeft:'auto', fontWeight:600 }}>
                        a {stageInfo.label.toLowerCase()}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 14px', opacity: t.status==='blocked' ? 0.55 : 1 }}>
                  <button onClick={() => t.status==='blocked' ? alert('Esta tarea está bloqueada hasta que se complete el proceso anterior.') : cycleStatus(t)}
                    style={{
                      width:28, height:28, borderRadius:7, flexShrink:0,
                      border:`2px solid ${statusInfo.color}`,
                      background: t.status==='done' ? statusInfo.color : t.status==='in_progress' ? statusInfo.color+'25' : t.status==='blocked' ? 'var(--bg)' : 'transparent',
                      cursor: t.status==='blocked' ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                      color: t.status==='done' ? '#fff' : statusInfo.color, fontSize:14, fontWeight:700,
                    }}>
                    {t.status==='done' ? '✓' : t.status==='in_progress' ? '◉' : t.status==='blocked' ? '🔒' : '○'}
                  </button>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:13, color: t.status==='done' ? 'var(--t2)' : 'var(--t1)', textDecoration: t.status==='done' ? 'line-through' : 'none' }}>{t.title}</span>
                      {stageInfo && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background: stageInfo.color+'15', color: stageInfo.color, fontWeight:600 }}>{stageInfo.icon} {stageInfo.label}</span>}
                    </div>
                    <div style={{ display:'flex', gap:8, fontSize:11, color:'var(--t2)', flexWrap:'wrap', alignItems:'center' }}>
                      {t.project_id && <span style={{ color:projColor, fontWeight:600 }}>📋 {projectMap[t.project_id]||''}</span>}
                      {t.area_id && <span>📐 {areaMap[t.area_id]||'Área'}</span>}
                    </div>
                    {t.description && <div style={{ fontSize:11, color:'var(--t2)', marginTop:2 }}>{t.description}</div>}
                    {/* MECANIZADO CHECKLIST */}
                    {t.stage === 'mecanizado' && t.area_id && (
                      <MecanizadoChecklist area={allAreas.find((a) => a.id === t.area_id)} taskId={t.id} onAllDone={() => cycleToDoneIfNotAlready(t)} />
                    )}
                  </div>
                  <div style={{ display:'flex', gap:2 }}>
                    <Btn variant="ghost" size="xs" onClick={() => openEdit(t)}>✎</Btn>
                    <Btn variant="ghost" size="xs" onClick={() => handleDelete(t)}>🗑</Btn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Auto-generate modal */}
      <Modal open={showAutoModal} onClose={() => setShowAutoModal(false)} title="Auto-generar procesos" width={440}>
        <p style={{ fontSize:13, color:'var(--t2)', marginBottom:16, lineHeight:1.5 }}>
          Genera Modelado y Planos (sin material) + Optimización, Corte, Canteado y Mecanizado por cada material del área.<br/>
          <strong style={{ color:'#e6a23c' }}>Agrega los materiales al área antes de generar.</strong>
        </p>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Proyecto</label>
          <select value={autoForm.project_id} onChange={(e) => setAutoForm({ project_id:e.target.value, area_id:'' })} style={ss}>
            <option value="">Selecciona</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Área</label>
          <select value={autoForm.area_id} onChange={(e) => setAutoForm({ ...autoForm, area_id:e.target.value })} style={ss}>
            <option value="">Selecciona</option>
            {areasForAutoProject.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
          <Btn variant="secondary" onClick={() => setShowAutoModal(false)}>Cancelar</Btn>
          <Btn onClick={autoGenerate} disabled={!autoForm.project_id||!autoForm.area_id||autoLoading}>{autoLoading?'Generando...':'⚡ Generar'}</Btn>
        </div>
      </Modal>

      {/* Manual modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing?'Editar tarea':'Nueva tarea'} width={500}>
        <InputField label="Título" value={form.title} onChange={(v) => setForm({...form,title:v})} placeholder="Ej: Corte especial..." />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ marginBottom:14 }}><label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Proyecto</label><select value={form.project_id} onChange={(e) => setForm({...form,project_id:e.target.value,area_id:''})} style={ss}><option value="">Sin proyecto</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div style={{ marginBottom:14 }}><label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Área</label><select value={form.area_id} onChange={(e) => setForm({...form,area_id:e.target.value})} style={ss}><option value="">Sin área</option>{areasForFormProject.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ marginBottom:14 }}><label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Proceso</label><select value={form.stage} onChange={(e) => setForm({...form,stage:e.target.value})} style={ss}><option value="">General</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}</select></div>
          <div style={{ marginBottom:14 }}><label style={{ display:'block', marginBottom:4, fontSize:12, fontWeight:600, color:'var(--t2)' }}>Estado</label><select value={form.status} onChange={(e) => setForm({...form,status:e.target.value})} style={ss}>{PLANNING_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        </div>
        <InputField label="🪵 Material (requerido para Optimización, Corte, Canteado, Mecanizado)" value={form.material} onChange={(v) => setForm({...form,material:v})} placeholder="Ej: MDF 18mm blanco" />
        <InputField label="Notas" value={form.description} onChange={(v) => setForm({...form,description:v})} placeholder="Observaciones..." textarea />
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
          <Btn variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Btn>
          <Btn onClick={save} disabled={!form.title.trim()}>{editing?'Guardar':'Crear'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

function FilterBtn({ children, active, onClick, color }) {
  return <button onClick={onClick} style={{ padding:'5px 10px', borderRadius:6, border: active ? `1.5px solid ${color}` : '1.5px solid var(--border)', background: active ? color+'15' : 'transparent', color: active ? color : 'var(--t2)', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>{children}</button>;
}

// ─── Mecanizado checklist: shows enabled mecanizados for the area with done state ───
export function MecanizadoChecklist({ area, taskId, onAllDone }) {
  if (!area) return null;
  const enabled = area.mecanizados_enabled || [];
  const completed = area.mecanizados_completed || [];
  if (enabled.length === 0) {
    return (
      <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 5, background: 'var(--bg)', border: '1px dashed #f06060', fontSize: 11, color: '#f06060' }}>
        ⚠️ Sin mecanizados configurados. Edita el área en Proyectos para indicar cuáles aplican.
      </div>
    );
  }

  async function toggle(mec) {
    const newList = completed.includes(mec) ? completed.filter((m) => m !== mec) : [...completed, mec];
    await updateArea(area.id, { mecanizados_completed: newList });
    // If all enabled are now completed, mark task as done
    const allDone = enabled.every((m) => newList.includes(m));
    if (allDone && onAllDone) onAllDone();
  }

  const allDone = enabled.length > 0 && enabled.every((m) => completed.includes(m));
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, background: 'var(--bg)', border: '1px solid #4a9eff30' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#4a9eff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
        ⚙️ Mecanizados a realizar ({completed.filter((m) => enabled.includes(m)).length}/{enabled.length})
        {allDone && <span style={{ color: '#2dcc9f', marginLeft: 6 }}>✓ Todos listos</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {enabled.map((mec) => {
          const done = completed.includes(mec);
          return (
            <button key={mec} onClick={() => toggle(mec)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                border: `1.5px solid ${done ? '#2dcc9f' : '#4a9eff40'}`,
                background: done ? '#2dcc9f15' : 'var(--surface)',
                color: done ? '#2dcc9f' : '#4a9eff',
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: done ? 'line-through' : 'none',
              }}>
              <span style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                border: `2px solid ${done ? '#2dcc9f' : '#4a9eff80'}`,
                background: done ? '#2dcc9f' : 'transparent',
                color: '#fff', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{done && '✓'}</span>
              {mec}
            </button>
          );
        })}
      </div>
    </div>
  );
}
