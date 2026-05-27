export const STAGES = [
  { id: 'diseno', label: 'Diseño', icon: '🎨', color: '#e86daa' },
  { id: 'revision_diseno', label: 'Revisión Diseño', icon: '🔍', color: '#a78bfa' },
  { id: 'creacion_partidas', label: 'Creación Partidas', icon: '📋', color: '#c084fc' },
  { id: 'req_materiales', label: 'Req. Materiales', icon: '📝', color: '#f59e0b' },
  { id: 'req_herrajes', label: 'Req. Herrajes', icon: '🔩', color: '#7a8599' },
  { id: 'req_sistema', label: 'Req. por Sistema', icon: '💻', color: '#0ea5e9' },
  { id: 'compra_materiales', label: 'Compra Materiales', icon: '🛒', color: '#14b8a6' },
  { id: 'modelado', label: 'Modelado 3D', icon: '🧊', color: '#7c6df0' },
  { id: 'planos', label: 'Planos', icon: '📐', color: '#818cf8' },
  { id: 'optimizacion', label: 'Optimización', icon: '📊', color: '#f0a040' },
  { id: 'corte', label: 'Corte', icon: '🪚', color: '#e6a23c' },
  { id: 'canteado', label: 'Canteado', icon: '📏', color: '#2dcc9f' },
  { id: 'supervision_canteado', label: 'Sup. Canteado', icon: '👁️', color: '#17a37a' },
  { id: 'mecanizado', label: 'Mecanizado', icon: '⚙️', color: '#4a9eff' },
  { id: 'ensamblaje', label: 'Ensamblaje', icon: '🔨', color: '#f09030' },
  { id: 'herrajes', label: 'Herrajes', icon: '🔩', color: '#9ca3af' },
  { id: 'supervision_ensamblaje', label: 'Sup. Ensamblaje', icon: '👁️', color: '#d97706' },
  { id: 'despacho_materiales', label: 'Despacho Mat.', icon: '🚚', color: '#06b6d4' },
  { id: 'embalaje', label: 'Embalaje', icon: '📦', color: '#20b8d0' },
  { id: 'instalacion', label: 'Instalación', icon: '🏠', color: '#7acc16' },
  { id: 'supervision_instalacion', label: 'Sup. Instalación', icon: '👁️', color: '#65a30d' },
  { id: 'despacho_admin', label: 'Despacho', icon: '💼', color: '#ec4899' },
  { id: 'mediciones', label: 'Mediciones', icon: '📐', color: '#0891b2' },
  { id: 'mantenimiento_maquinas', label: 'Mant. Máquinas', icon: '🔧', color: '#64748b' },
];

// Order in the checklist UI for each area
export const AREA_CHECKLIST_STAGES = [
  'diseno','revision_diseno','creacion_partidas',
  'req_materiales','req_herrajes','req_sistema','compra_materiales',
  'modelado','planos',
  'optimizacion','corte','canteado','supervision_canteado','mecanizado',
  'ensamblaje','herrajes','supervision_ensamblaje',
  'despacho_materiales','embalaje','instalacion','supervision_instalacion',
  'despacho_admin',
];

// Stage order index for sorting planning tasks
export const STAGE_ORDER = {};
AREA_CHECKLIST_STAGES.forEach((id, i) => { STAGE_ORDER[id] = i; });

export const READY_FOR_ASSEMBLY_STAGES = ['corte','canteado','mecanizado'];

export const MECANIZADO_OPTIONS = [
  'Bisagras','Tarugos','Cinta LED','Excéntricas',
  'Ranuras de gavetas','Ranurado','Perforaciones especiales','CNC custom',
];

// Per-material stages: Optimización, Corte, Canteado, Mecanizado require material
export const AUTO_PLANNING_PROCESSES = [
  { id: 'modelado',     label: 'Modelado 3D',  perMaterial: false },
  { id: 'planos',       label: 'Planos',        perMaterial: false },
  { id: 'optimizacion', label: 'Optimización',  perMaterial: true  },
  { id: 'corte',        label: 'Corte',         perMaterial: true  },
  { id: 'canteado',     label: 'Canteado',      perMaterial: true  },
  { id: 'mecanizado',   label: 'Mecanizado',    perMaterial: true  },
];

export const MATERIAL_PROCESSES = AUTO_PLANNING_PROCESSES.filter((p) => p.perMaterial);

export const PLANNING_STATUSES = [
  { id: 'blocked',     label: 'Bloqueado',  color: '#9ca3af' },
  { id: 'pending',     label: 'Pendiente',  color: '#7a8599' },
  { id: 'in_progress', label: 'En proceso', color: '#4a9eff' },
  { id: 'done',        label: 'Listo',      color: '#2dcc9f' },
];

// ─── Process dependencies (NEW FLOW) ───
// Each key is a stage; the array lists stages that MUST be done first.
// Empty array means the stage is unblocked from the start.
export const PROCESS_DEPENDENCIES = {
  diseno:                  [],
  revision_diseno:         ['diseno'],
  creacion_partidas:       ['diseno'],
  req_materiales:          ['revision_diseno'],
  req_herrajes:            ['revision_diseno'],
  req_sistema:             ['req_materiales','req_herrajes'],
  compra_materiales:       ['req_sistema'],
  modelado:                ['diseno'],
  planos:                  ['modelado'],
  optimizacion:            ['modelado'],
  corte:                   ['optimizacion'],           // Compra de materiales NO bloquea por defecto
  canteado:                ['corte'],
  supervision_canteado:    ['corte'],                  // Paralelo a canteado: se desbloquea cuando arranca canteado
  mecanizado:              ['canteado'],
  ensamblaje:              ['mecanizado'],
  herrajes:                ['mecanizado'],
  supervision_ensamblaje:  ['ensamblaje'],
  despacho_materiales:     ['ensamblaje'],
  embalaje:                ['ensamblaje'],
  instalacion:             ['embalaje'],
  supervision_instalacion: ['embalaje'],
  despacho_admin:          ['instalacion'],
  mediciones:              [],                         // Cada miércoles, sin dependencia
  mantenimiento_maquinas:  [],
};

export const PROCESS_SUCCESSORS = {};
Object.entries(PROCESS_DEPENDENCIES).forEach(([proc, deps]) => {
  deps.forEach((dep) => {
    if (!PROCESS_SUCCESSORS[dep]) PROCESS_SUCCESSORS[dep] = [];
    if (!PROCESS_SUCCESSORS[dep].includes(proc)) PROCESS_SUCCESSORS[dep].push(proc);
  });
});

// Each member's full list of processes (primary listed first in this object).
// Order doesn't carry meaning anymore — PROCESS_PRIMARY_OWNER is the source of truth.
export const DEFAULT_STAFF_PROCESSES = {
  AS: ['diseno','creacion_partidas'],
  AV: ['revision_diseno','req_materiales','req_herrajes','supervision_ensamblaje','supervision_instalacion','mediciones'],
  DJ: ['modelado','optimizacion','corte','mecanizado','despacho_materiales','supervision_ensamblaje'],
  GF: ['supervision_canteado','optimizacion','despacho_materiales','mecanizado','corte'],
  AL: ['planos','modelado','corte'],
  AA: ['canteado','mantenimiento_maquinas'],
  CC: ['ensamblaje','embalaje','instalacion','herrajes'],
  YC: ['req_sistema','compra_materiales','despacho_admin'],
};

// Process → primary responsible. Auxiliaries only receive tasks if manually assigned.
export const PROCESS_PRIMARY_OWNER = {
  diseno: 'AS',
  revision_diseno: 'AV',
  creacion_partidas: 'AS',
  req_materiales: 'AV',
  req_herrajes: 'AV',
  req_sistema: 'YC',
  compra_materiales: 'YC',
  modelado: 'AL',            // AL primary, DJ auxiliary
  planos: 'AL',
  optimizacion: 'GF',        // GF primary, DJ auxiliary
  corte: 'GF',               // GF primary, AL auxiliary
  canteado: 'AA',
  supervision_canteado: 'GF',
  mecanizado: 'GF',          // GF primary, DJ auxiliary
  ensamblaje: 'CC',
  herrajes: 'CC',
  supervision_ensamblaje: 'DJ',  // DJ primary, AV auxiliary
  despacho_materiales: 'GF',     // GF primary, DJ auxiliary
  embalaje: 'CC',
  instalacion: 'CC',
  supervision_instalacion: 'AV',
  despacho_admin: 'YC',
  mediciones: 'AV',
  mantenimiento_maquinas: 'AA',
};

// Staff who can see ALL personal plannings (managers)
export const MANAGER_CODES = ['AS','AV','DJ'];

export const PROJECT_COLORS = [
  '#7c6df0','#4a9eff','#2dcc9f','#e6a23c','#f06060',
  '#e86daa','#20b8d0','#7acc16','#f09030','#a78bfa',
  '#06b6d4','#84cc16','#f59e0b','#ec4899','#8b5cf6',
];

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
