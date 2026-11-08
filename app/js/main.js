import { load, state, subscribe, dirtyRows, wipe } from './store.js';
import { register, go, rerender } from './router.js';
import { icon } from './icons.js';
import { refreshSheets, esc, toast } from './ui.js';
import { today } from './dates.js';
import { renderHome } from './views/home.js';
import { renderMovs } from './views/movs.js';
import { renderReports } from './views/reports.js';
import { renderMore } from './views/more.js';
import { openTx } from './sheets/tx.js';
import { startOnboarding } from './sheets/onboarding.js';
import { updateBadge } from './sheets/upcoming.js';
import { lockNow, watchVisibility } from './sheets/lock.js';
import { runAutoRecurring } from './logic/recurring.js';
import { sync, scheduleSync, session, onSyncChange } from './logic/sync.js';

function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = `
    <button data-go="home">${icon('house')}Inicio</button>
    <button data-go="movs">${icon('list')}Movimientos</button>
    <button class="fab" id="fab" aria-label="Nuevo movimiento">${icon('plus')}</button>
    <button data-go="reports">${icon('chart-pie')}Reportes</button>
    <button data-go="more">${icon('layout-grid')}Más</button>`;
  nav.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'fab') openTx();
    else if (b.dataset.go) go(b.dataset.go, b.dataset.go === 'movs' ? {} : undefined);
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
  go('home');
  autoPayments();
  updateBadge();
  backgroundSync();
}

async function boot() {
  register('home', renderHome);
  register('movs', renderMovs);
  register('reports', renderReports);
  register('more', renderMore);
  buildNav();

  await load();
  subscribe(() => {
    rerender();
    refreshSheets();
    updateBadge();
    if (dirtyRows().length) scheduleSync();
  });
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
  });
  window.addEventListener('online', () => backgroundSync());

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().catch(err => {
  console.error(err);
  document.getElementById('app').innerHTML =
    `<div class="fatal"><b>No se pudo abrir la app.</b><br><small>${esc(err?.message || err)}</small></div>`;
});
