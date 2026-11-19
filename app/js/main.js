import { load, state, subscribe, dirtyRows, wipe } from './store.js';
import { register, go, rerender, onMode, switchMode, currentMode } from './router.js';
import { renderBizHome, renderBizCampaigns, renderBizLog, renderBizSettings } from './views/biz.js';
import { openBizCost } from './sheets/biz.js';
import { icon } from './icons.js';
import { refreshSheets, esc, toast } from './ui.js';
import { today } from './dates.js';
import { renderHome } from './views/home.js';
import { renderMovs } from './views/movs.js';
import { renderReports } from './views/reports.js';
import { renderMore } from './views/more.js';
import { renderMarket } from './views/market.js';
import { refreshMarket, onMarketChange } from './logic/market.js';
import { openTx } from './sheets/tx.js';
import { startOnboarding } from './sheets/onboarding.js';
import { updateBadge } from './sheets/upcoming.js';
import { lockNow, watchVisibility } from './sheets/lock.js';
import { runAutoRecurring } from './logic/recurring.js';
import { sync, scheduleSync, session, onSyncChange } from './logic/sync.js';

function buildNav(mode = currentMode()) {
  const nav = document.getElementById('nav');
  const biz = mode === 'biz';
  document.getElementById('app').classList.toggle('biz-mode', biz);
  nav.innerHTML = biz ? `
    <button data-mode="personal">${icon('house')}Personal</button>
    <button data-go="bres">${icon('chart-column')}Resumen</button>
    <button class="fab" id="fab" aria-label="Nuevo gasto del negocio">${icon('plus')}</button>
    <button data-go="bcamp">${icon('target')}Campañas</button>
    <button data-go="breg">${icon('file-spreadsheet')}Registro</button>
    <button data-go="bset">${icon('settings')}Ajustes</button>` : `
    <button data-go="home">${icon('house')}Inicio</button>
    <button data-go="movs">${icon('list')}Movimientos</button>
    <button class="fab" id="fab" aria-label="Nuevo movimiento">${icon('plus')}</button>
    <button data-go="reports">${icon('chart-pie')}Reportes</button>
    <button data-go="market">${icon('chart-line')}Mercado</button>
    <button data-go="more">${icon('layout-grid')}Más</button>`;
  nav.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'fab') return currentMode() === 'biz' ? openBizCost() : openTx();
    if (b.dataset.mode) return switchMode(b.dataset.mode);
    if (b.dataset.go) go(b.dataset.go, b.dataset.go === 'movs' ? {} : undefined);
  };
}

/** Registra los pagos automáticos que vencieron y avisa. */
async function autoPayments() {
  const n = await runAutoRecurring();
  if (n) toast(n === 1 ? 'Se registró 1 pago automático' : `Se registraron ${n} pagos automáticos`, { icon: 'repeat' });
}

/** Olvidé el PIN: se borran los datos de este dispositivo (y la sesión, para que nadie los recupere sin contraseña). */
async function forgotPin() {
  const msg = 'Para entrar sin el PIN hay que borrar los datos de este dispositivo.\n\n'
    + (session() ? 'Como tenés la sincronización activada, después iniciás sesión con tu email y contraseña y tus datos vuelven.' : 'Si no tenés una copia de seguridad, se pierden.')
    + '\n\n¿Borrar los datos de este dispositivo?';
  if (!confirm(msg)) return;
  await wipe();
  for (const k of ['ft-lock', 'ft-auth', 'ft-sync']) { try { localStorage.removeItem(k); } catch { /* nada */ } }
  location.reload();
}

async function backgroundSync() {
  if (!session()) return;
  try { await sync(); } catch { /* se reintenta más tarde */ }
  autoPayments();
}

function showApp() {
  document.getElementById('nav').hidden = false;
  // Las notificaciones abren la app en Mercado (…/#mercado).
  // El aviso de un informe abre la app en ese informe (…/#informe/ID).
  const rep = location.hash.match(/^#informe\/(.+)$/);
  // Vuelve al sector donde estabas la última vez (personal o negocio), salvo que una notificación pida otra cosa.
  let lastMode = 'personal';
  try { lastMode = localStorage.getItem('ft-mode') || 'personal'; } catch { /* sin almacenamiento */ }
  if (location.hash === '#negocio' || (lastMode === 'biz' && !location.hash)) switchMode('biz');
  else go(location.hash === '#mercado' || rep ? 'market' : 'home');
  if (rep) {
    const id = decodeURIComponent(rep[1]);
    import('./sheets/informe.js').then(async m => {
      // Si recién llega, puede no estar bajado todavía: se sincroniza primero.
      const { informes } = await import('./store.js');
      if (!informes().some(x => x.id === id) && session()) await sync().catch(() => {});
      m.openInforme(id);
    });
  }
  if (location.hash) history.replaceState(null, '', location.pathname);
  refreshMarket().catch(() => {});
  autoPayments();
  updateBadge();
  backgroundSync();
}

async function boot() {
  register('home', renderHome);
  register('movs', renderMovs);
  register('reports', renderReports);
  register('more', renderMore);
  register('market', renderMarket);
  register('bres', renderBizHome);
  register('bcamp', renderBizCampaigns);
  register('breg', renderBizLog);
  register('bset', renderBizSettings);
  // Al cambiar de sector se rearma la barra y se abre la primera pantalla de ese sector.
  onMode(mode => { buildNav(mode); go(mode === 'biz' ? 'bres' : 'home'); });
  buildNav('personal');

  await load();
  subscribe(() => {
    rerender();
    refreshSheets();
    updateBadge();
    if (dirtyRows().length) scheduleSync();
  });
  onMarketChange(() => { if (state.settings.onboarded) { rerender(); refreshSheets(); } });
  // Precios al día mientras la app está abierta.
  setInterval(() => { if (document.visibilityState === 'visible' && state.settings.onboarded) refreshMarket().catch(() => {}); }, 5 * 60000);
  onSyncChange(() => { if (state.settings.onboarded && document.getElementById('s-more').classList.contains('active')) rerender(); });

  if (state.settings.onboarded) {
    lockNow(forgotPin);
    showApp();
  } else {
    startOnboarding(showApp);
  }
  watchVisibility(forgotPin);

  // Al volver a la app (por ejemplo al día siguiente) se actualizan fechas, pagos automáticos y la nube.
  let lastDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.settings.onboarded) return;
    if (today() !== lastDay) { lastDay = today(); rerender(); }
    autoPayments();
    updateBadge();
    backgroundSync();
    refreshMarket().catch(() => {});
  });
  window.addEventListener('online', () => backgroundSync());

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().catch(err => {
  console.error(err);
  document.getElementById('app').innerHTML =
    `<div class="fatal"><b>No se pudo abrir la app.</b><br><small>${esc(err?.message || err)}</small></div>`;
});
