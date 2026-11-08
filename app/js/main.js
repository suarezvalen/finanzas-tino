import { load, state, subscribe } from './store.js';
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
import { runAutoRecurring } from './logic/recurring.js';

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

function showApp() {
  document.getElementById('nav').hidden = false;
  go('home');
  autoPayments();
  updateBadge();
}

async function boot() {
  register('home', renderHome);
  register('movs', renderMovs);
  register('reports', renderReports);
  register('more', renderMore);
  buildNav();

  await load();
  subscribe(() => { rerender(); refreshSheets(); updateBadge(); });

  if (state.settings.onboarded) showApp();
  else startOnboarding(showApp);

  // Al volver a la app (por ejemplo al día siguiente) se actualizan fechas y pagos automáticos.
  let lastDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.settings.onboarded) return;
    if (today() !== lastDay) { lastDay = today(); rerender(); }
    autoPayments();
    updateBadge();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().catch(err => {
  console.error(err);
  document.getElementById('app').innerHTML =
    `<div class="fatal"><b>No se pudo abrir la app.</b><br><small>${esc(err?.message || err)}</small></div>`;
});
