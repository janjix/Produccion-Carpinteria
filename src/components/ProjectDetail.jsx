import { useState, useRef, useMemo } from 'react';
import { Btn, Modal, InputField, ProgressBar, Badge, EmptyState, TagSelector } from './UI.jsx';
import { STAGES, MECANIZADO_OPTIONS, READY_FOR_ASSEMBLY_STAGES, AREA_CHECKLIST_STAGES, MATERIAL_COLORS } from '../lib/constants.js';
import {
  useAreas, useFurniture, useAreaMaterials, useStaff,
  createArea, updateArea, deleteArea, updateAreaScheduledWeek,
  createFurniture, createAreaMaterial, deleteAreaMaterial, renameAreaMaterial,
  updateFurniture, deleteFurniture, uploadFurnitureImage, logActivity,
  generateAreaPipeline, getAllPlanningTasks, getAreaMaterialsForArea,
  cleanupMaterialessTasks,
} from '../hooks/useSupabase.js';

const checklistOrder = AREA_CHECKLIST_STAGES;

function getMaterialColor(name, allNames) {
  const sorted = [...new Set(allNames.filter(Boolean))].sort();
  const i = sorted.indexOf(name);
  return MATERIAL_COLORS[i >= 0 ? i % MATERIAL_COLORS.length : 0];
}

// Calculate stage status from planning tasks
function getStageStatus(planningTasks, projectId, areaId, stageId) {
  const tasks = planningTasks.filter((t) =>
    t.project_id === projectId && t.area_id === areaId && t.stage === stageId
  );
  if (tasks.length === 0) return 'none'; // no tasks for this stage
  if (tasks.every((t) => t.status === 'done')) return 'done';
  if (tasks.some((t) => t.status === 'in_progress')) return 'in_progress';
  return 'pending';
}

function getAreaProgress(planningTasks, projectId, areaId) {
  let total = 0, completed = 0;
  checklistOrder.forEach((sid) => {
    const status = getStageStatus(planningTasks, projectId, areaId, sid);
    if (status !== 'none') { total++; if (status === 'done') completed++; }
  });
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

export default function ProjectDetail({ project, onBack, userName, planningTasks = [] }) {
  const { data: areas } = useAreas(project.id);
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [showFurnitureModal, setShowFurnitureModal] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [editingFurniture, setEditingFurniture] = useState(null);
  const [areaForm, setAreaForm] = useState({ name: '', mecanizados: [] });
  const [furnitureForm, setFurnitureForm] = useState({ name: '', notes: '' });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const { data: staffList } = useStaff();
  const currentArea = areas.find((a) => a.id === selectedAreaId);
  const allMaterialNames = useMemo(() => planningTasks.map((t) => t.material).filter(Boolean), [planningTasks]);

  function openNewArea() {
    // Default: lunes de la semana que viene, ya que las planificaciones se hacen los sabados
    const d = new Date();
    const day = d.getDay();
    // Ir al lunes de la proxima semana
    const daysToNextMonday = day === 0 ? 1 : (8 - day);
    d.setDate(d.getDate() + daysToNextMonday);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setEditingArea(null);
    setAreaForm({ name: '', mecanizados: [], scheduled_week_start: `${y}-${m}-${dd}` });
    setShowAreaModal(true);
  }
  function openEditArea(area) { setEditingArea(area); setAreaForm({ name: area.name, mecanizados: area.mecanizados_enabled || [], scheduled_week_start: area.scheduled_week_start || '' }); setShowAreaModal(true); }
  async function saveArea() {
    if (!areaForm.name.trim()) return;
    try {
      // Ajustar la fecha al lunes de la semana elegida (para consistencia)
      const normalizeToMonday = (d) => {
        if (!d) return null;
        const dt = new Date(d + 'T00:00:00');
        const dow = dt.getDay();
        const diff = dow === 0 ? -6 : 1 - dow;
        dt.setDate(dt.getDate() + diff);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };
      const normalizedWeek = normalizeToMonday(areaForm.scheduled_week_start);

      if (editingArea) {
        await updateArea(editingArea.id, { name: areaForm.name, mecanizados_enabled: areaForm.mecanizados });
        // Si cambio la semana programada, propagar a las tareas
        if (normalizedWeek && normalizedWeek !== editingArea.scheduled_week_start) {
          await updateAreaScheduledWeek(editingArea.id, normalizedWeek);
          await logActivity({ project_id: project.id, area_id: editingArea.id, action: 'area_rescheduled', description: `Área "${areaForm.name}" reprogramada para semana del ${normalizedWeek}`, user_name: userName });
        }
      } else {
        const a = await createArea({ project_id: project.id, name: areaForm.name, mecanizados_enabled: areaForm.mecanizados, sort_order: areas.length, scheduled_week_start: normalizedWeek });
        await logActivity({ project_id: project.id, area_id: a.id, action: 'area_created', description: `Área "${areaForm.name}" creada en ${project.name}. Arranque: ${normalizedWeek || 'sin fecha'}`, user_name: userName });
        setSelectedAreaId(a.id);
        try {
          const existing = await getAllPlanningTasks();
          await generateAreaPipeline({ project, area: { ...a, scheduled_week_start: normalizedWeek }, materials: [], staffList, existingTasks: existing });
        } catch (e) { console.error('Pipeline gen on area create failed:', e); }
      }
      setShowAreaModal(false);
    } catch (e) { alert('Error: ' + e.message); }
  }
  async function handleDeleteArea(area) { if (!confirm(`¿Eliminar "${area.name}"?`)) return; await deleteArea(area.id); if (selectedAreaId === area.id) setSelectedAreaId(null); }
  function openNewFurniture() { setEditingFurniture(null); setFurnitureForm({ name: '', notes: '' }); setShowFurnitureModal(true); }
  function openEditFurniture(f) { setEditingFurniture(f); setFurnitureForm({ name: f.name, notes: f.notes || '' }); setShowFurnitureModal(true); }
  async function saveFurniture() {
    if (!furnitureForm.name.trim() || !selectedAreaId) return;
    try {
      if (editingFurniture) { await updateFurniture(editingFurniture.id, { name: furnitureForm.name, notes: furnitureForm.notes }); }
      else { await createFurniture({ area_id: selectedAreaId, name: furnitureForm.name, notes: furnitureForm.notes }); }
      setShowFurnitureModal(false);
    } catch (e) { alert('Error: ' + e.message); }
  }
  async function handleDeleteFurniture(f) { if (!confirm(`¿Eliminar "${f.name}"?`)) return; await deleteFurniture(f.id); }
  async function handleImageUpload(e) {
    const file = e.target.files?.[0]; if (!file || !selectedAreaId) return;
    setUploading(true);
    try { const url = await uploadFurnitureImage(file); await createFurniture({ area_id: selectedAreaId, name: file.name.replace(/\.[^.]+$/, ''), image_url: url, notes: '' }); } catch (err) { alert('Error: ' + err.message); }
    setUploading(false); if (fileRef.current) fileRef.current.value = '';
  }

  const overallProgress = areas.length > 0 ? Math.round(areas.reduce((sum, a) => sum + getAreaProgress(planningTasks, project.id, a.id), 0) / areas.length) : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Btn variant="ghost" onClick={onBack} style={{ padding: '4px 8px' }}>← Volver</Btn>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>{project.name}</h2>
          {project.client && <span style={{ fontSize: 12, color: 'var(--t2)' }}>{project.client}</span>}
        </div>
        <div style={{ minWidth: 130 }}><ProgressBar value={overallProgress} showLabel color="#7c6df0" /></div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {areas.map((area) => {
          const prog = getAreaProgress(planningTasks, project.id, area.id);
          const active = selectedAreaId === area.id;
          return (
            <button key={area.id} onClick={() => setSelectedAreaId(area.id)}
              style={{ padding: '8px 14px', borderRadius: 8, border: active ? '2px solid #7c6df0' : '1.5px solid var(--border)', background: active ? '#7c6df015' : 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: active ? '#7c6df0' : 'var(--t1)', fontFamily: 'inherit' }}>
              {area.name} <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{prog}%</span>
            </button>
          );
        })}
        <Btn variant="secondary" size="sm" onClick={openNewArea}>+ Área</Btn>
      </div>

      {!selectedAreaId || !currentArea ? (
        <EmptyState icon="👆" title="Selecciona un área" description="Elige un área para ver su estado y muebles." />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>{currentArea.name}</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn variant="ghost" size="sm" onClick={async () => {
                if (!confirm(`¿Generar las tareas de toda la cadena productiva para "${currentArea.name}"?\n\nTambién se limpiarán las tareas duplicadas de Optimización/Corte/Canteado/Mecanizado que no tienen material.`)) return;
                try {
                  const removed = await cleanupMaterialessTasks();
                  const materials = await getAreaMaterialsForArea(currentArea.id);
                  const allTasks = await getAllPlanningTasks();
                  const created = await generateAreaPipeline({ project, area: currentArea, materials, staffList, existingTasks: allTasks });
                  alert(`✓ ${created.length} tareas generadas.${removed > 0 ? `\n🗑 ${removed} duplicadas sin material eliminadas.` : ''}`);
                } catch (e) { alert('Error: ' + e.message); }
              }}>⚡ Regenerar tareas</Btn>
              <Btn variant="ghost" size="sm" onClick={() => openEditArea(currentArea)}>✎ Editar</Btn>
              <Btn variant="ghost" size="sm" onClick={() => handleDeleteArea(currentArea)}>🗑</Btn>
            </div>
          </div>

          {/* READ-ONLY CHECKLIST - status comes from planning_tasks */}
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Estado de producción</h4>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}>Actualiza el estado desde Planificación o Personal</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {checklistOrder.map((sid) => {
                const stage = STAGES.find((s) => s.id === sid);
                if (!stage) return null;
                const status = getStageStatus(planningTasks, project.id, currentArea.id, sid);
                const tasks = planningTasks.filter((t) => t.project_id === project.id && t.area_id === currentArea.id && t.stage === sid);
                const colors = { done: stage.color, in_progress: '#4a9eff', pending: 'var(--t2)', none: 'var(--border)' };
                const icons = { done: '✓', in_progress: '◉', pending: '○', none: '·' };
                const bg = { done: stage.color + '0c', in_progress: '#4a9eff08', pending: 'var(--bg)', none: 'var(--bg)' };
                return (
                  <div key={sid} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                    background: bg[status], border: `1px solid ${status === 'done' ? stage.color + '30' : status === 'in_progress' ? '#4a9eff20' : 'var(--border)'}`,
                  }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${colors[status]}`, background: status === 'done' ? stage.color : status === 'in_progress' ? '#4a9eff20' : 'transparent',
                      color: status === 'done' ? '#fff' : colors[status], fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>{icons[status]}</span>
                    <span style={{ fontSize: 15 }}>{stage.icon}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: status === 'done' ? stage.color : status === 'in_progress' ? '#4a9eff' : 'var(--t1)' }}>{stage.label}</span>
                    {/* Show materials for this stage with their own colors and status */}
                    {tasks.length > 0 && tasks.some((t) => t.material) && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {tasks.map((t) => {
                          if (!t.material) return null;
                          const mc = getMaterialColor(t.material, allMaterialNames);
                          const isDone = t.status === 'done';
                          const isProg = t.status === 'in_progress';
                          return (
                            <span key={t.id} style={{
                              display:'inline-flex', alignItems:'center', gap:3,
                              fontSize: 10, padding: '3px 8px', borderRadius: 5, fontWeight: 700,
                              background: isDone ? '#2dcc9f20' : mc + '18',
                              color: isDone ? '#2dcc9f' : mc,
                              border: `1px solid ${isDone ? '#2dcc9f50' : mc + '40'}`,
                              textDecoration: isDone ? 'line-through' : 'none',
                            }}>
                              🪵 {t.material}
                              {isDone && <span style={{ fontSize:11 }}>✓</span>}
                              {isProg && <span style={{ fontSize:9, color:'#4a9eff' }}>◉</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <MaterialsSection area={currentArea} project={project} staffList={staffList} userName={userName} />
          <FurnitureSection area={currentArea} projectId={project.id} userName={userName}
            onOpenNew={openNewFurniture} onEdit={openEditFurniture} onDelete={handleDeleteFurniture}
            fileRef={fileRef} onImageUpload={handleImageUpload} uploading={uploading} />
        </>
      )}

      <Modal open={showAreaModal} onClose={() => setShowAreaModal(false)} title={editingArea ? 'Editar área' : 'Nueva área'}>
        <InputField label="Nombre del área" value={areaForm.name} onChange={(v) => setAreaForm({ ...areaForm, name: v })} placeholder="Ej: Cocina, Closet, Baño..." />
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>
            Semana de arranque
            <span style={{ color: 'var(--t2)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
              · las tareas entrarán a las planificaciones cuando llegue esa semana
            </span>
          </label>
          <input
            type="date"
            value={areaForm.scheduled_week_start || ''}
            onChange={(e) => setAreaForm({ ...areaForm, scheduled_week_start: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
        <TagSelector label="Mecanizados que aplican" options={MECANIZADO_OPTIONS} selected={areaForm.mecanizados} onChange={(v) => setAreaForm({ ...areaForm, mecanizados: v })} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}><Btn variant="secondary" onClick={() => setShowAreaModal(false)}>Cancelar</Btn><Btn onClick={saveArea} disabled={!areaForm.name.trim()}>{editingArea ? 'Guardar' : 'Crear'}</Btn></div>
      </Modal>
      <Modal open={showFurnitureModal} onClose={() => setShowFurnitureModal(false)} title={editingFurniture ? 'Editar mueble' : 'Nuevo mueble'} width={400}>
        <InputField label="Nombre" value={furnitureForm.name} onChange={(v) => setFurnitureForm({ ...furnitureForm, name: v })} placeholder="Ej: Alacena, Isla..." />
        <InputField label="Notas" value={furnitureForm.notes} onChange={(v) => setFurnitureForm({ ...furnitureForm, notes: v })} placeholder="Dimensiones..." textarea />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}><Btn variant="secondary" onClick={() => setShowFurnitureModal(false)}>Cancelar</Btn><Btn onClick={saveFurniture} disabled={!furnitureForm.name.trim()}>{editingFurniture ? 'Guardar' : 'Agregar'}</Btn></div>
      </Modal>
    </div>
  );
}

function FurnitureSection({ area, projectId, userName, onOpenNew, onEdit, onDelete, fileRef, onImageUpload, uploading }) {
  const { data: furniture } = useFurniture(area.id);
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Muebles del área</h4><Badge>{furniture.length}</Badge></div>
        <div style={{ display: 'flex', gap: 6 }}><input ref={fileRef} type="file" accept="image/*" onChange={onImageUpload} style={{ display: 'none' }} /><Btn variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '⏳' : '📷 Foto'}</Btn><Btn size="sm" onClick={onOpenNew}>+ Mueble</Btn></div>
      </div>
      {furniture.length === 0 ? <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--t2)', fontSize: 13 }}>Sin muebles.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{furniture.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            {f.image_url && <img src={f.image_url} alt={f.name} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>{f.name}</div>{f.notes && <div style={{ fontSize: 11, color: 'var(--t2)' }}>{f.notes}</div>}</div>
            <div style={{ display: 'flex', gap: 2 }}><Btn variant="ghost" size="xs" onClick={() => onEdit(f)}>✎</Btn><Btn variant="ghost" size="xs" onClick={() => onDelete(f)}>🗑</Btn></div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

function MaterialsSection({ area, project, staffList, userName }) {
  const { data: materials } = useAreaMaterials(area.id);
  const [newMat, setNewMat] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function addMaterial() {
    if (!newMat.trim()) return;
    try {
      const newMaterial = await createAreaMaterial({ area_id: area.id, name: newMat.trim(), sort_order: materials.length });
      setNewMat('');
      try {
        const allTasks = await getAllPlanningTasks();
        const updatedMaterials = [...materials, newMaterial];
        await generateAreaPipeline({ project, area, materials: updatedMaterials, staffList, existingTasks: allTasks });
      } catch (e) { console.error('Pipeline regen on material add failed:', e); }
    } catch (e) { alert('Error: ' + e.message); }
  }

  function startEdit(mat) {
    setEditingId(mat.id);
    setEditValue(mat.name);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditValue('');
  }
  async function saveEdit(mat) {
    const newName = editValue.trim();
    if (!newName || newName === mat.name) { cancelEdit(); return; }
    setSavingEdit(true);
    try {
      const result = await renameAreaMaterial(mat.id, mat.name, newName, area.id);
      await logActivity({
        project_id: project.id, area_id: area.id, action: 'material_renamed',
        description: `Material "${mat.name}" renombrado a "${newName}" en ${area.name}. ${result.renamed} tarea(s) y ${result.itemsUpdated} planificación(es) actualizadas. Tareas ya completadas conservan el nombre anterior.`,
        user_name: userName,
      });
      cancelEdit();
    } catch (e) { alert('Error: ' + e.message); }
    setSavingEdit(false);
  }

  async function removeMaterial(mat) {
    if (!confirm(`¿Eliminar "${mat.name}"?`)) return;
    await deleteAreaMaterial(mat.id);
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>🪵 Materiales del área</h4><Badge>{materials.length}</Badge></div>
      <p style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 10 }}>Al agregar un material se generan automáticamente los procesos (Optimización, Corte, Canteado, Mecanizado) para él. Al renombrarlo, las tareas activas se actualizan; las ya completadas conservan el nombre original.</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input value={newMat} onChange={(e) => setNewMat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMaterial()} placeholder="Ej: MDF 18mm blanco..." style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
        <Btn size="sm" onClick={addMaterial} disabled={!newMat.trim()}>+ Agregar</Btn>
      </div>
      {materials.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{materials.map((mat) => {
        if (editingId === mat.id) {
          return (
            <span key={mat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 6, background: 'var(--bg)', border: '1.5px solid #7c6df0' }}>
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(mat);
                  if (e.key === 'Escape') cancelEdit();
                }}
                disabled={savingEdit}
                style={{ padding: '2px 6px', border: 'none', background: 'transparent', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none', minWidth: 120 }}
              />
              <button onClick={() => saveEdit(mat)} disabled={savingEdit || !editValue.trim()} style={{ padding: '2px 6px', border: 'none', background: 'transparent', color: '#2dcc9f', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✓</button>
              <button onClick={cancelEdit} disabled={savingEdit} style={{ padding: '2px 6px', border: 'none', background: 'transparent', color: 'var(--t2)', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </span>
          );
        }
        return (
          <span key={mat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: '#e6a23c15', border: '1px solid #e6a23c30', fontSize: 12, fontWeight: 500, color: '#e6a23c' }}>
            🪵 {mat.name}
            <span onClick={() => startEdit(mat)} title="Renombrar material" style={{ cursor: 'pointer', fontSize: 10, opacity: 0.7, marginLeft: 2 }}>✎</span>
            <span onClick={() => removeMaterial(mat)} title="Eliminar material" style={{ cursor: 'pointer', fontSize: 10, opacity: 0.7 }}>✕</span>
          </span>
        );
      })}</div>}
    </div>
  );
}
