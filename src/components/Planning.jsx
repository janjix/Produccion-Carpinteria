import { useState, useMemo } from 'react';
import { Btn, Badge, EmptyState, ProgressBar } from './UI.jsx';
import { STAGES, PLANNING_STATUSES, PROJECT_COLORS, MATERIAL_COLORS, STAGE_ORDER, AREA_CHECKLIST_STAGES, MECANIZADO_OPTIONS } from '../lib/constants.js';
import {
  usePlanningTasks,
  updateArea,
} from '../hooks/useSupabase.js';

// Stable color per material name
function getMaterialColor(name, allMaterials) {
  const names = [...new Set(allMaterials.filter(Boolean))].sort();
  const idx = names.indexOf(name);
  return MATERIAL_COLORS[idx >= 0 ? idx % MATERIAL_COLORS.length : 0];
}

// Compute status of a stage from its planning_tasks
function aggregateStatus(tasks) {
  if (!tasks || tasks.length === 0) return 'none';
  if (tasks.every((t) => t.status === 'done')) return 'done';
  if (tasks.some((t) => t.status === 'in_progress')) return 'in_progress';
  if (tasks.every((t) => t.status === 'blocked')) return 'blocked';
  return 'pending';
}

export default function Planning({ projects, allAreas, userName }) {
  const { data: tasks } = usePlanningTasks();
  const [expandedProject, setExpandedProject] = useState(null);
  const [expandedArea, setExpandedArea] = useState(null);

  const projectColorMap = useMemo(() => {
    const m = {}; projects.forEach((p,i) => { m[p.id] = PROJECT_COLORS[i % PROJECT_COLORS.length]; }); return m;
  }, [projects]);

  // Sort projects by priority
  const sortedProjects = useMemo(() =>
    [...projects].sort((a,b) => (a.priority || 0) - (b.priority || 0)),
    [projects]);

  const allMaterialNames = useMemo(() => tasks.map((t) => t.material).filter(Boolean), [tasks]);

  // Group tasks by project → area → stage
  const grouped = useMemo(() => {
    const g = {};
    tasks.forEach((t) => {
      if (!t.project_id) return;
      if (!g[t.project_id]) g[t.project_id] = {};
      const areaKey = t.area_id || '_no_area';
      if (!g[t.project_id][areaKey]) g[t.project_id][areaKey] = {};
      if (!g[t.project_id][areaKey][t.stage]) g[t.project_id][areaKey][t.stage] = [];
      g[t.project_id][areaKey][t.stage].push(t);
    });
    return g;
  }, [tasks]);

  // Compute progress for an area
  function getAreaProgress(projectId, areaId) {
    const stages = grouped[projectId]?.[areaId] || {};
    const allTasks = Object.values(stages).flat();
    if (allTasks.length === 0) return 0;
    const done = allTasks.filter((t) => t.status === 'done').length;
    return Math.round((done / allTasks.length) * 100);
  }

  // Compute progress for a project
  function getProjectProgress(projectId) {
    const projectAreas = allAreas.filter((a) => a.project_id === projectId);
    if (projectAreas.length === 0) return 0;
    const progresses = projectAreas.map((a) => getAreaProgress(projectId, a.id));
    return Math.round(progresses.reduce((s, v) => s + v, 0) / progresses.length);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>Planificación general</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t2)' }}>
          Vista de lectura organizada por prioridad de proyecto. El avance se actualiza desde las planificaciones del personal.
        </p>
      </div>

      {sortedProjects.length === 0 ? (
        <EmptyState icon="📋" title="Sin proyectos" description="Crea proyectos para verlos aquí." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedProjects.map((project, idx) => {
            const isExpanded = expandedProject === project.id;
            const projectColor = projectColorMap[project.id];
            const projectAreas = allAreas.filter((a) => a.project_id === project.id);
            const projectProgress = getProjectProgress(project.id);

            return (
              <div key={project.id} style={{
                background: 'var(--surface)', borderRadius: 12,
                border: `1px solid ${isExpanded ? projectColor + '40' : 'var(--border)'}`,
                borderLeft: `4px solid ${projectColor}`,
                overflow: 'hidden',
              }}>
                {/* Project header */}
                <div onClick={() => { setExpandedProject(isExpanded ? null : project.id); setExpandedArea(null); }}
                  style={{
                    padding: '14px 16px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: isExpanded ? projectColor + '08' : 'transparent',
                  }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: projectColor + '20', color: projectColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14, flexShrink: 0,
                  }}>#{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{project.name}</div>
                    {project.client && <div style={{ fontSize: 12, color: 'var(--t2)' }}>{project.client}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Badge>{projectAreas.length} área{projectAreas.length !== 1 ? 's' : ''}</Badge>
                    <div style={{ width: 100 }}><ProgressBar value={projectProgress} showLabel color={projectColor} /></div>
                    <span style={{ fontSize: 14, color: 'var(--t2)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                  </div>
                </div>

                {/* Expanded: areas */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 12, background: 'var(--bg)' }}>
                    {projectAreas.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--t2)', textAlign: 'center', padding: 16 }}>Sin áreas en este proyecto.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {projectAreas.map((area) => {
                          const isAreaExpanded = expandedArea === area.id;
                          const areaProgress = getAreaProgress(project.id, area.id);
                          const areaStages = grouped[project.id]?.[area.id] || {};

                          return (
                            <div key={area.id} style={{
                              background: 'var(--surface)', borderRadius: 8,
                              border: `1px solid ${isAreaExpanded ? projectColor + '30' : 'var(--border)'}`,
                              overflow: 'hidden',
                            }}>
                              <div onClick={() => setExpandedArea(isAreaExpanded ? null : area.id)}
                                style={{
                                  padding: '10px 14px', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', gap: 10,
                                }}>
                                <span style={{ fontSize: 14 }}>📐</span>
                                <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{area.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: areaProgress === 100 ? '#2dcc9f' : projectColor }}>{areaProgress}%</span>
                                <span style={{ fontSize: 12, color: 'var(--t2)', transform: isAreaExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                              </div>

                              {/* Expanded: stages of this area */}
                              {isAreaExpanded && (
                                <div style={{ borderTop: '1px solid var(--border)', padding: 10, background: 'var(--bg)' }}>
                                  <StageList
                                    stages={areaStages}
                                    area={area}
                                    allMaterialNames={allMaterialNames}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StageList({ stages, area, allMaterialNames }) {
  // Show all stages in checklist order, including stages without tasks (greyed out)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {AREA_CHECKLIST_STAGES.map((stageId) => {
        const stageInfo = STAGES.find((s) => s.id === stageId);
        if (!stageInfo) return null;
        const stageTasks = stages[stageId] || [];
        const status = aggregateStatus(stageTasks);
        const colors = {
          done: stageInfo.color, in_progress: '#4a9eff',
          pending: 'var(--t2)', blocked: '#9ca3af', none: 'var(--border)',
        };
        const icons = { done: '✓', in_progress: '◉', pending: '○', blocked: '🔒', none: '·' };
        const bg = {
          done: stageInfo.color + '0c', in_progress: '#4a9eff08',
          pending: 'var(--surface)', blocked: 'var(--surface)', none: 'var(--surface)',
        };
        return (
          <div key={stageId} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 6,
            background: bg[status],
            border: `1px solid ${status === 'done' ? stageInfo.color + '30' : status === 'in_progress' ? '#4a9eff20' : 'var(--border)'}`,
            opacity: status === 'none' ? 0.5 : status === 'blocked' ? 0.7 : 1,
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: 5, flexShrink: 0,
              border: `2px solid ${colors[status]}`,
              background: status === 'done' ? stageInfo.color : status === 'in_progress' ? '#4a9eff20' : 'transparent',
              color: status === 'done' ? '#fff' : colors[status],
              fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{icons[status]}</span>
            <span style={{ fontSize: 13 }}>{stageInfo.icon}</span>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: status === 'done' ? stageInfo.color : status === 'in_progress' ? '#4a9eff' : 'var(--t1)' }}>
              {stageInfo.label}
            </span>
            {/* Show materials with their individual status */}
            {stageTasks.length > 0 && stageTasks.some((t) => t.material) && (
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {stageTasks.map((t) => {
                  if (!t.material) return null;
                  const mc = getMaterialColor(t.material, allMaterialNames);
                  const isDone = t.status === 'done';
                  const isProg = t.status === 'in_progress';
                  const isBlocked = t.status === 'blocked';
                  return (
                    <span key={t.id} style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                      background: isDone ? '#2dcc9f20' : mc + '18',
                      color: isDone ? '#2dcc9f' : mc,
                      border: `1px solid ${isDone ? '#2dcc9f50' : mc + '40'}`,
                      textDecoration: isDone ? 'line-through' : 'none',
                      opacity: isBlocked ? 0.6 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>
                      🪵 {t.material}
                      {isDone && <span>✓</span>}
                      {isProg && <span style={{ color: '#4a9eff' }}>◉</span>}
                      {isBlocked && <span>🔒</span>}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Show mecanizado progress when applicable */}
            {stageId === 'mecanizado' && area && (area.mecanizados_enabled || []).length > 0 && (
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                background: '#4a9eff15', color: '#4a9eff', border: '1px solid #4a9eff30',
              }}>
                ⚙️ {(area.mecanizados_completed || []).filter((m) => (area.mecanizados_enabled || []).includes(m)).length}/{(area.mecanizados_enabled || []).length}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Mecanizado checklist: shows enabled mecanizados for the area with done state ───
// Exported so StaffView can reuse it
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
