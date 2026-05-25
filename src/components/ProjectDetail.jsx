import { useState, useRef, useMemo } from 'react';
import { Btn, Modal, InputField, ProgressBar, Badge, EmptyState, TagSelector } from './UI.jsx';
import { STAGES, MECANIZADO_OPTIONS, READY_FOR_ASSEMBLY_STAGES, AREA_CHECKLIST_STAGES } from '../lib/constants.js';
import {
  useAreas,
  useFurniture,
  useAreaMaterials,
  createArea,
  updateArea,
  deleteArea,
  createFurniture,
  createAreaMaterial,
  deleteAreaMaterial,
  updateFurniture,
  deleteFurniture,
  uploadFurnitureImage,
  updatePlanningTask,
  getAllPlanningTasks,
  getAllStaff,
  propagateNextProcesses,
  logActivity,
} from '../hooks/useSupabase.js';

const checklistStages = STAGES.filter(s => AREA_CHECKLIST_STAGES.includes(s.id));
const checklistOrder = AREA_CHECKLIST_STAGES;

function getAreaProgress(area) {
  let total = 0, completed = 0;
  checklistOrder.forEach((sid) => {
    total++;
    if (area[`stage_${sid}`]) completed++;
  });
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

export default function ProjectDetail({ project, onBack, userName }) {
  const { data: areas } = useAreas(project.id);
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [showFurnitureModal, setShowFurnitureModal] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [editingFurniture, setEditingFurniture] = useState(null);
  const [areaForm, setAreaForm] = useState({ name: '', mecanizados: [] });
  const [furnitureForm, setFurnitureForm] = useState({ name: '', notes: '' });
  const [expandedComment, setExpandedComment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const currentArea = areas.find((a) => a.id === selectedAreaId);
  const isReadyForAssembly = currentArea
    ? READY_FOR_ASSEMBLY_STAGES.every((s) => currentArea[`stage_${s}`])
    : false;

  // ─── Area CRUD ───
  function openNewArea() { setEditingArea(null); setAreaForm({ name: '', mecanizados: [] }); setShowAreaModal(true); }
  function openEditArea(area) { setEditingArea(area); setAreaForm({ name: area.name, mecanizados: area.mecanizados_enabled || [] }); setShowAreaModal(true); }

  async function saveArea() {
    if (!areaForm.name.trim()) return;
    try {
      if (editingArea) {
        await updateArea(editingArea.id, { name: areaForm.name, mecanizados_enabled: areaForm.mecanizados });
      } else {
        const a = await createArea({ project_id: project.id, name: areaForm.name, mecanizados_enabled: areaForm.mecanizados, sort_order: areas.length });
        await logActivity({ project_id: project.id, area_id: a.id, action: 'area_created', description: `Área "${areaForm.name}" creada en ${project.name}`, user_name: userName });
        setSelectedAreaId(a.id);
      }
      setShowAreaModal(false);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function handleDeleteArea(area) {
    if (!confirm(`¿Eliminar "${area.name}"?`)) return;
    await deleteArea(area.id);
    if (selectedAreaId === area.id) setSelectedAreaId(null);
  }

  // ─── Stage Toggle with sync to planning ───
  // Track pending toggles to prevent double-click issues
  const [pendingToggles, setPendingToggles] = useState({});

  async function toggleStage(stageId) {
    if (!currentArea) return;
    // Prevent double-click on same stage
    if (pendingToggles[stageId]) return;
    setPendingToggles((p) => ({ ...p, [stageId]: true }));

    const field = `stage_${stageId}`;
    const newVal = !currentArea[field];
    const stage = STAGES.find((s) => s.id === stageId);

    // Fire DB update
    updateArea(currentArea.id, { [field]: newVal }).finally(() => {
      setPendingToggles((p) => { const c = { ...p }; delete c[stageId]; return c; });
    });
    logActivity({
      project_id: project.id, area_id: currentArea.id,
      action: newVal ? 'stage_completed' : 'stage_unchecked', stage: stageId,
      description: `${stage.label} ${newVal ? 'completado' : 'desmarcado'} en ${currentArea.name} (${project.name})`,
      user_name: userName,
    });
    // Background sync when completing
    if (newVal) {
      (async () => {
        try {
          const allTasks = await getAllPlanningTasks();
          const matching = allTasks.filter((t) =>
            t.project_id === project.id && t.area_id === currentArea.id &&
            t.stage === stageId && t.status !== 'done'
          );
          const staffList = await getAllStaff();
          for (const task of matching) {
            updatePlanningTask(task.id, { status: 'done' });
          }
          if (matching.length > 0) {
            const refreshed = await getAllPlanningTasks();
            for (const task of matching) {
              const enriched = { ...task, _area_name: currentArea.name };
              const created = await propagateNextProcesses(enriched, refreshed, staffList);
              if (created.length > 0) {
                logActivity({ project_id: project.id, action: 'auto_propagated', description: `${created.length} proceso(s) creado(s) tras completar "${stage.label}" en ${currentArea.name}`, user_name: 'Sistema' });
              }
            }
          }
        } catch (e) { console.error('Sync error:', e); }
      })();
    }
  }

  // ─── Mecanizado toggle ───
  async function toggleMecanizado(mec) {
    if (!currentArea) return;
    const completed = currentArea.mecanizados_completed || [];
    const newCompleted = completed.includes(mec) ? completed.filter((m) => m !== mec) : [...completed, mec];
    await updateArea(currentArea.id, { mecanizados_completed: newCompleted });
    await logActivity({ project_id: project.id, area_id: currentArea.id, action: 'mecanizado_toggled', stage: 'mecanizado', description: `Mecanizado "${mec}" ${newCompleted.includes(mec) ? 'completado' : 'desmarcado'} en ${currentArea.name}`, user_name: userName });
  }

  // ─── Stage Comment ───
  async function saveComment(stageId, text) {
    if (!currentArea) return;
    await updateArea(currentArea.id, { [`comment_${stageId}`]: text });
    if (text.trim()) {
      await logActivity({ project_id: project.id, area_id: currentArea.id, action: 'comment_added', stage: stageId, description: `Comentario en ${STAGES.find((s) => s.id === stageId).label} (${currentArea.name}): "${text.slice(0, 80)}"`, user_name: userName });
    }
  }

  // ─── Furniture ───
  function openNewFurniture() { setEditingFurniture(null); setFurnitureForm({ name: '', notes: '' }); setShowFurnitureModal(true); }
  function openEditFurniture(f) { setEditingFurniture(f); setFurnitureForm({ name: f.name, notes: f.notes || '' }); setShowFurnitureModal(true); }

  async function saveFurniture() {
    if (!furnitureForm.name.trim() || !selectedAreaId) return;
    try {
      if (editingFurniture) { await updateFurniture(editingFurniture.id, { name: furnitureForm.name, notes: furnitureForm.notes }); }
      else { await createFurniture({ area_id: selectedAreaId, name: furnitureForm.name, notes: furnitureForm.notes }); await logActivity({ project_id: project.id, area_id: selectedAreaId, action: 'furniture_added', description: `Mueble "${furnitureForm.name}" agregado a ${currentArea.name}`, user_name: userName }); }
      setShowFurnitureModal(false);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function handleDeleteFurniture(f) { if (!confirm(`¿Eliminar "${f.name}"?`)) return; await deleteFurniture(f.id); }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !selectedAreaId) return;
    setUploading(true);
    try {
      const url = await uploadFurnitureImage(file);
      await createFurniture({ area_id: selectedAreaId, name: file.name.replace(/\.[^.]+$/, ''), image_url: url, notes: 'Subido desde imagen' });
      await logActivity({ project_id: project.id, area_id: selectedAreaId, action: 'image_uploaded', description: `Imagen subida a ${currentArea.name}: ${file.name}`, user_name: userName });
    } catch (err) { alert('Error al subir imagen: ' + err.message); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  const overallProgress = areas.length > 0 ? Math.round(areas.reduce((sum, a) => sum + getAreaProgress(a), 0) / areas.length) : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Btn variant="ghost" onClick={onBack} style={{ padding: '4px 8px' }}>← Volver</Btn>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.02em' }}>{project.name}</h2>
          {project.client && <span style={{ fontSize: 12, color: 'var(--t2)' }}>{project.client}</span>}
        </div>
        <div style={{ minWidth: 130 }}><ProgressBar value={overallProgress} showLabel color="#7c6df0" /></div>
      </div>

      {/* Area tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {areas.map((area) => {
          const prog = getAreaProgress(area);
          const active = selectedAreaId === area.id;
          return (
            <button key={area.id} onClick={() => { setSelectedAreaId(area.id); setExpandedComment(null); }}
              style={{ padding: '8px 14px', borderRadius: 8, border: active ? '2px solid #7c6df0' : '1.5px solid var(--border)', background: active ? '#7c6df015' : 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: active ? '#7c6df0' : 'var(--t1)', fontFamily: 'inherit' }}>
              {area.name} <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{prog}%</span>
            </button>
          );
        })}
        <Btn variant="secondary" size="sm" onClick={openNewArea}>+ Área</Btn>
      </div>

      {!selectedAreaId || !currentArea ? (
        <EmptyState icon="👆" title="Selecciona un área" description="Elige un área para ver su checklist y muebles." />
      ) : (
        <>
          {/* Area header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>{currentArea.name}</h3>
              {isReadyForAssembly && <Badge color="#2dcc9f">Lista para ensamblaje</Badge>}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn variant="ghost" size="sm" onClick={() => openEditArea(currentArea)}>✎ Editar área</Btn>
              <Btn variant="ghost" size="sm" onClick={() => handleDeleteArea(currentArea)}>🗑</Btn>
            </div>
          </div>

          {/* ─── AREA-LEVEL CHECKLIST ─── */}
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Checklist de producción</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {checklistOrder.map((sid) => {
                const stage = STAGES.find((s) => s.id === sid);
                if (!stage) return null;
                const checked = currentArea[`stage_${stage.id}`];
                const comment = currentArea[`comment_${stage.id}`] || '';
                const isExpanded = expandedComment === stage.id;
                return (
                  <div key={stage.id}>
                    <div
                      onClick={() => toggleStage(stage.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                        background: checked ? stage.color + '0c' : 'var(--bg)',
                        border: `1px solid ${checked ? stage.color + '30' : 'var(--border)'}`,
                        transition: 'all 0.15s', userSelect: 'none',
                        opacity: pendingToggles[stage.id] ? 0.6 : 1,
                        minHeight: 48,
                      }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `2.5px solid ${checked ? stage.color : 'var(--border)'}`, background: checked ? stage.color : 'transparent',
                        color: '#fff', fontSize: 15, fontWeight: 700, transition: 'all 0.15s',
                      }}>
                        {checked && '✓'}
                      </span>
                      <span style={{ fontSize: 16 }}>{stage.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: checked ? stage.color : 'var(--t1)' }}>{stage.label}</span>
                      {comment && !isExpanded && (
                        <span style={{ fontSize: 11, color: '#f0a040', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>💬 {comment}</span>
                      )}
                      <span onClick={(e) => { e.stopPropagation(); setExpandedComment(isExpanded ? null : stage.id); }}
                        style={{ fontSize: 14, color: 'var(--t2)', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: isExpanded ? 'var(--hover)' : 'transparent' }}>
                        {isExpanded ? '✕' : '💬'}
                      </span>
                    </div>
                    {isExpanded && (
                      <div style={{ marginTop: 4, marginLeft: 30 }}>
                        <textarea value={comment} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => saveComment(stage.id, e.target.value)}
                          placeholder="Ej: Falta material, esperando proveedor..."
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', minHeight: 40, boxSizing: 'border-box' }} />
                      </div>
                    )}
                    {stage.id === 'mecanizado' && currentArea.mecanizados_enabled?.length > 0 && (
                      <div style={{ marginLeft: 30, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {currentArea.mecanizados_enabled.map((mec) => {
                          const done = (currentArea.mecanizados_completed || []).includes(mec);
                          return (
                            <button key={mec} onClick={(e) => { e.stopPropagation(); toggleMecanizado(mec); }}
                              style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 500, border: `1px solid ${done ? '#4a9eff' : 'var(--border)'}`, background: done ? '#4a9eff15' : 'transparent', color: done ? '#4a9eff' : 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                              {mec} {done && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── MATERIALS ─── */}
          <MaterialsSection area={currentArea} projectId={project.id} userName={userName} />

          {/* ─── FURNITURE LIST ─── */}
          <FurnitureSection area={currentArea} projectId={project.id} projectName={project.name} userName={userName}
            onOpenNew={openNewFurniture} onEdit={openEditFurniture} onDelete={handleDeleteFurniture}
            fileRef={fileRef} onImageUpload={handleImageUpload} uploading={uploading} />
        </>
      )}

      <Modal open={showAreaModal} onClose={() => setShowAreaModal(false)} title={editingArea ? 'Editar área' : 'Nueva área'}>
        <InputField label="Nombre del área" value={areaForm.name} onChange={(v) => setAreaForm({ ...areaForm, name: v })} placeholder="Ej: Cocina, Closet, Baño..." />
        <TagSelector label="Mecanizados que aplican a esta área" options={MECANIZADO_OPTIONS} selected={areaForm.mecanizados} onChange={(v) => setAreaForm({ ...areaForm, mecanizados: v })} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setShowAreaModal(false)}>Cancelar</Btn>
          <Btn onClick={saveArea} disabled={!areaForm.name.trim()}>{editingArea ? 'Guardar' : 'Crear'}</Btn>
        </div>
      </Modal>

      <Modal open={showFurnitureModal} onClose={() => setShowFurnitureModal(false)} title={editingFurniture ? 'Editar mueble' : 'Nuevo mueble'} width={400}>
        <InputField label="Nombre" value={furnitureForm.name} onChange={(v) => setFurnitureForm({ ...furnitureForm, name: v })} placeholder="Ej: Alacena superior, Isla..." />
        <InputField label="Notas" value={furnitureForm.notes} onChange={(v) => setFurnitureForm({ ...furnitureForm, notes: v })} placeholder="Dimensiones, material..." textarea />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setShowFurnitureModal(false)}>Cancelar</Btn>
          <Btn onClick={saveFurniture} disabled={!furnitureForm.name.trim()}>{editingFurniture ? 'Guardar' : 'Agregar'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

function FurnitureSection({ area, projectId, projectName, userName, onOpenNew, onEdit, onDelete, fileRef, onImageUpload, uploading }) {
  const { data: furniture } = useFurniture(area.id);
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Muebles del área</h4><Badge>{furniture.length}</Badge></div>
        <div style={{ display: 'flex', gap: 6 }}><input ref={fileRef} type="file" accept="image/*" onChange={onImageUpload} style={{ display: 'none' }} /><Btn variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '⏳ Subiendo...' : '📷 Subir foto'}</Btn><Btn size="sm" onClick={onOpenNew}>+ Mueble</Btn></div>
      </div>
      {furniture.length === 0 ? (<div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--t2)', fontSize: 13 }}>Sin muebles.</div>) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {furniture.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
              {f.image_url && <img src={f.image_url} alt={f.name} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>{f.name}</div>{f.notes && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{f.notes}</div>}</div>
              <div style={{ display: 'flex', gap: 2 }}><Btn variant="ghost" size="xs" onClick={() => onEdit(f)}>✎</Btn><Btn variant="ghost" size="xs" onClick={() => onDelete(f)}>🗑</Btn></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialsSection({ area, projectId, userName }) {
  const { data: materials } = useAreaMaterials(area.id);
  const [newMat, setNewMat] = useState('');
  async function addMaterial() { if (!newMat.trim()) return; try { await createAreaMaterial({ area_id: area.id, name: newMat.trim(), sort_order: materials.length }); setNewMat(''); } catch (e) { alert('Error: ' + e.message); } }
  async function removeMaterial(mat) { if (!confirm(`¿Eliminar "${mat.name}"?`)) return; await deleteAreaMaterial(mat.id); }
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>🪵 Materiales del área</h4><Badge>{materials.length}</Badge></div>
      <p style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 10 }}>Cada material genera su propio set de procesos (Optimización, Corte, Canteado, Mecanizado).</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input value={newMat} onChange={(e) => setNewMat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMaterial()}
          placeholder="Ej: MDF 18mm blanco, Melamina roble..."
          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
        <Btn size="sm" onClick={addMaterial} disabled={!newMat.trim()}>+ Agregar</Btn>
      </div>
      {materials.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {materials.map((mat) => (
            <span key={mat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: '#e6a23c15', border: '1px solid #e6a23c30', fontSize: 12, fontWeight: 500, color: '#e6a23c' }}>
              🪵 {mat.name} <span onClick={() => removeMaterial(mat)} style={{ cursor: 'pointer', fontSize: 10, opacity: 0.7 }}>✕</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
