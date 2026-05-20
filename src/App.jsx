import { useState, useEffect } from 'react';
import { useProjects, useRealtimeTable } from './hooks/useSupabase.js';
import ProjectsList from './components/ProjectsList.jsx';
import ProjectDetail from './components/ProjectDetail.jsx';
import Dashboard from './components/Dashboard.jsx';
import Planning from './components/Planning.jsx';
import ActivityLog from './components/ActivityLog.jsx';

const VIEWS = [
  { id: 'projects', label: 'Proyectos', icon: '📋' },
  { id: 'dashboard', label: 'Panel', icon: '📊' },
  { id: 'planning', label: 'Planificación', icon: '📅' },
  { id: 'activity', label: 'Historial', icon: '📝' },
];

export default function App() {
  const [view, setView] = useState('projects');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [userName, setUserName] = useState(() => localStorage.getItem('ms_user') || '');
  const [showNameInput, setShowNameInput] = useState(false);

  const { data: projects } = useProjects();
  const { data: allAreas } = useRealtimeTable('areas', 'sort_order');

  useEffect(() => {
    if (!userName) setShowNameInput(true);
  }, []);

  function saveName(name) {
    setUserName(name);
    localStorage.setItem('ms_user', name);
    setShowNameInput(false);
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  function handleSelectProject(id) {
    setSelectedProjectId(id);
    setView('detail');
  }

  function handleBack() {
    setSelectedProjectId(null);
    setView('projects');
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--t1)',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Name prompt overlay */}
      {showNameInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 16, padding: 32,
            width: '90%', maxWidth: 360, border: '1px solid var(--border)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8, textAlign: 'center' }}>🪚</div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, textAlign: 'center', color: 'var(--t1)' }}>
              MS Producción
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--t2)', textAlign: 'center' }}>
              Ingresa tu nombre para registrar la actividad
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const input = e.target.elements.name;
              if (input.value.trim()) saveName(input.value.trim());
            }}>
              <input
                name="name"
                autoFocus
                placeholder="Tu nombre"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1.5px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--t1)', fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 12,
                }}
              />
              <button type="submit" style={{
                width: '100%', padding: '10px 0', borderRadius: 8,
                background: '#7c6df0', color: '#fff', fontWeight: 700,
                fontSize: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Entrar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🪚</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--t1)', letterSpacing: '-0.02em' }}>
            MS Producción
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => { setView(v.id); setSelectedProjectId(null); }}
              style={{
                padding: '6px 12px', borderRadius: 6, border: 'none',
                background: view === v.id || (v.id === 'projects' && view === 'detail') ? '#7c6df015' : 'transparent',
                color: view === v.id || (v.id === 'projects' && view === 'detail') ? '#7c6df0' : 'var(--t2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span>{v.icon}</span>
              <span className="nav-label">{v.label}</span>
            </button>
          ))}
        </div>
        {userName && (
          <button
            onClick={() => setShowNameInput(true)}
            style={{
              background: 'var(--hover)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600,
              color: 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            👤 {userName}
          </button>
        )}
      </header>

      {/* Content */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: 20 }}>
        {view === 'projects' && (
          <ProjectsList
            projects={projects}
            allAreas={allAreas}
            onSelect={handleSelectProject}
            userName={userName}
          />
        )}
        {view === 'detail' && selectedProject && (
          <ProjectDetail
            project={selectedProject}
            onBack={handleBack}
            userName={userName}
          />
        )}
        {view === 'dashboard' && (
          <Dashboard projects={projects} allAreas={allAreas} />
        )}
        {view === 'planning' && (
          <Planning projects={projects} allAreas={allAreas} userName={userName} />
        )}
        {view === 'activity' && (
          <ActivityLog projects={projects} />
        )}
      </main>
    </div>
  );
}
