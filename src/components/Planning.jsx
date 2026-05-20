import { useState } from 'react';
import { Btn, Modal, InputField, Badge, EmptyState } from './UI.jsx';
import { STAGES, PLANNING_STATUSES } from '../lib/constants.js';
import { usePlanningTasks, createPlanningTask, updatePlanningTask, deletePlanningTask, logActivity } from '../hooks/useSupabase.js';

export default function Planning({ projects, allAreas, userName }) {
  const { data: tasks } = usePlanningTasks();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    project_id: '',
    area_id: '',
    title: '',
    description: '',
    stage: '',
    status: 'pending',
    priority: 0,
    depends_on: '',
    start_date: '',
    due_date: '',
    assigned_to: '',
  });

  function openNew() {
    setEditing(null);
    setForm({
      project_id: projects[0]?.id || '',
      area_id: '',
      title: '',
      description: '',
      stage: '',
      status: 'pending',
      priority: tasks.length,
      depends_on: '',
      start_date: '',
      due_date: '',
      assigned_to: '',
    });
    setShowModal(true);
  }

  function openEdit(t) {
    setEditing(t);
    setForm({
      project_id: t.project_id || '',
      area_id: t.area_id || '',
      title: t.title,
      description: t.description || '',
      stage: t.stage || '',
      status: t.status,
      priority: t.priority,
      depends_on: t.depends_on || '',
      start_date: t.start_date || '',
      due_date: t.due_date || '',
      assigned_to: t.assigned_to || '',
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.title.trim()) return;
    const payload = {
      ...form,
      area_id: form.area_id || null,
      depends_on: form.depends_on || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
    };
    try {
      if (editing) {
        await updatePlanningTask(editing.id, payload);
      } else {
        await createPlanningTask(payload);
        await logActivity({
          project_id: form.project_id,
          area_id: form.area_id || null,
          action: 'task_created',
          description: `Tarea de planificación creada: "${form.title}"`,
          user_name: userName,
        });
      }
      setShowModal(false);
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  async function toggleStatus(task) {
    const order = ['pending', 'in_progress', 'done'];
    const idx = order.indexOf(task.status);
    const next = order[(idx + 1) % order.length];
    await updatePlanningTask(task.id, { status: next });
    await logActivity({
      project_id: task.project_id,
      action: 'task_status_changed',
      description: `Tarea "${task.title}" → ${PLANNING_STATUSES.find(s => s.id === next)?.label}`,
      user_name: userName,
    });
  }

  async function handleDelete(t) {
    if (!confirm(`¿Eliminar tarea "${t.title}"?`)) return;
    await deletePlanningTask(t.id);
  }

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  const projectMap = {};
  projects.forEach((p) => { projectMap[p.id] = p.name; });

  const areaMap = {};
  allAreas.forEach((a) => { areaMap[a.id] = a.name; });

  const areasForProject = allAreas.filter((a) => a.project_id === form.project_id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>Planificación</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t2)' }}>
            Organiza el orden de trabajo entre proyectos
          </p>
        </div>
        <Btn onClick={openNew}>+ Nueva tarea</Btn>
      </div>

      {/* Status filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} color="var(--t2)">Todas ({tasks.length})</FilterBtn>
        {PLANNING_STATUSES.map((s) => {
          const count = tasks.filter((t) => t.status === s.id).length;
          return (
            <FilterBtn key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)} color={s.color}>
              {s.label} ({count})
            </FilterBtn>
          );
        })}
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState
          icon="📅"
          title="Sin tareas"
          description="Crea tareas para organizar qué trabajo va primero entre todos los proyectos."
          action={<Btn onClick={openNew}>Crear tarea</Btn>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTasks.map((t) => {
            const statusInfo = PLANNING_STATUSES.find((s) => s.id === t.status) || PLANNING_STATUSES[0];
            const depTask = t.depends_on ? tasks.find((x) => x.id === t.depends_on) : null;
            return (
              <div key={t.id} style={{
                background: 'var(--surface)',
                borderRadius: 10,
                border: `1px solid ${t.status === 'blocked' ? '#f0606040' : 'var(--border)'}`,
                padding: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span
                        onClick={() => toggleStatus(t)}
                        style={{
                          cursor: 'pointer',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: statusInfo.color + '18',
                          color: statusInfo.color,
                        }}
                      >
                        {statusInfo.label}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{t.title}</span>
                      {t.stage && <Badge color={STAGES.find((s) => s.id === t.stage)?.color || '#7a8599'}>{STAGES.find((s) => s.id === t.stage)?.label || t.stage}</Badge>}
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--t2)', flexWrap: 'wrap' }}>
                      {t.project_id && <span>📋 {projectMap[t.project_id] || 'Proyecto'}</span>}
                      {t.area_id && <span>📐 {areaMap[t.area_id] || 'Área'}</span>}
                      {t.assigned_to && <span>👤 {t.assigned_to}</span>}
                      {t.start_date && <span>🗓 {t.start_date}</span>}
                      {t.due_date && <span>⏰ {t.due_date}</span>}
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>{t.description}</div>
                    )}
                    {depTask && (
                      <div style={{ fontSize: 11, color: '#f0a040', marginTop: 4 }}>
                        ⛓ Depende de: {depTask.title}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
                    <Btn variant="ghost" size="xs" onClick={() => openEdit(t)}>✎</Btn>
                    <Btn variant="ghost" size="xs" onClick={() => handleDelete(t)}>🗑</Btn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar tarea' : 'Nueva tarea'} width={560}>
        <InputField label="Título" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="¿Qué hay que hacer?" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Proyecto</label>
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value, area_id: '' })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Sin proyecto</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Área</label>
            <select
              value={form.area_id}
              onChange={(e) => setForm({ ...form, area_id: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Sin área</option>
              {areasForProject.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Etapa</label>
            <select
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">General</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Estado</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}
            >
              {PLANNING_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <InputField label="Fecha inicio" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
          <InputField label="Fecha límite" type="date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
        </div>

        <InputField label="Asignado a" value={form.assigned_to} onChange={(v) => setForm({ ...form, assigned_to: v })} placeholder="Nombre del responsable" />

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Depende de</label>
          <select
            value={form.depends_on}
            onChange={(e) => setForm({ ...form, depends_on: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}
          >
            <option value="">Sin dependencia</option>
            {tasks.filter((t) => !editing || t.id !== editing.id).map((t) => (
              <option key={t.id} value={t.id}>{t.title} ({projectMap[t.project_id] || 'Sin proyecto'})</option>
            ))}
          </select>
        </div>

        <InputField label="Descripción" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Detalles adicionales..." textarea />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Btn>
          <Btn onClick={save} disabled={!form.title.trim()}>{editing ? 'Guardar' : 'Crear'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

function FilterBtn({ children, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: active ? `1.5px solid ${color}` : '1.5px solid var(--border)',
        background: active ? color + '15' : 'transparent',
        color: active ? color : 'var(--t2)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
