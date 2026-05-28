import { useState } from 'react';
import { Btn, Modal, InputField, ProgressBar, Badge, EmptyState } from './UI.jsx';
import { STAGES } from '../lib/constants.js';
import { createProject, updateProject, deleteProject, logActivity } from '../hooks/useSupabase.js';

function getProjectProgress(areas) {
  if (!areas || areas.length === 0) return 0;
  let total = 0;
  let completed = 0;
  areas.forEach((area) => {
    STAGES.forEach((s) => {
      total++;
      if (area[`stage_${s.id}`]) completed++;
    });
  });
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

export default function ProjectsList({ projects, allAreas, onSelect, userName }) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', client: '', notes: '' });

  function openNew() {
    setEditing(null);
    setForm({ name: '', client: '', notes: '' });
    setShowModal(true);
  }

  function openEdit(proj) {
    setEditing(proj);
    setForm({ name: proj.name, client: proj.client || '', notes: proj.notes || '' });
    setShowModal(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    try {
      if (editing) {
        await updateProject(editing.id, { name: form.name, client: form.client, notes: form.notes });
      } else {
        const p = await createProject({ name: form.name, client: form.client, notes: form.notes, priority: projects.length });
        await logActivity({
          project_id: p.id,
          action: 'project_created',
          description: `Proyecto "${form.name}" creado`,
          user_name: userName,
        });
      }
      setShowModal(false);
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`¿Eliminar "${name}" y todas sus áreas?`)) return;
    await deleteProject(id);
  }

  async function move(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= projects.length) return;
    const a = projects[idx];
    const b = projects[target];
    await updateProject(a.id, { priority: target });
    await updateProject(b.id, { priority: idx });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>Proyectos</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t2)' }}>
            {projects.length} proyecto{projects.length !== 1 ? 's' : ''} activo{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Btn onClick={openNew}>+ Nuevo proyecto</Btn>
      </div>

      {projects.length === 0 ? (
        <EmptyState icon="📋" title="Sin proyectos" description="Crea tu primer proyecto para empezar." action={<Btn onClick={openNew}>Crear proyecto</Btn>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.map((proj, idx) => {
            const projAreas = allAreas.filter((a) => a.project_id === proj.id);
            const progress = getProjectProgress(projAreas);
            return (
              <div
                key={proj.id}
                onClick={() => onSelect(proj.id)}
                style={{
                  background: 'var(--surface)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ background: 'var(--hover)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>
                        #{idx + 1}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{proj.name}</span>
                      {progress === 100 && <Badge color="#2dcc9f">Completado</Badge>}
                    </div>
                    {proj.client && <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6 }}>Cliente: {proj.client}</div>}
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--t2)', marginBottom: 8 }}>
                      <span>{projAreas.length} área{projAreas.length !== 1 ? 's' : ''}</span>
                    </div>
                    <ProgressBar value={progress} showLabel height={5} />
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginLeft: 12 }} onClick={(e) => e.stopPropagation()}>
                    <Btn variant="ghost" size="xs" onClick={() => move(idx, -1)} disabled={idx === 0}>▲</Btn>
                    <Btn variant="ghost" size="xs" onClick={() => move(idx, 1)} disabled={idx === projects.length - 1}>▼</Btn>
                    <Btn variant="ghost" size="xs" onClick={() => openEdit(proj)}>✎</Btn>
                    <Btn variant="ghost" size="xs" onClick={() => handleDelete(proj.id, proj.name)}>🗑</Btn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar proyecto' : 'Nuevo proyecto'}>
        <InputField label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ej: Cocina Rodríguez" />
        <InputField label="Cliente" value={form.client} onChange={(v) => setForm({ ...form, client: v })} placeholder="Nombre del cliente" />
        <InputField label="Notas" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Observaciones" textarea />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Btn>
          <Btn onClick={save} disabled={!form.name.trim()}>{editing ? 'Guardar' : 'Crear'}</Btn>
        </div>
      </Modal>
    </div>
  );
}
