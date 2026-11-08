// Tarjetas de crédito: lista, detalle del resumen y cuotas pendientes.
import { accounts, getAccount, getCategory, upsert } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, money, esc, closeAll, toast } from '../ui.js';
import { sheetHead, catIc, empty } from '../components.js';
import { dayMonth, relDay } from '../dates.js';
import { cardStatus, pendingInstallments } from '../logic/cards.js';
import { openAccountEdit } from './accounts.js';
import { openAmountSheet } from './amount.js';
import { openTx } from './tx.js';
import { openBulk } from './bulk.js';
import { go } from '../router.js';

function cardVisual(card, s, big = false) {
  const limitBar = s.available != null
    ? `<div class="progress thin"><i style="width:${Math.min(100, (s.debt / card.limit) * 100)}%"></i></div>
       <div class="ccard-foot"><span>Disponible ${money(s.available)}</span><span>Límite ${money(card.limit)}</span></div>` : '';
  const foot = s.configured
    ? `<div class="ccard-foot"><span>Cierra ${dayMonth(s.nextClose)}</span><span>Vence ${dayMonth(s.toPay > 0 ? s.lastDue : s.nextDue)}</span></div>`
    : `<div class="ccard-foot"><span class="acc-c">Configurá cierre y vencimiento</span></div>`;
  return `<${big ? 'div' : 'button'} class="ccard ${big ? 'big' : ''}" ${big ? '' : `data-card="${card.id}"`}>
    <div class="ccard-top"><span>${esc(card.name)}</span>${icon('credit-card')}</div>
    <div><div class="label">Deuda total</div><div class="amount">${money(Math.max(s.debt, 0))}</div></div>
    <div>${big ? limitBar : ''}${foot}</div></${big ? 'div' : 'button'}>`;
}

export function openCards() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const cards = accounts().filter(a => a.type === 'credit');
      el.innerHTML = `${sheetHead('Tarjetas')}
        ${cards.length ? cards.map(c => cardVisual(c, cardStatus(c))).join('')
          : empty('credit-card', 'No tenés tarjetas cargadas', 'Agregá tu tarjeta de crédito para ver resúmenes, vencimientos y cuotas.')}
        <button class="btn primary" data-new style="margin-top:14px">${icon('plus')}Agregar tarjeta</button>`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) ctl.close();
        else if ('new' in b.dataset) openAccountEdit(null, { type: 'credit' });
        else if (b.dataset.card) openCard(b.dataset.card);
      };
    },
  });
}

export function openCard(id) {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const card = getAccount(id);
      if (!card || card.deleted) { ctl.close(); return; }
      const s = cardStatus(card);
      const groups = pendingInstallments(card);

      let body;
      if (!s.configured) {
        body = `<button class="card card-cta" data-edit><span class="cta-ic">${icon('calendar-clock')}</span>
          <span class="info"><b>Configurá el cierre y el vencimiento</b><small>Con esos dos días te armo los resúmenes y te aviso cuándo pagar</small></span>${icon('chevron-right', 'chev')}</button>`;
      } else {
        const dueTxt = s.overdue ? `<span class="neg">Venció ${relDay(s.lastDue)} (${dayMonth(s.lastDue)})</span>`
          : s.toPay > 0 ? `Vence ${relDay(s.lastDue)} · ${dayMonth(s.lastDue)}` : `Vencimiento: ${dayMonth(s.lastDue)}`;
        const status = s.toPay > 0 ? ['A pagar', money(s.toPay), '']
          : s.closedAmt > 0 ? ['Pagado', '✓', 'pos'] : ['Sin saldo para pagar', '✓', 'pos'];
        body = `
          <section class="card ${s.toPay > 0 ? 'hero' : ''}">
            <div class="label">Resumen cerrado el ${dayMonth(s.lastClose)}</div>
            <div class="rows">
              <div><span>Total del resumen</span><button class="link" data-override>${money(s.closedAmt)} ${icon('pencil')}</button></div>
              ${s.paid ? `<div><span>Pagado</span><b class="pos">${money(s.paid)}</b></div>` : ''}
              <div class="big"><span>${status[0]}</span><b class="${status[2]}">${status[1]}</b></div>
              <div><span>${dueTxt}</span></div>
            </div>
            ${s.toPay > 0 ? `<button class="btn primary" data-pay style="margin-top:14px">${icon('check')}Pagar resumen</button>` : ''}
            <p class="help">¿El banco te cobra otro total (intereses, impuestos, consumos viejos)? Tocá el total y corregilo.</p>
          </section>
          <section class="card">
            <div class="label">Resumen en curso</div>
            <div class="rows">
              <div><span>Consumos hasta hoy</span><b>${money(s.openAmt)}</b></div>
              <div><span>Cierra</span><b>${dayMonth(s.nextClose)} · ${relDay(s.nextClose)}</b></div>
              <div><span>Vence</span><b>${dayMonth(s.nextDue)}</b></div>
              ${s.future ? `<div><span>Cuotas de meses siguientes</span><b>${money(s.future)}</b></div>` : ''}
            </div>
          </section>`;
      }

      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>${esc(card.name)}</h2>
          <div class="row" style="gap:8px"><button class="icon-btn" data-edit aria-label="Editar tarjeta">${icon('pencil')}</button><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div></div>
        ${cardVisual(card, s, true)}
        ${body}
        <div class="section-h"><h3>Cuotas pendientes</h3></div>
        ${groups.length ? `<div class="list">${groups.map(g => {
          const c = getCategory(g.first.categoryId) || { icon: 'shapes', color: '#8A9AA8', name: '' };
          const paidN = g.total - g.remaining.length;
          return `<button class="item tap" data-tx="${g.first.id}">${catIc(c)}
            <span class="info"><b>${esc(g.first.note || c.name)}</b><small>${paidN ? `Pagaste ${paidN} de ${g.total}` : `${g.total} cuotas`} · faltan ${g.remaining.length}</small></span>
            <span class="val">${money(g.left)}<small class="sub-val">${money(g.remaining[0].amount)}/mes</small></span></button>`;
        }).join('')}</div>`
          : `<p class="help" style="margin:0 4px">No tenés compras en cuotas pendientes. Para cargar una, elegí esta tarjeta al anotar un gasto y tocá la cantidad de cuotas.</p>`}
        <div class="row" style="margin-top:16px"><button class="btn" data-movs>${icon('list')}Movimientos</button><button class="btn" data-import>${icon('file-text')}Importar resumen</button></div>`;

      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) ctl.close();
        else if ('edit' in d) openAccountEdit(card.id);
        else if (d.tx) openTx(d.tx);
        else if ('pay' in d) openTx(null, { type: 'transfer', toAccountId: card.id, amount: s.toPay, note: `Pago resumen ${card.name}` });
        else if ('movs' in d) { closeAll(); go('movs', { accountId: card.id }); }
        else if ('import' in d) openBulk({ accountId: card.id });
        else if ('override' in d) {
          openAmountSheet({
            title: 'Total del resumen',
            label: `Resumen que cerró el ${dayMonth(s.lastClose)}`,
            value: s.closedAmt,
            help: `Según lo cargado en la app: ${money(s.computed)}. Poné el total que figura en el resumen del banco.`,
            clearLabel: 'Usar lo cargado en la app',
            onSave: async v => { await upsert('accounts', { id: card.id, statements: { ...card.statements, [s.lastClose]: v } }); toast('Total del resumen actualizado'); },
            onClear: async () => {
              const st = { ...card.statements };
              delete st[s.lastClose];
              await upsert('accounts', { id: card.id, statements: st });
            },
          });
        }
      };
    },
  });
}
