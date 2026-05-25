import { useState } from 'react';
import { ProgressBar, Badge, Btn } from './UI.jsx';
import { STAGES, AREA_CHECKLIST_STAGES } from '../lib/constants.js';

const checklistStages = STAGES.filter(s => AREA_CHECKLIST_STAGES.includes(s.id));

function getStageStatus(planningTasks, projectId, areaId, stageId) {
  const tasks = planningTasks.filter((t) => t.project_id === projectId && t.area_id === areaId && t.stage === stageId);
  if (tasks.length === 0) return 'none';
  if (tasks.every((t) => t.status === 'done')) return 'done';
  if (tasks.some((t) => t.status === 'in_progress')) return 'in_progress';
  return 'pending';
}

function getAreaProgress(planningTasks, projectId, areaId) {
  let total = 0, completed = 0;
  AREA_CHECKLIST_STAGES.forEach((sid) => {
    const s = getStageStatus(planningTasks, projectId, areaId, sid);
    if (s !== 'none') { total++; if (s === 'done') completed++; }
  });
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function getProjectProgress(planningTasks, projectId, projectAreas) {
  if (!projectAreas.length) return 0;
  return Math.round(projectAreas.reduce((s, a) => s + getAreaProgress(planningTasks, projectId, a.id), 0) / projectAreas.length);
}

function formatDate(d) { return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }

export default function Dashboard({ projects, allAreas, planningTasks = [] }) {
  const [expandedProject, setExpandedProject] = useState(null);
  const totalAreas = allAreas.length;
  const completedProjects = projects.filter((p) => {
    const pAreas = allAreas.filter((a) => a.project_id === p.id);
    return pAreas.length > 0 && getProjectProgress(planningTasks, p.id, pAreas) === 100;
  }).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>Panel general</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[{ label: 'Proyectos', value: projects.length, color: '#7c6df0' }, { label: 'Completados', value: completedProjects, color: '#2dcc9f' }, { label: 'En proceso', value: projects.length - completedProjects, color: '#e6a23c' }, { label: 'Total áreas', value: totalAreas, color: '#4a9eff' }].map((c) => (
          <div key={c.label} style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
      {projects.length === 0 ? (<div style={{ textAlign: 'center', padding: 40, color: 'var(--t2)' }}><div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>📊</div><div style={{ fontSize: 14 }}>Crea proyectos para ver el seguimiento.</div></div>) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {projects.map((proj) => {
            const projAreas = allAreas.filter((a) => a.project_id === proj.id);
            const overall = getProjectProgress(planningTasks, proj.id, projAreas);
            const isExpanded = expandedProject === proj.id;
            return (
              <div key={proj.id} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div onClick={() => setExpandedProject(isExpanded ? null : proj.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{proj.name}</span>
                    {proj.client && <span style={{ fontSize: 12, color: 'var(--t2)' }}>{proj.client}</span>}
                    <Badge>{projAreas.length} área{projAreas.length !== 1 ? 's' : ''}</Badge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 100 }}><ProgressBar value={overall} showLabel color="#7c6df0" /></div>
                    <span style={{ fontSize: 12, color: 'var(--t2)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
                    {projAreas.length === 0 ? <div style={{ fontSize: 13, color: 'var(--t2)' }}>Sin áreas.</div> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {projAreas.map((area) => {
                          const ap = getAreaProgress(planningTasks, proj.id, area.id);
                          return (
                            <div key={area.id} style={{ background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', padding: 14 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{area.name}</span>
                                <span style={{ fontWeight: 700, fontSize: 13, color: ap === 100 ? '#2dcc9f' : '#7c6df0' }}>{ap}%</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 5 }}>
                                {checklistStages.map((stage) => {
                                  const status = getStageStatus(planningTasks, proj.id, area.id, stage.id);
                                  const colors = { done: stage.color, in_progress: '#4a9eff', pending: 'var(--t2)', none: 'var(--border)' };
                                  const icons = { done: '✓', in_progress: '◉', pending: '○', none: '·' };
                                  return (
                                    <div key={stage.id} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 6, background: status === 'done' ? stage.color + '12' : 'var(--surface)', border: `1px solid ${status === 'done' ? stage.color + '30' : status === 'in_progress' ? '#4a9eff20' : 'var(--border)'}` }}>
                                      <div style={{ fontSize: 14, marginBottom: 1 }}>{stage.icon}</div>
                                      <div style={{ fontSize: 9, fontWeight: 600, color: colors[status], lineHeight: 1.2 }}>{stage.label}</div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: colors[status], marginTop: 1 }}>{icons[status]}</div>
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
