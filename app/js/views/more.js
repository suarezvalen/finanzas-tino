// Pantalla "Más": acceso a todas las secciones.
import { accounts, categories, recurrings } from '../store.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { openAccounts } from '../sheets/accounts.js';
import { openCategories } from '../sheets/categories.js';
import { openSettings } from '../sheets/settings.js';
import { openCards } from '../sheets/cards.js';
import { openBudgets } from '../sheets/budgets.js';
import { openRecurring } from '../sheets/recurring.js';
import { openUpcoming } from '../sheets/upcoming.js';
import { upcomingItems } from '../logic/recurring.js';
import { openInvestments } from '../sheets/investments.js';
import { openGoals } from '../sheets/goals.js';
import { openDebts } from '../sheets/debts.js';
import { activeInvestments } from '../logic/wealth.js';
import { goals, debts } from '../store.js';

const SOON = [
  ['chart-pie', 'Reportes avanzados', 'Períodos, inflación, PDF', 4],
  ['cloud', 'Sincronizar con la PC', 'Tus datos en todos lados', 5],
  ['shield-check', 'Seguridad', 'Bloqueo con PIN', 5],
];

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function renderMore(el) {
  const nAcc = accounts().length;
  const nCards = accounts().filter(a => a.type === 'credit').length;
  const nCat = categories('expense').length + categories('income').length;
  const nRec = recurrings().filter(r => r.active !== false).length;
  const nUp = upcomingItems(15).length;
  const nBudgets = categories('expense').filter(c => c.budget > 0).length;
  const tile = (act, ic, title, sub) =>
    `<button class="tile" data-act="${act}"><div class="ic">${icon(ic)}</div><b>${title}</b><small>${sub}</small></button>`;

  el.innerHTML = `
    <header class="top"><h1 class="page-title">Más</h1></header>
    ${isStandalone() ? '' : `<section class="card hero install">
      <span class="cta-ic">${icon('smartphone')}</span>
      <div><b>Instalala en tu iPhone</b>
        <ol><li>Abrí esta página en <b>Safari</b></li><li>Tocá ${icon('share')} <b>Compartir</b></li><li>Elegí ${icon('square-plus')} <b>Agregar a inicio</b></li></ol></div>
    </section>`}
    <div class="grid">
      ${tile('cards', 'credit-card', 'Tarjetas y cuotas', nCards ? plural(nCards, 'tarjeta', 'tarjetas') : 'Resúmenes y cuotas')}
      ${tile('budgets', 'gauge', 'Presupuestos', nBudgets ? plural(nBudgets, 'categoría con límite', 'categorías con límite') : 'Total y por categoría')}
      ${tile('recurring', 'repeat', 'Pagos recurrentes', nRec ? plural(nRec, 'activo', 'activos') : 'Alquiler, servicios, sueldo')}
      ${tile('upcoming', 'calendar-clock', 'Vencimientos', nUp ? `${nUp} en los próximos 15 días` : 'Nada por vencer')}
      ${tile('investments', 'trending-up', 'Inversiones', activeInvestments().length ? plural(activeInvestments().length, 'inversión', 'inversiones') : 'Plazo fijo, FCI, cripto…')}
      ${tile('goals', 'target', 'Metas de ahorro', goals().length ? plural(goals().length, 'meta', 'metas') : 'Viajes, compras, fondos')}
      ${tile('debts', 'handshake', 'Deudas y préstamos', debts().length ? plural(debts().length, 'registro', 'registros') : 'Debo y me deben')}
      ${tile('accounts', 'wallet', 'Cuentas', plural(nAcc, 'cuenta activa', 'cuentas activas'))}
      ${tile('categories', 'tags', 'Categorías', `${nCat} categorías`)}
      ${tile('settings', 'settings', 'Ajustes', 'Nombre y presupuesto')}
      ${tile('backup', 'download', 'Copias y Excel', 'Exportar y restaurar')}
    </div>
    <div class="section-h"><h3>Próximamente</h3></div>
    <div class="grid">${SOON.map(([ic, t, s, stage]) =>
      `<button class="tile soon" data-soon="${t}" data-stage="${stage}"><span class="stage">Etapa ${stage}</span><div class="ic">${icon(ic)}</div><b>${t}</b><small>${s}</small></button>`).join('')}</div>`;

  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.soon) return toast(`${b.dataset.soon}: llega en la etapa ${b.dataset.stage}`, { icon: 'sparkles' });
    switch (b.dataset.act) {
      case 'cards': return openCards();
      case 'budgets': return openBudgets();
      case 'recurring': return openRecurring();
      case 'upcoming': return openUpcoming();
      case 'investments': return openInvestments();
      case 'goals': return openGoals();
      case 'debts': return openDebts();
      case 'accounts': return openAccounts();
      case 'categories': return openCategories();
      case 'settings':
      case 'backup': return openSettings();
    }
  };
}
