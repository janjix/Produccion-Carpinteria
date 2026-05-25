import { useState } from 'react';
import { ProgressBar, Badge, Btn } from './UI.jsx';
import { STAGES, AREA_CHECKLIST_STAGES } from '../lib/constants.js';

const checklistStages = STAGES.filter(s => AREA_CHECKLIST_STAGES.includes(s.id));

function getAreaProgress(area) {
  let total = 0, completed = 0;
  AREA_CHECKLIST_STAGES.forEach((sid) => { total++; if (area[`stage_${sid}`]) completed++; });
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function getProjectProgress(projectAreas) {
  if (!projectAreas.length) return 0;
  return Math.round(projectAreas.reduce((s, a) => s + getAreaProgress(a), 0) / projectAreas.length);
}

function formatDate(d) { return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }

function generatePDFReport(projects, allAreas) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Reporte Semanal MS Producción</title>
  <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1a1a2e; font-size: 13px; } h1 { font-size: 22px; margin-bottom: 4px; } .subtitle { color: #7a7a9a; font-size: 12px; margin-bottom: 24px; } .project { margin-bottom: 24px; page-break-inside: avoid; } .project-header { background: #f5f5fa; padding: 12px 16px; border-radius: 8px; margin-bottom: 10px; } .project-name { font-size: 16px; font-weight: 700; } .client { color: #7a7a9a; font-size: 12px; margin-left: 8px; } .progress-text { float: right; font-weight: 700; color: #7c6df0; } .area-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; } .area-table th { text-align: left; padding: 6px 8px; font-size: 11px; color: #7a7a9a; border-bottom: 2px solid #e0e0ea; font-weight: 600; } .area-table td { padding: 6px 8px; border-bottom: 1px solid #f0f0f5; font-size: 12px; } .area-name { font-weight: 600; } .done { color: #2dcc9f; font-weight: 600; } .pending { color: #f06060; } .bar-bg { background: #e8e8f0; border-radius: 3px; height: 6px; width: 80px; display: inline-block; vertical-align: middle; } .bar-fill { height: 6px; border-radius: 3px; background: #7c6df0; } .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e0e0ea; color: #7a7a9a; font-size: 11px; } @media print { body { padding: 20px; } }</style></head><body>`;
  html += `<h1>🪚 Reporte Semanal — MS Producción</h1>`;
  html += `<div class="subtitle">Generado: ${formatDate(now)} | Período: ${formatDate(weekAgo)} — ${formatDate(now)}</div>`;
  projects.forEach((proj) => {
    const projAreas = allAreas.filter((a) => a.project_id === proj.id);
    const overall = getProjectProgress(projAreas);
    html += `<div class="project"><div class="project-header"><span class="project-name">${proj.name}</span>`;
    if (proj.client) html += `<span class="client">${proj.client}</span>`;
    html += `<span class="progress-text">${overall}%</span></div>`;
    if (projAreas.length > 0) {
      html += `<table class="area-table"><thead><tr><th>Área</th><th>Progreso</th><th>Completados</th><th>Pendientes</th></tr></thead><tbody>`;
      projAreas.forEach((area) => {
        const prog = getAreaProgress(area);
        const doneStages = checklistStages.filter((s) => area[`stage_${s.id}`]);
        const pendingStages = checklistStages.filter((s) => !area[`stage_${s.id}`]);
        html += `<tr><td class="area-name">${area.name}</td><td><div class="bar-bg"><div class="bar-fill" style="width:${prog}%"></div></div> ${prog}%</td><td class="done">${doneStages.map((s) => s.icon + ' ' + s.label).join(', ') || '—'}</td><td class="pending">${pendingStages.map((s) => s.icon + ' ' + s.label).join(', ') || '—'}</td></tr>`;
        checklistStages.forEach((s) => { const comment = area[`comment_${s.id}`]; if (comment) { html += `<tr><td></td><td colspan="3" style="font-size:11px;color:#e6a23c;">💬 ${s.label}: ${comment}</td></tr>`; } });
      });
      html += `</tbody></table>`;
    } else { html += `<p style="color:#7a7a9a;font-size:12px;padding:8px;">Sin áreas</p>`; }
    html += `</div>`;
  });
  html += `<div class="footer">MS Producción — Reporte automático</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank'); if (w) w.onload = () => setTimeout(() => w.print(), 500);
}

export default function Dashboard({ projects, allAreas }) {
  const [expandedProject, setExpandedProject] = useState(null);
  const totalAreas = allAreas.length;
  const completedProjects = projects.filter((p) => { const pAreas = allAreas.filter((a) => a.project_id === p.id); return pAreas.length > 0 && getProjectProgress(pAreas) === 100; }).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>Panel general</h2>
        <Btn variant="secondary" onClick={() => generatePDFReport(projects, allAreas)}>📄 Reporte semanal PDF</Btn>
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
            const overall = getProjectProgress(projAreas);
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
                    {projAreas.length === 0 ? (<div style={{ fontSize: 13, color: 'var(--t2)' }}>Sin áreas todavía.</div>) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {projAreas.map((area) => {
                          const ap = getAreaProgress(area);
                          return (
                            <div key={area.id} style={{ background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', padding: 14 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{area.name}</span>
                                <span style={{ fontWeight: 700, fontSize: 13, color: ap === 100 ? '#2dcc9f' : '#7c6df0' }}>{ap}%</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 5 }}>
                                {checklistStages.map((stage) => {
                                  const done = area[`stage_${stage.id}`];
                                  const comment = area[`comment_${stage.id}`];
                                  return (
                                    <div key={stage.id} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 6, background: done ? stage.color + '12' : 'var(--surface)', border: `1px solid ${done ? stage.color + '30' : 'var(--border)'}` }}>
                                      <div style={{ fontSize: 14, marginBottom: 1 }}>{stage.icon}</div>
                                      <div style={{ fontSize: 9, fontWeight: 600, color: done ? stage.color : 'var(--t2)', lineHeight: 1.2 }}>{stage.label}</div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: done ? stage.color : 'var(--t2)', marginTop: 1 }}>{done ? '✓' : '○'}</div>
                                      {comment && <div style={{ fontSize: 8, color: '#f0a040', marginTop: 2 }} title={comment}>💬</div>}
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
