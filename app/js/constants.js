export const APP_VERSION = '2.0.0';

// Sincronización (Supabase). La clave "publishable/anon" es pública por diseño:
// los datos quedan protegidos por usuario (Row Level Security en la tabla `records`).
export const SYNC = { url: '', key: '' };

export const INVEST_KINDS = {
  plazo_fijo: { label: 'Plazo fijo', icon: 'lock', color: '#00E5FF' },
  fci:        { label: 'Fondo común (FCI)', icon: 'chart-line', color: '#2F7BFF' },
  acciones:   { label: 'Acciones', icon: 'trending-up', color: '#7CFFCB' },
  cedears:    { label: 'CEDEARs', icon: 'globe', color: '#5CC8FF' },
  bonos:      { label: 'Bonos / ONs', icon: 'scroll-text', color: '#94A3FF' },
  cripto:     { label: 'Cripto', icon: 'bitcoin', color: '#C084FC' },
  dolares:    { label: 'Dólares', icon: 'dollar-sign', color: '#2EF2A0' },
  otro:       { label: 'Otra', icon: 'gem', color: '#FFB547' },
};

export const GOAL_ICONS = [
  'target', 'plane', 'tree-palm', 'car', 'house', 'sofa', 'laptop', 'smartphone', 'graduation-cap', 'gift',
  'heart', 'baby', 'paw-print', 'umbrella', 'shield-check', 'trophy', 'gem', 'piggy-bank', 'music', 'dumbbell', 'party-popper',
];

export const ACCOUNT_TYPES = {
  cash:    { label: 'Efectivo',           icon: 'wallet' },
  bank:    { label: 'Banco',              icon: 'landmark' },
  wallet:  { label: 'Billetera virtual',  icon: 'smartphone' },
  credit:  { label: 'Tarjeta de crédito', icon: 'credit-card' },
  savings: { label: 'Ahorro',             icon: 'piggy-bank' },
};

export const COLORS = [
  '#00E5FF', '#2F7BFF', '#5CC8FF', '#8B93FF', '#94A3FF', '#C084FC', '#FF8FB8',
  '#FF5C7A', '#FF9F6B', '#FFB547', '#FFE066', '#2EF2A0', '#7CFFCB', '#8A9AA8',
];

export const CATEGORY_ICONS = [
  'shopping-cart', 'shopping-bag', 'utensils', 'coffee', 'pizza', 'beer', 'car',
  'bus', 'fuel', 'plane', 'house', 'sofa', 'wrench', 'zap',
  'droplet', 'flame', 'wifi', 'smartphone', 'tv', 'laptop', 'heart-pulse',
  'pill', 'stethoscope', 'dumbbell', 'film', 'gamepad-2', 'music', 'ticket',
  'shirt', 'scissors', 'book-open', 'graduation-cap', 'repeat', 'gift', 'paw-print',
  'baby', 'receipt', 'landmark', 'percent', 'briefcase', 'store', 'trending-up',
  'hand-coins', 'banknote', 'piggy-bank', 'rotate-ccw', 'sparkles', 'palette', 'shapes',
];

export const DEFAULT_CATEGORIES = {
  expense: [
    ['Supermercado', 'shopping-cart', '#00E5FF'],
    ['Comida y salidas', 'utensils', '#FFB547'],
    ['Transporte', 'car', '#8B93FF'],
    ['Hogar', 'house', '#2EF2A0'],
    ['Servicios', 'zap', '#FFE066'],
    ['Salud', 'heart-pulse', '#FF5C7A'],
    ['Ocio', 'film', '#C084FC'],
    ['Ropa', 'shirt', '#FF8FB8'],
    ['Educación', 'book-open', '#5CC8FF'],
    ['Suscripciones', 'repeat', '#94A3FF'],
    ['Regalos', 'gift', '#FF9F6B'],
    ['Mascotas', 'paw-print', '#7CFFCB'],
    ['Impuestos', 'receipt', '#2F7BFF'],
    ['Otros', 'shapes', '#8A9AA8'],
  ],
  income: [
    ['Sueldo', 'briefcase', '#2EF2A0'],
    ['Ventas', 'store', '#00E5FF'],
    ['Rendimientos', 'trending-up', '#7CFFCB'],
    ['Reintegros', 'rotate-ccw', '#5CC8FF'],
    ['Otros ingresos', 'sparkles', '#8A9AA8'],
  ],
};

export const DEFAULT_ACCOUNTS = [
  { name: 'Efectivo', type: 'cash', on: true },
  { name: 'Banco', type: 'bank', on: true },
  { name: 'Billetera virtual', type: 'wallet', on: true },
  { name: 'Tarjeta de crédito', type: 'credit', on: false },
];
