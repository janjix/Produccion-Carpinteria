import { ProgressBar, Badge } from './UI.jsx';
import { STAGES } from '../lib/constants.js';

function getAreaProgress(area) {
  let total = 0;
  let completed = 0;
  STAGES.forEach((s) => {
    total++;
    if (area[`stage_${s.id}`]) completed++;
  });
  return Math.round((completed / total) * 100);
}

function getProjectProgress(projectAreas) {
  if (!projectAreas.length) return 0;
  return Math.round(projectAreas.reduce((s, a) => s + getAreaProgress(a), 0) / projectAreas.length);
}

function getStageProgress(projectAreas, stageId) {
  if (!projectAreas.length) return 0;
  const done = projectAreas.filter((a) => a[`stage_${stageId}`]).length;
  return Math.round((done / projectAreas.length) * 100);
}

export default function Dashboard({ projects, allAreas }) {
  const totalAreas = allAreas.length;
  const completedProjects = projects.filter((p) => {
    const pAreas = allAreas.filter((a) => a.project_id === p.id);
    return pAreas.length > 0 && getProjectProgress(pAreas) === 100;
  }).length;

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>
        Panel general
      </h2>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Proyectos', value: projects.length, color: '#7c6df0' },
          { label: 'Completados', value: completedProjects, color: '#2dcc9f' },
          { label: 'En proceso', value: projects.length - completedProjects, color: '#e6a23c' },
          { label: 'Total áreas', value: totalAreas, color: '#4a9eff' },
        ].map((c) => (
          <div key={c.label} style={{
            background: 'var(--surface)',
            borderRadius: 10,
            border: '1px solid var(--border)',
            padding: 16,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--t2)' }}>
          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>📊</div>
          <div style={{ fontSize: 14 }}>Crea proyectos para ver el panel de seguimiento.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {projects.map((proj) => {
            const projAreas = allAreas.filter((a) => a.project_id === proj.id);
            const overall = getProjectProgress(projAreas);
            return (
              <div key={proj.id} style={{
                background: 'var(--surface)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                padding: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{proj.name}</span>
                    {proj.client && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--t2)' }}>{proj.client}</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: overall === 100 ? '#2dcc9f' : '#7c6df0' }}>
                    {overall}%
                  </span>
                </div>

                {/* Stage grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(85px, 1fr))', gap: 6 }}>
                  {STAGES.map((stage) => {
                    const prog = getStageProgress(projAreas, stage.id);
                    return (
                      <div key={stage.id} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'var(--bg)' }}>
                        <div style={{ fontSize: 16, marginBottom: 2 }}>{stage.icon}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t2)', marginBottom: 4, lineHeight: 1.2 }}>{stage.label}</div>
                        <ProgressBar value={prog} color={stage.color} height={4} />
                        <div style={{ fontSize: 11, fontWeight: 700, color: stage.color, marginTop: 2 }}>{prog}%</div>
                      </div>
                    );
                  })}
                </div>

                {/* Area breakdown */}
                {projAreas.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>Por área:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {projAreas.map((area) => {
                        const ap = getAreaProgress(area);
                        return (
                          <div key={area.id} style={{ flex: '1 1 150px', padding: '6px 10px', borderRadius: 6, background: 'var(--hover)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span style={{ fontWeight: 600 }}>{area.name}</span>
                              <span style={{ color: 'var(--t2)' }}>{ap}%</span>
                            </div>
                            <ProgressBar value={ap} height={3} color="#7c6df0" />
                          </div>
                        );
                      })}
                    </div>
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
