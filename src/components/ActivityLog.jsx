import { useState } from 'react';
import { Btn, Badge } from './UI.jsx';
import { STAGES } from '../lib/constants.js';
import { useActivityLog } from '../hooks/useSupabase.js';

export default function ActivityLog({ projects }) {
  const [filterProject, setFilterProject] = useState('');
  const { data: logs, loading } = useActivityLog(filterProject || null);

  const projectMap = {};
  projects.forEach((p) => { projectMap[p.id] = p.name; });

  function formatDate(iso) {
    const d = new Date(iso);
    const date = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
  }

  const actionIcons = {
    project_created: '📋',
    area_created: '📐',
    stage_completed: '✅',
    stage_unchecked: '↩️',
    mecanizado_toggled: '⚙️',
    comment_added: '💬',
    furniture_added: '🪑',
    image_uploaded: '📷',
    task_created: '📅',
    task_status_changed: '🔄',
  };

  // Group by date
  const grouped = {};
  logs.forEach((log) => {
    const { date } = formatDate(log.created_at);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(log);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em' }}>
            Historial
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t2)' }}>
            Registro de trabajo con fecha y hora
          </p>
        </div>
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1.5px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--t1)',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--t2)' }}>Cargando...</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--t2)' }}>
          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>📝</div>
          <div style={{ fontSize: 14 }}>Sin actividad registrada aún.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(grouped).map(([date, entries]) => (
            <div key={date}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--t2)',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {date}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {entries.map((log) => {
                  const { time } = formatDate(log.created_at);
                  const stageInfo = log.stage ? STAGES.find((s) => s.id === log.stage) : null;
                  return (
                    <div key={log.id} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                        {actionIcons[log.action] || '📌'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.4 }}>{log.description}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 11, color: 'var(--t2)' }}>
                          {log.user_name && <span>👤 {log.user_name}</span>}
                          {log.project_id && <span>📋 {projectMap[log.project_id] || ''}</span>}
                          {stageInfo && <Badge color={stageInfo.color}>{stageInfo.label}</Badge>}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--t2)', flexShrink: 0, fontWeight: 500 }}>{time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
