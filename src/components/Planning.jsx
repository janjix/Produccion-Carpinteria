import { useState, useMemo } from 'react';
import { Btn, Badge, EmptyState, ProgressBar } from './UI.jsx';
import { STAGES, PLANNING_STATUSES, PROJECT_COLORS, MATERIAL_COLORS, STAGE_ORDER, AREA_CHECKLIST_STAGES, MECANIZADO_OPTIONS } from '../lib/constants.js';
import {
  usePlanningTasks,
  updateArea, useStaff,
} from '../hooks/useSupabase.js';

// ─── Helpers for the weekly PDF ───
function getMondayOf(date) {
  const d = new Date(date); const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0); return d;
}
function getSundayAfter(monday) {
  const d = new Date(monday); d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999); return d;
}
function fmtDate(d, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return d.toLocaleDateString('es-MX', opts);
}
function fmtDateTime(d) {
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
  const { data: staffList } = useStaff();
  const [expandedProject, setExpandedProject] = useState(null);
  const [expandedArea, setExpandedArea] = useState(null);
  const [weekMonday, setWeekMonday] = useState(() => getMondayOf(new Date()));

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

  // ─── Weekly completion PDF ───
  function exportWeeklyPDF() {
    const sunday = getSundayAfter(weekMonday);
    const ws = weekMonday.getTime();
    const we = sunday.getTime();

    // Tasks completed within the selected week (uses completed_at)
    const completed = tasks.filter((t) => {
      if (t.status !== 'done' || !t.completed_at) return false;
      const ts = new Date(t.completed_at).getTime();
      return ts >= ws && ts <= we;
    });

    // Group: project → area → tasks
    const byProject = {};
    completed.forEach((t) => {
      if (!t.project_id) return;
      if (!byProject[t.project_id]) byProject[t.project_id] = {};
      const ak = t.area_id || '_none';
      if (!byProject[t.project_id][ak]) byProject[t.project_id][ak] = [];
      byProject[t.project_id][ak].push(t);
    });

    const projectOrder = [...projects].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const staffById = {}; staffList.forEach((s) => { staffById[s.id] = s; });
    const areaById = {}; allAreas.forEach((a) => { areaById[a.id] = a; });

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte semanal de producción — MS</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI','Helvetica Neue',sans-serif;padding:32px;color:#1a1a2e;font-size:12px;line-height:1.45}
      .header{border-bottom:3px solid #1a1a2e;padding-bottom:16px;margin-bottom:24px}
      .brand{font-size:11px;letter-spacing:0.18em;color:#7a7a9a;font-weight:700;text-transform:uppercase;margin-bottom:4px}
      h1{font-size:22px;font-weight:800;letter-spacing:-0.02em}
      .week{color:#3a3a5a;font-size:13px;margin-top:6px;font-weight:600}
      .summary{background:#f5f5fa;border-radius:8px;padding:14px 18px;margin-bottom:24px;display:flex;gap:24px;flex-wrap:wrap}
      .stat{display:flex;flex-direction:column}
      .stat-num{font-size:24px;font-weight:800;color:#1a1a2e}
      .stat-lbl{font-size:10px;color:#7a7a9a;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-top:2px}
      .project{margin-bottom:22px;page-break-inside:avoid}
      .project-head{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:6px;color:#fff;font-weight:700;font-size:14px;margin-bottom:10px}
      .priority{background:rgba(255,255,255,0.25);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:800}
      .project-name{flex:1}
      .project-client{font-size:11px;font-weight:500;opacity:0.85}
      .area{margin-left:12px;margin-bottom:12px}
      .area-name{font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:5px;display:flex;align-items:center;gap:6px}
      .area-name::before{content:"📐";font-size:12px}
      .task{padding:5px 10px 5px 26px;border-left:2px solid #2dcc9f;background:#f5f5fa;border-radius:0 4px 4px 0;margin-bottom:3px;position:relative;font-size:11px}
      .task::before{content:"✓";position:absolute;left:8px;color:#2dcc9f;font-weight:800}
      .task-name{font-weight:600;color:#1a1a2e}
      .task-meta{color:#7a7a9a;font-size:10px;margin-top:1px}
      .mat-chip{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;margin:0 3px}
      .empty{padding:40px;text-align:center;color:#7a7a9a;background:#f5f5fa;border-radius:8px}
      .footer{margin-top:32px;padding-top:14px;border-top:1px solid #d8d8e0;color:#7a7a9a;font-size:10px;display:flex;justify-content:space-between}
      @media print{body{padding:18px}.project{page-break-inside:avoid}}
    </style></head><body>`;

    html += `<div class="header">
      <div class="brand">TECC Producción</div>
      <h1>Reporte semanal de producción</h1>
      <div class="week">Semana del ${fmtDate(weekMonday)} al ${fmtDate(sunday)}</div>
    </div>`;

    const projectsWithCompleted = projectOrder.filter((p) => byProject[p.id]);
    const totalAreas = projectsWithCompleted.reduce((s, p) => s + Object.keys(byProject[p.id]).length, 0);

    html += `<div class="summary">
      <div class="stat"><span class="stat-num">${completed.length}</span><span class="stat-lbl">Procesos completados</span></div>
      <div class="stat"><span class="stat-num">${projectsWithCompleted.length}</span><span class="stat-lbl">Proyectos</span></div>
      <div class="stat"><span class="stat-num">${totalAreas}</span><span class="stat-lbl">Áreas</span></div>
    </div>`;

    if (completed.length === 0) {
      html += `<div class="empty">No hay procesos completados en esta semana.</div>`;
    } else {
      for (let i = 0; i < projectsWithCompleted.length; i++) {
        const project = projectsWithCompleted[i];
        const color = projectColorMap[project.id] || '#7c6df0';
        const areas = byProject[project.id];

        html += `<div class="project"><div class="project-head" style="background:${color}">
          <span class="priority">#${i + 1}</span>
          <div class="project-name">${escapeHtml(project.name)}${project.client ? ` <span class="project-client">· ${escapeHtml(project.client)}</span>` : ''}</div>
        </div>`;

        Object.entries(areas).forEach(([areaId, areaTasks]) => {
          const area = areaById[areaId];
          const areaName = area ? area.name : 'Sin área';
          // Sort tasks by stage order
          areaTasks.sort((a, b) => (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99));
          html += `<div class="area"><div class="area-name">${escapeHtml(areaName)}</div>`;
          areaTasks.forEach((t) => {
            const stageInfo = STAGES.find((s) => s.id === t.stage);
            const label = stageInfo?.label || t.stage;
            const completedAt = t.completed_at ? new Date(t.completed_at) : null;
            const dayLabel = completedAt ? completedAt.toLocaleDateString('es-MX', { weekday: 'long' }) : '';
            const assigned = t.assigned_to_id ? staffById[t.assigned_to_id] : null;
            const matChip = t.material
              ? `<span class="mat-chip" style="background:${getMaterialColor(t.material, allMaterialNames)}20;color:${getMaterialColor(t.material, allMaterialNames)};border:1px solid ${getMaterialColor(t.material, allMaterialNames)}50">🪵 ${escapeHtml(t.material)}</span>`
              : '';
            html += `<div class="task">
              <div class="task-name">${escapeHtml(label)} ${matChip}</div>
              <div class="task-meta">
                ${dayLabel ? `${dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)} · ` : ''}
                ${assigned ? `Responsable: ${escapeHtml(assigned.name)} (${assigned.code})` : 'Sin responsable asignado'}
              </div>
            </div>`;
          });
          html += `</div>`;
        });
        html += `</div>`;
      }
    }

    html += `<div class="footer">
      <span>Generado por ${escapeHtml(userName || 'Usuario')}</span>
      <span>${fmtDateTime(new Date())}</span>
    </div>`;
    html += `</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const w = window.open(URL.createObjectURL(blob), '_blank');
    if (w) w.onload = () => setTimeout(() => w.print(), 400);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>Planificación general</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t2)' }}>
            Vista de lectura organizada por prioridad de proyecto. El avance se actualiza desde las planificaciones del personal.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Btn variant="ghost" size="sm" onClick={() => { const d = new Date(weekMonday); d.setDate(d.getDate() - 7); setWeekMonday(d); }}>←</Btn>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', minWidth: 150, textAlign: 'center' }}>
            {fmtDate(weekMonday, { day: '2-digit', month: 'short' })} — {fmtDate(getSundayAfter(weekMonday), { day: '2-digit', month: 'short' })}
          </span>
          <Btn variant="ghost" size="sm" onClick={() => { const d = new Date(weekMonday); d.setDate(d.getDate() + 7); setWeekMonday(d); }}>→</Btn>
          <Btn onClick={exportWeeklyPDF}>📄 PDF semanal</Btn>
        </div>
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
