import React, { useState, useEffect, Component } from 'react';
import { useProjects, useRealtimeTable, useStaff } from './hooks/useSupabase.js';
import ProjectsList from './components/ProjectsList.jsx';
import ProjectDetail from './components/ProjectDetail.jsx';
import Dashboard from './components/Dashboard.jsx';
import Planning from './components/Planning.jsx';
import ActivityLog from './components/ActivityLog.jsx';
import StaffView from './components/StaffView.jsx';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#e8e9ed', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#f06060' }}>Error en la aplicación</h2>
          <pre style={{ background: '#181a24', padding: 16, borderRadius: 8, marginTop: 16, textAlign: 'left', fontSize: 12, overflow: 'auto', maxWidth: 600, margin: '16px auto', color: '#e6a23c' }}>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: '#7c6df0', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const VIEWS = [
  { id: 'projects', label: 'Proyectos', icon: '📋' },
  { id: 'dashboard', label: 'Panel', icon: '📊' },
  { id: 'planning', label: 'Planificación', icon: '📅' },
  { id: 'staff', label: 'Personal', icon: '👥' },
  { id: 'activity', label: 'Historial', icon: '📝' },
];

export default function App() {
  const [view, setView] = useState('projects');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [currentStaffId, setCurrentStaffId] = useState(() => localStorage.getItem('ms_staff_id') || '');
  const [currentStaffName, setCurrentStaffName] = useState(() => localStorage.getItem('ms_staff_name') || '');
  const [showLogin, setShowLogin] = useState(false);

  const { data: projects } = useProjects();
  const { data: allAreas } = useRealtimeTable('areas', 'sort_order');
  const { data: staff } = useStaff();
  const { data: planningTasks } = useRealtimeTable('planning_tasks', 'priority');

  useEffect(() => { if (!currentStaffId) setShowLogin(true); }, []);

  function selectStaff(member) {
    setCurrentStaffId(member.id);
    setCurrentStaffName(member.name);
    localStorage.setItem('ms_staff_id', member.id);
    localStorage.setItem('ms_staff_name', member.name);
    setShowLogin(false);
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <ErrorBoundary>
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--t1)', fontFamily: "'DM Sans', sans-serif" }}>
      {showLogin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(8px)' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 32, width: '90%', maxWidth: 400, border: '1px solid var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 28, marginBottom: 8, textAlign: 'center' }}>🪚</div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, textAlign: 'center', color: 'var(--t1)' }}>MS Producción</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--t2)', textAlign: 'center' }}>Selecciona tu usuario</p>
            {staff.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--t2)' }}>Cargando personal...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {staff.map((m) => (
                  <button key={m.id} onClick={() => selectStaff(m)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                      borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: 8, background: m.color + '20', color: m.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0,
                    }}>{m.code}</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t2)' }}>{m.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🪚</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--t1)', letterSpacing: '-0.02em' }}>MS Producción</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => { setView(v.id); setSelectedProjectId(null); }}
              style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: view === v.id || (v.id === 'projects' && view === 'detail') ? '#7c6df015' : 'transparent', color: view === v.id || (v.id === 'projects' && view === 'detail') ? '#7c6df0' : 'var(--t2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{v.icon}</span><span className="nav-label">{v.label}</span>
            </button>
          ))}
        </div>
        {currentStaffName && (
          <button onClick={() => setShowLogin(true)} style={{ background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            👤 {currentStaffName}
          </button>
        )}
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
        {view === 'projects' && <ProjectsList projects={projects} allAreas={allAreas} onSelect={(id) => { setSelectedProjectId(id); setView('detail'); }} userName={currentStaffName} />}
        {view === 'detail' && selectedProject && <ProjectDetail project={selectedProject} onBack={() => { setSelectedProjectId(null); setView('projects'); }} userName={currentStaffName} planningTasks={planningTasks} />}
        {view === 'dashboard' && <Dashboard projects={projects} allAreas={allAreas} planningTasks={planningTasks} />}
        {view === 'planning' && <Planning projects={projects} allAreas={allAreas} userName={currentStaffName} />}
        {view === 'staff' && <StaffView projects={projects} allAreas={allAreas} userName={currentStaffName} currentStaff={staff.find((m) => m.id === currentStaffId) || null} />}
        {view === 'activity' && <ActivityLog projects={projects} />}
      </main>
    </div>
    </ErrorBoundary>
  );
}
