import { useState, useRef } from 'react';
import { Btn, Modal, InputField, Badge, EmptyState } from './UI.jsx';
import { STAGES, PLANNING_STATUSES, AUTO_PLANNING_PROCESSES, PROJECT_COLORS, MECANIZADO_OPTIONS } from '../lib/constants.js';
import {
  usePlanningTasks,
  useStaff,
  createPlanningTask,
  createPlanningTasksBulk,
  updatePlanningTask,
  reorderPlanningTasks,
  deletePlanningTask,
  getAreaMaterialsForArea,
  propagateNextProcesses,
  getAllPlanningTasks,
  logActivity,
} from '../hooks/useSupabase.js';

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
  const [form, setForm] = useState({ project_id: '', area_id: '', title: '', description: '', stage: '', status: 'pending', material: '' });
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const projectColorMap = {};
  projects.forEach((p, i) => { projectColorMap[p.id] = PROJECT_COLORS[i % PROJECT_COLORS.length]; });
  const projectMap = {};
  projects.forEach((p) => { projectMap[p.id] = p.name; });
  const areaMap = {};
  allAreas.forEach((a) => { areaMap[a.id] = a.name; });

  const filtered = tasks.filter((t) => {
    if (filterProject !== 'all' && t.project_id !== filterProject) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

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

      AUTO_PLANNING_PROCESSES.forEach((proc) => {
        if (proc.perMaterial && materials.length > 0) {
          materials.forEach((mat) => {
            const exists = existing.some((t) => t.stage === proc.id && t.material === mat.name);
            if (!exists) {
              newTasks.push({ project_id: autoForm.project_id, area_id: autoForm.area_id, title: `${proc.label} — ${area.name} (${mat.name})`, stage: proc.id, status: 'pending', priority: priority++, material: mat.name, description: '' });
            }
          });
        } else {
          const exists = existing.some((t) => t.stage === proc.id && !t.material);
          if (!exists) {
            newTasks.push({ project_id: autoForm.project_id, area_id: autoForm.area_id, title: `${proc.label} — ${area.name}`, stage: proc.id, status: 'pending', priority: priority++, material: '', description: '' });
          }
        }
      });

      if (newTasks.length === 0) { alert('Ya existen tareas para todos los procesos/materiales de esta área.'); }
      else {
        await createPlanningTasksBulk(newTasks);
        await logActivity({ project_id: autoForm.project_id, area_id: autoForm.area_id, action: 'tasks_auto_generated', description: `${newTasks.length} procesos generados para ${area.name} (${project.name})`, user_name: userName });
      }
      setShowAutoModal(false);
    } catch (e) { alert('Error: ' + e.message); }
    setAutoLoading(false);
  }

  function openNew() { setEditing(null); setForm({ project_id: projects[0]?.id || '', area_id: '', title: '', description: '', stage: '', status: 'pending', material: '' }); setShowModal(true); }
  function openEdit(t) { setEditing(t); setForm({ project_id: t.project_id || '', area_id: t.area_id || '', title: t.title, description: t.description || '', stage: t.stage || '', status: t.status, material: t.material || '' }); setShowModal(true); }

  async function save() {
    if (!form.title.trim()) return;
    const payload = { ...form, area_id: form.area_id || null, priority: editing ? editing.priority : tasks.length };
    try {
      if (editing) { await updatePlanningTask(editing.id, payload); }
      else { await createPlanningTask(payload); await logActivity({ project_id: form.project_id, area_id: form.area_id || null, action: 'task_created', description: `Tarea creada: "${form.title}"`, user_name: userName }); }
      setShowModal(false);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function cycleStatus(task) {
    const order = ['pending', 'in_progress', 'done'];
    const idx = order.indexOf(task.status);
    const next = order[(idx + 1) % order.length];
    // Optimistic: update immediately, sync in background
    updatePlanningTask(task.id, { status: next });
    logActivity({ project_id: task.project_id, action: 'task_status_changed', description: `"${task.title}" → ${PLANNING_STATUSES.find((s) => s.id === next)?.label}`, user_name: userName });
    // Background sync: propagate successors when done
    if (next === 'done' && task.stage && task.project_id) {
      (async () => {
        try {
          const areaName = allAreas.find((a) => a.id === task.area_id)?.name || '';
          const enrichedTask = { ...task, _area_name: areaName };
          const allTasks = await getAllPlanningTasks();
          const created = await propagateNextProcesses(enrichedTask, allTasks, staffList);
          if (created.length > 0) {
            logActivity({ project_id: task.project_id, action: 'auto_propagated', description: `${created.length} proceso(s) creado(s) tras completar "${task.title}"`, user_name: 'Sistema' });
          }
        } catch (e) { console.error('Propagation error:', e); }
      })();
    }
  }

  async function handleDelete(t) { if (!confirm(`¿Eliminar "${t.title}"?`)) return; await deletePlanningTask(t.id); }
  function handleDragStart(idx) { dragItem.current = idx; }
  function handleDragEnter(idx) { dragOver.current = idx; }
  async function handleDragEnd() {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return;
    const reordered = [...filtered]; const [removed] = reordered.splice(dragItem.current, 1); reordered.splice(dragOver.current, 0, removed);
    dragItem.current = null; dragOver.current = null;
    try { await reorderPlanningTasks(reordered.map((t) => t.id)); } catch (e) { console.error(e); }
  }
  async function moveTask(idx, dir) {
    const target = idx + dir; if (target < 0 || target >= filtered.length) return;
    const reordered = [...filtered]; [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    try { await reorderPlanningTasks(reordered.map((t) => t.id)); } catch (e) { console.error(e); }
  }

  const areasForAutoProject = allAreas.filter((a) => a.project_id === autoForm.project_id);
  const areasForFormProject = allAreas.filter((a) => a.project_id === form.project_id);
  const ss = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>Planificación</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t2)' }}>Agrega materiales en cada área antes de auto-generar.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="secondary" onClick={() => { setAutoForm({ project_id: projects[0]?.id || '', area_id: '' }); setShowAutoModal(true); }}>⚡ Auto-generar</Btn>
          <Btn onClick={openNew}>+ Tarea manual</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ ...ss, width: 'auto' }}>
          <option value="all">Todos los proyectos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          <FilterBtn active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} color="var(--t2)">Todas</FilterBtn>
          {PLANNING_STATUSES.map((s) => <FilterBtn key={s.id} active={filterStatus === s.id} onClick={() => setFilterStatus(s.id)} color={s.color}>{s.label}</FilterBtn>)}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="📅" title="Sin tareas" description="Agrega materiales a tus áreas y usa 'Auto-generar'." action={<Btn onClick={() => { setAutoForm({ project_id: projects[0]?.id || '', area_id: '' }); setShowAutoModal(true); }}>⚡ Auto-generar</Btn>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map((t, idx) => {
            const statusInfo = PLANNING_STATUSES.find((s) => s.id === t.status) || PLANNING_STATUSES[0];
            const stageInfo = t.stage ? STAGES.find((s) => s.id === t.stage) : null;
            const projColor = t.project_id ? projectColorMap[t.project_id] || '#7a8599' : '#7a8599';
            const mecInfo = t.stage === 'mecanizado' && t.description ? t.description : null;
            return (
              <div key={t.id} draggable onDragStart={() => handleDragStart(idx)} onDragEnter={() => handleDragEnter(idx)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
                style={{ background: 'var(--surface)', borderRadius: 8, borderLeft: `4px solid ${projColor}`, border: `1px solid ${t.status === 'blocked' ? '#f0606040' : 'var(--border)'}`, borderLeftWidth: 4, borderLeftColor: projColor, padding: '10px 14px', cursor: 'grab' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, paddingTop: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--t2)', cursor: 'pointer', userSelect: 'none' }} onClick={() => moveTask(idx, -1)}>▲</span>
                    <span style={{ fontSize: 14, color: 'var(--t2)', cursor: 'grab' }}>⠿</span>
                    <span style={{ fontSize: 10, color: 'var(--t2)', cursor: 'pointer', userSelect: 'none' }} onClick={() => moveTask(idx, 1)}>▼</span>
                  </div>
                  {/* Status toggle button */}
                  <button onClick={() => cycleStatus(t)} title={`Click para cambiar: ${statusInfo.label}`}
                    style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0, border: `2px solid ${statusInfo.color}`,
                      background: t.status === 'done' ? statusInfo.color : t.status === 'in_progress' ? statusInfo.color + '20' : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: t.status === 'done' ? '#fff' : statusInfo.color, fontSize: 14, fontWeight: 700, transition: 'all 0.15s',
                    }}>
                    {t.status === 'done' ? '✓' : t.status === 'in_progress' ? '◉' : '○'}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: t.status === 'done' ? 'var(--t2)' : 'var(--t1)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                      {stageInfo && <Badge color={stageInfo.color}>{stageInfo.icon} {stageInfo.label}</Badge>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--t2)', flexWrap: 'wrap' }}>
                      {t.project_id && <span style={{ color: projColor, fontWeight: 600 }}>📋 {projectMap[t.project_id] || ''}</span>}
                      {t.area_id && <span>📐 {areaMap[t.area_id] || ''}</span>}
                    </div>
                    {t.material && <div style={{ display: 'inline-block', background: '#e6a23c18', border: '1px solid #e6a23c30', borderRadius: 5, padding: '2px 8px', marginTop: 3, fontSize: 11, fontWeight: 700, color: '#e6a23c', letterSpacing: '0.01em' }}>🪵 {t.material}</div>}
                    {mecInfo && <div style={{ fontSize: 11, color: '#4a9eff', marginTop: 2 }}>⚙️ {mecInfo}</div>}
                    {t.description && t.stage !== 'mecanizado' && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{t.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <Btn variant="ghost" size="xs" onClick={() => openEdit(t)}>✎</Btn>
                    <Btn variant="ghost" size="xs" onClick={() => handleDelete(t)}>🗑</Btn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showAutoModal} onClose={() => setShowAutoModal(false)} title="Auto-generar procesos" width={440}>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16, lineHeight: 1.5 }}>Genera procesos para un área. Los procesos de material (Optimización, Corte, Canteado, Mecanizado) se crean por cada material del área.</p>
        <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Proyecto</label><select value={autoForm.project_id} onChange={(e) => setAutoForm({ project_id: e.target.value, area_id: '' })} style={ss}><option value="">Selecciona</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Área</label><select value={autoForm.area_id} onChange={(e) => setAutoForm({ ...autoForm, area_id: e.target.value })} style={ss}><option value="">Selecciona</option>{areasForAutoProject.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setShowAutoModal(false)}>Cancelar</Btn>
          <Btn onClick={autoGenerate} disabled={!autoForm.project_id || !autoForm.area_id || autoLoading}>{autoLoading ? 'Generando...' : '⚡ Generar'}</Btn>
        </div>
      </Modal>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar tarea' : 'Nueva tarea'} width={520}>
        <InputField label="Título" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Ej: Corte especial — Isla cocina" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Proyecto</label><select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value, area_id: '' })} style={ss}><option value="">Sin proyecto</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Área</label><select value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })} style={ss}><option value="">Sin área</option>{areasForFormProject.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Proceso</label><select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} style={ss}><option value="">General / Custom</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}</select></div>
          <div style={{ marginBottom: 14 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Estado</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={ss}>{PLANNING_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        </div>
        <InputField label="🪵 Material" value={form.material} onChange={(v) => setForm({ ...form, material: v })} placeholder="Ej: MDF 18mm blanco" />
        <InputField label="Notas / Mecanizado específico" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Ej: Bisagras + Tarugos + Excéntricas" textarea />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Btn>
          <Btn onClick={save} disabled={!form.title.trim()}>{editing ? 'Guardar' : 'Crear'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

function FilterBtn({ children, active, onClick, color }) {
  return (<button onClick={onClick} style={{ padding: '5px 10px', borderRadius: 6, border: active ? `1.5px solid ${color}` : '1.5px solid var(--border)', background: active ? color + '15' : 'transparent', color: active ? color : 'var(--t2)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>{children}</button>);
}
