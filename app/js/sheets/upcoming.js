// Próximos vencimientos (recordatorios dentro de la app) y número en el ícono.
import { getRecurring } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';
import { sheetHead, upcomingItem, empty } from '../components.js';
import { daysUntil } from '../dates.js';
import { upcomingItems, alertCount } from '../logic/recurring.js';
import { openCard } from './cards.js';
import { openInvestment } from './investments.js';
import { openDebt } from './debts.js';
import { openTx } from './tx.js';
import { openRecurringEdit, openRecurring } from './recurring.js';

/** Acción al tocar un vencimiento: pagar/registrar o ver el detalle. */
export function handleUpcoming(key) {
  const [kind, id, ym] = key.split('|');
  if (kind === 'card') return openCard(id);
  if (kind === 'inv') return openInvestment(id);
  if (kind === 'debt') return openDebt(id);
  const r = getRecurring(id);
  if (!r) return;
  const item = upcomingItems(60).find(i => i.kind === 'rec' && i.id === id && i.ym === ym);
  if (r.auto && item && !item.overdue) return openRecurringEdit(id);
  const preset = { type: r.type, amount: r.amount, categoryId: r.categoryId, accountId: r.accountId, note: r.name, recurringId: r.id, ym };
  // Si ya venció, se registra con la fecha en que tocaba; si no, con la de hoy.
  if (item && daysUntil(item.date) <= 0) preset.date = item.date;
  openTx(null, preset);
}

const badgeSupported = () => 'setAppBadge' in navigator && 'Notification' in window;

export async function updateBadge() {
  if (!badgeSupported() || Notification.permission !== 'granted') return;
  const n = alertCount();
  try { n ? await navigator.setAppBadge(n) : await navigator.clearAppBadge(); } catch { /* sin soporte */ }
}

export function openUpcoming() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const items = upcomingItems(45);
      const overdue = items.filter(i => i.overdue);
      const week = items.filter(i => !i.overdue && daysUntil(i.date) <= 7);
      const later = items.filter(i => !i.overdue && daysUntil(i.date) > 7);
      const section = (title, list) => (list.length ? `<div class="section-h"><h3>${title}</h3></div><div class="list">${list.map(upcomingItem).join('')}</div>` : '');
      const canBadge = badgeSupported() && Notification.permission === 'default';

      el.innerHTML = `${sheetHead('Próximos vencimientos')}
        ${items.length ? `${section('Vencidos', overdue)}${section('Esta semana', week)}${section('Más adelante', later)}
          <p class="help" style="margin:14px 4px 0">Tocá un vencimiento para registrarlo (podés corregir el monto) o para pagar el resumen.</p>`
          : empty('calendar-clock', 'Nada por vencer', 'Acá aparecen los resúmenes de tus tarjetas y tus pagos recurrentes.')}
        ${canBadge ? `<button class="switch-row" data-badge style="margin-top:16px">${icon('bell-ring')}<span class="info"><b>Mostrar avisos en el ícono</b><small>Un número en el ícono de la app con lo que vence en los próximos 3 días.</small></span></button>` : ''}
        <button class="btn" data-rec style="margin-top:16px">${icon('repeat')}Administrar pagos recurrentes</button>`;

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.up) return handleUpcoming(b.dataset.up);
        if ('rec' in b.dataset) return openRecurring();
        if ('badge' in b.dataset) {
          const p = await Notification.requestPermission();
          if (p === 'granted') { await updateBadge(); toast('Listo: vas a ver el número en el ícono', { icon: 'bell-ring' }); }
          else toast('No se activó. Podés habilitarlo en Ajustes del iPhone → Notificaciones.', { icon: 'info' });
          ctl.refresh();
        }
      };
    },
  });
}
