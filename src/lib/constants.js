export const STAGES = [
  { id: 'diseno', label: 'Diseño', icon: '🎨', color: '#e86daa' },
  { id: 'revision_diseno', label: 'Revisión Diseño', icon: '🔍', color: '#a78bfa' },
  { id: 'creacion_partidas', label: 'Creación Partidas', icon: '📋', color: '#c084fc' },
  { id: 'modelado', label: 'Modelado 3D', icon: '🧊', color: '#7c6df0' },
  { id: 'planos', label: 'Planos', icon: '📐', color: '#818cf8' },
  { id: 'optimizacion', label: 'Optimización', icon: '📊', color: '#f0a040' },
  { id: 'req_materiales', label: 'Req. Materiales', icon: '📝', color: '#f59e0b' },
  { id: 'req_herrajes', label: 'Req. Herrajes', icon: '🔩', color: '#7a8599' },
  { id: 'corte', label: 'Corte', icon: '🪚', color: '#e6a23c' },
  { id: 'canteado', label: 'Canteado', icon: '📏', color: '#2dcc9f' },
  { id: 'mecanizado', label: 'Mecanizado', icon: '⚙️', color: '#4a9eff' },
  { id: 'qc', label: 'Control Calidad', icon: '✅', color: '#f06060' },
  { id: 'herrajes', label: 'Herrajes', icon: '🔩', color: '#7a8599' },
  { id: 'ensamblaje', label: 'Ensamblaje', icon: '🔨', color: '#f09030' },
  { id: 'embalaje', label: 'Embalaje', icon: '📦', color: '#20b8d0' },
  { id: 'instalacion', label: 'Instalación', icon: '🏠', color: '#7acc16' },
  { id: 'mediciones', label: 'Mediciones', icon: '📏', color: '#06b6d4' },
  { id: 'supervision_instalacion', label: 'Sup. Instalación', icon: '👁️', color: '#84cc16' },
  { id: 'supervision_ensamblaje', label: 'Sup. Ensamblaje', icon: '👁️', color: '#f09030' },
  { id: 'supervision_canteado', label: 'Sup. Canteado', icon: '👁️', color: '#2dcc9f' },
  { id: 'despacho_materiales', label: 'Despacho Mat.', icon: '🚚', color: '#06b6d4' },
  { id: 'mantenimiento_maquinas', label: 'Mant. Máquinas', icon: '🔧', color: '#64748b' },
  { id: 'despacho_admin', label: 'Despacho', icon: '💼', color: '#ec4899' },
];

// Stages that appear in the area-level checklist (production flow)
export const AREA_CHECKLIST_STAGES = [
  'diseno', 'revision_diseno', 'creacion_partidas', 'modelado', 'planos',
  'optimizacion', 'req_materiales', 'req_herrajes', 'corte', 'canteado',
  'mecanizado', 'qc', 'herrajes', 'ensamblaje', 'embalaje', 'instalacion',
  'despacho_admin',
];

export const READY_FOR_ASSEMBLY_STAGES = ['corte', 'canteado', 'mecanizado'];

export const MECANIZADO_OPTIONS = [
  'Bisagras',
  'Tarugos',
  'Cinta LED',
  'Excéntricas',
  'Ranuras de gavetas',
  'Ranurado',
  'Perforaciones especiales',
  'CNC custom',
];

// Processes auto-generated in planning per area per material
export const AUTO_PLANNING_PROCESSES = [
  { id: 'modelado', label: 'Modelado 3D' },
  { id: 'planos', label: 'Planos' },
  { id: 'optimizacion', label: 'Optimización' },
  { id: 'corte', label: 'Corte' },
  { id: 'canteado', label: 'Canteado' },
  { id: 'mecanizado', label: 'Mecanizado' },
];

export const PLANNING_STATUSES = [
  { id: 'pending', label: 'Pendiente', color: '#7a8599' },
  { id: 'in_progress', label: 'En proceso', color: '#4a9eff' },
  { id: 'blocked', label: 'Bloqueado', color: '#f06060' },
  { id: 'done', label: 'Listo', color: '#2dcc9f' },
];

// Process dependencies: process -> what must come before it
export const PROCESS_DEPENDENCIES = {
  revision_diseno: ['diseno'],
  creacion_partidas: ['diseno'],
  modelado: ['revision_diseno'],
  planos: ['modelado'],
  optimizacion: ['modelado'],
  req_materiales: ['optimizacion'],
  req_herrajes: ['optimizacion'],
  corte: ['optimizacion'],
  canteado: ['corte'],
  mecanizado: ['canteado'],
  qc: ['mecanizado'],
  ensamblaje: ['qc', 'herrajes'],
  supervision_ensamblaje: ['ensamblaje'],
  embalaje: ['ensamblaje'],
  instalacion: ['embalaje'],
  mediciones: ['instalacion'],
  supervision_instalacion: ['instalacion'],
  despacho_materiales: ['ensamblaje'],
  supervision_canteado: ['canteado'],
  mantenimiento_maquinas: [],
  despacho_admin: ['instalacion'],
};

// Reverse map: when process X completes, which processes should be triggered?
export const PROCESS_SUCCESSORS = {};
Object.entries(PROCESS_DEPENDENCIES).forEach(([proc, deps]) => {
  deps.forEach((dep) => {
    if (!PROCESS_SUCCESSORS[dep]) PROCESS_SUCCESSORS[dep] = [];
    PROCESS_SUCCESSORS[dep].push(proc);
  });
});

// Default staff assignments
export const DEFAULT_STAFF_PROCESSES = {
  AS: ['diseno', 'creacion_partidas'],
  AV: ['revision_diseno', 'req_materiales', 'req_herrajes', 'mediciones', 'supervision_instalacion', 'creacion_partidas', 'qc'],
  DJ: ['modelado', 'optimizacion', 'supervision_ensamblaje', 'qc'],
  GF: ['supervision_canteado', 'optimizacion', 'despacho_materiales', 'mecanizado'],
  AL: ['planos', 'modelado'],
  AA: ['canteado', 'mantenimiento_maquinas'],
  CC: ['ensamblaje', 'corte', 'embalaje', 'instalacion', 'herrajes'],
  YC: ['despacho_admin'],
};

// Project colors for visual grouping
export const PROJECT_COLORS = [
  '#7c6df0', '#4a9eff', '#2dcc9f', '#e6a23c', '#f06060',
  '#e86daa', '#20b8d0', '#7acc16', '#f09030', '#a78bfa',
  '#06b6d4', '#84cc16', '#f59e0b', '#ec4899', '#8b5cf6',
];

export const DAYS_OF_WEEK = [
  { id: 1, label: 'Lunes', short: 'Lun' },
  { id: 2, label: 'Martes', short: 'Mar' },
  { id: 3, label: 'Miércoles', short: 'Mié' },
  { id: 4, label: 'Jueves', short: 'Jue' },
  { id: 5, label: 'Viernes', short: 'Vie' },
  { id: 6, label: 'Sábado', short: 'Sáb' },
];
