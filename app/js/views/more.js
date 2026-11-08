// Pantalla "Más": acceso a cuentas, categorías, ajustes y lo que viene.
import { accounts, categories } from '../store.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { openAccounts } from '../sheets/accounts.js';
import { openCategories } from '../sheets/categories.js';
import { openSettings } from '../sheets/settings.js';

const SOON = [
  ['credit-card', 'Tarjetas y cuotas', 'Cierres, vencimientos y cuotas', 2],
  ['gauge', 'Presupuestos', 'Por categoría', 2],
  ['repeat', 'Pagos recurrentes', 'Alquiler, servicios, suscripciones', 2],
  ['bell-ring', 'Recordatorios', 'Vencimientos que se acercan', 2],
  ['trending-up', 'Inversiones', 'Plazo fijo, FCI, CEDEARs, cripto', 3],
  ['target', 'Metas de ahorro', 'Viajes, compras, fondo de emergencia', 3],
  ['hand-coins', 'Deudas y préstamos', 'Lo que debés y lo que te deben', 3],
  ['cloud', 'Sincronizar con la PC', 'Tus datos en todos lados', 5],
  ['shield-check', 'Seguridad', 'Bloqueo con PIN', 5],
];

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function renderMore(el) {
  const nAcc = accounts().length;
  const nCat = categories('expense').length + categories('income').length;
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
      ${tile('accounts', 'wallet', 'Cuentas', `${nAcc} cuenta${nAcc === 1 ? '' : 's'} activa${nAcc === 1 ? '' : 's'}`)}
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
      case 'accounts': return openAccounts();
      case 'categories': return openCategories();
      case 'settings':
      case 'backup': return openSettings();
    }
  };
}
