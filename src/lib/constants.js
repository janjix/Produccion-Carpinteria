export const STAGES = [
  { id: 'diseno', label: 'Diseño', icon: '🎨', color: '#e86daa' },
  { id: 'revision_diseno', label: 'Revisión Diseño', icon: '🔍', color: '#a78bfa' },
  { id: 'creacion_partidas', label: 'Creación Partidas', icon: '📋', color: '#c084fc' },
  { id: 'modelado', label: 'Modelado 3D', icon: '🧊', color: '#7c6df0' },
  { id: 'planos', label: 'Planos', icon: '📐', color: '#818cf8' },
  { id: 'req_materiales', label: 'Req. Materiales', icon: '📝', color: '#f59e0b' },
  { id: 'req_herrajes', label: 'Req. Herrajes', icon: '🔩', color: '#7a8599' },
  { id: 'optimizacion', label: 'Optimización', icon: '📊', color: '#f0a040' },
  { id: 'corte', label: 'Corte', icon: '🪚', color: '#e6a23c' },
  { id: 'canteado', label: 'Canteado', icon: '📏', color: '#2dcc9f' },
  { id: 'supervision_canteado', label: 'Sup. Canteado', icon: '👁️', color: '#17a37a' },
  { id: 'mecanizado', label: 'Mecanizado', icon: '⚙️', color: '#4a9eff' },
  { id: 'qc', label: 'Control Calidad', icon: '✅', color: '#f06060' },
  { id: 'herrajes', label: 'Herrajes', icon: '🔩', color: '#9ca3af' },
  { id: 'ensamblaje', label: 'Ensamblaje', icon: '🔨', color: '#f09030' },
  { id: 'supervision_ensamblaje', label: 'Sup. Ensamblaje', icon: '👁️', color: '#d97706' },
  { id: 'despacho_materiales', label: 'Despacho Mat.', icon: '🚚', color: '#06b6d4' },
  { id: 'embalaje', label: 'Embalaje', icon: '📦', color: '#20b8d0' },
  { id: 'instalacion', label: 'Instalación', icon: '🏠', color: '#7acc16' },
  { id: 'supervision_instalacion', label: 'Sup. Instalación', icon: '👁️', color: '#65a30d' },
  { id: 'mediciones', label: 'Mediciones', icon: '📐', color: '#0891b2' },
  { id: 'despacho_admin', label: 'Despacho', icon: '💼', color: '#ec4899' },
  { id: 'mantenimiento_maquinas', label: 'Mant. Máquinas', icon: '🔧', color: '#64748b' },
];

export const AREA_CHECKLIST_STAGES = [
  'diseno','revision_diseno','creacion_partidas','modelado','planos',
  'req_materiales','req_herrajes','optimizacion',
  'corte','canteado','supervision_canteado','mecanizado',
  'qc','herrajes','ensamblaje','supervision_ensamblaje',
  'despacho_materiales','embalaje','instalacion',
  'supervision_instalacion','mediciones','despacho_admin',
];

// Stage order index for sorting planning tasks
export const STAGE_ORDER = {};
AREA_CHECKLIST_STAGES.forEach((id, i) => { STAGE_ORDER[id] = i; });

export const READY_FOR_ASSEMBLY_STAGES = ['corte','canteado','mecanizado'];
export const MECANIZADO_OPTIONS = [
  'Bisagras','Tarugos','Cinta LED','Excéntricas',
  'Ranuras de gavetas','Ranurado','Perforaciones especiales','CNC custom',
];

// Optimización is ALWAYS per material — no task without material makes sense
export const AUTO_PLANNING_PROCESSES = [
  { id: 'modelado',     label: 'Modelado 3D',  perMaterial: false },
  { id: 'planos',       label: 'Planos',        perMaterial: false },
  { id: 'optimizacion', label: 'Optimización',  perMaterial: true  }, // requires material
  { id: 'corte',        label: 'Corte',         perMaterial: true  },
  { id: 'canteado',     label: 'Canteado',      perMaterial: true  },
  { id: 'mecanizado',   label: 'Mecanizado',    perMaterial: true  },
];

export const PLANNING_STATUSES = [
  { id: 'pending',     label: 'Pendiente',  color: '#7a8599' },
  { id: 'in_progress', label: 'En proceso', color: '#4a9eff' },
  { id: 'done',        label: 'Listo',      color: '#2dcc9f' },
];

export const PROCESS_DEPENDENCIES = {
  revision_diseno:        ['diseno'],
  creacion_partidas:      ['diseno'],
  modelado:               ['revision_diseno'],
  planos:                 ['modelado'],
  req_materiales:         ['modelado'],
  req_herrajes:           ['modelado'],
  optimizacion:           ['modelado'],
  corte:                  ['optimizacion'],
  canteado:               ['corte'],
  supervision_canteado:   ['canteado'],
  mecanizado:             ['canteado'],
  qc:                     ['mecanizado'],
  herrajes:               ['qc'],
  ensamblaje:             ['qc','herrajes'],
  supervision_ensamblaje: ['ensamblaje'],
  despacho_materiales:    ['ensamblaje'],
  embalaje:               ['ensamblaje'],
  instalacion:            ['embalaje'],
  supervision_instalacion:['instalacion'],
  mediciones:             ['instalacion'],
  despacho_admin:         ['instalacion'],
  mantenimiento_maquinas: [],
};

export const PROCESS_SUCCESSORS = {};
Object.entries(PROCESS_DEPENDENCIES).forEach(([proc, deps]) => {
  deps.forEach((dep) => {
    if (!PROCESS_SUCCESSORS[dep]) PROCESS_SUCCESSORS[dep] = [];
    if (!PROCESS_SUCCESSORS[dep].includes(proc)) PROCESS_SUCCESSORS[dep].push(proc);
  });
});

export const DEFAULT_STAFF_PROCESSES = {
  AS: ['diseno','creacion_partidas'],
  AV: ['revision_diseno','req_materiales','req_herrajes','mediciones','supervision_instalacion','creacion_partidas','qc'],
  DJ: ['modelado','optimizacion','supervision_ensamblaje','qc'],
  GF: ['supervision_canteado','optimizacion','despacho_materiales','mecanizado'],
  AL: ['planos','modelado'],
  AA: ['canteado','mantenimiento_maquinas'],
  CC: ['ensamblaje','corte','embalaje','instalacion','herrajes'],
  YC: ['despacho_admin'],
};

// Staff who can see ALL personal plannings (managers)
export const MANAGER_CODES = ['AS','AV','DJ'];

export const PROJECT_COLORS = [
  '#7c6df0','#4a9eff','#2dcc9f','#e6a23c','#f06060',
  '#e86daa','#20b8d0','#7acc16','#f09030','#a78bfa',
  '#06b6d4','#84cc16','#f59e0b','#ec4899','#8b5cf6',
];

// Material palette — each material gets a consistent color across all views
export const MATERIAL_COLORS = [
  '#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444',
  '#f97316','#06b6d4','#84cc16','#ec4899','#6366f1',
];

export const DAYS_OF_WEEK = [
  { id: 1, label: 'Lunes',     short: 'Lun' },
  { id: 2, label: 'Martes',    short: 'Mar' },
  { id: 3, label: 'Miércoles', short: 'Mié' },
  { id: 4, label: 'Jueves',    short: 'Jue' },
  { id: 5, label: 'Viernes',   short: 'Vie' },
  { id: 6, label: 'Sábado',    short: 'Sáb' },
];
