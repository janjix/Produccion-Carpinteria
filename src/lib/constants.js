export const STAGES = [
  { id: 'modelado', label: 'Modelado 3D', icon: '🧊', color: '#7c6df0' },
  { id: 'planos', label: 'Planos', icon: '📐', color: '#a78bfa' },
  { id: 'corte', label: 'Corte', icon: '🪚', color: '#e6a23c' },
  { id: 'canteado', label: 'Canteado', icon: '📏', color: '#2dcc9f' },
  { id: 'mecanizado', label: 'Mecanizado', icon: '⚙️', color: '#4a9eff' },
  { id: 'qc', label: 'Control Calidad', icon: '✅', color: '#f06060' },
  { id: 'acabados', label: 'Acabados', icon: '🎨', color: '#e86daa' },
  { id: 'herrajes', label: 'Herrajes', icon: '🔩', color: '#7a8599' },
  { id: 'ensamblaje', label: 'Ensamblaje', icon: '🔨', color: '#f09030' },
  { id: 'embalaje', label: 'Embalaje', icon: '📦', color: '#20b8d0' },
  { id: 'instalacion', label: 'Instalación', icon: '🏠', color: '#7acc16' },
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

export const PLANNING_STATUSES = [
  { id: 'pending', label: 'Pendiente', color: '#7a8599' },
  { id: 'in_progress', label: 'En proceso', color: '#4a9eff' },
  { id: 'blocked', label: 'Bloqueado', color: '#f06060' },
  { id: 'done', label: 'Listo', color: '#2dcc9f' },
];
