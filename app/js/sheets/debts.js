// Deudas y préstamos: lo que debés y lo que te deben.
import { debts, getDebt, getAccount, accounts, upsert, upsertMany, remove, uid } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, money, amountInput, parseAmount, fmtNum, mark, ensureVisible } from '../ui.js';
import { sheetHead, catIc, accChips, empty } from '../components.js';
import { today, shortDate, dayLabel, relDay, dayMonth } from '../dates.js';
import { debtPaid, debtRemaining, linked } from '../logic/wealth.js';
import { openMoveSheet } from './move.js';

const DIR = {
  owed: { tab: 'Me deben', icon: 'arrow-down-left', color: '#2EF2A0', pay: 'Registrar cobro', payDone: 'Cobro registrado', who: '¿Quién te debe?' },
  owe: { tab: 'Debo', icon: 'arrow-up-right', color: '#FF5C7A', pay: 'Registrar pago', payDone: 'Pago registrado', who: '¿A quién le debés?' },
};
let tab = 'owed';

function dueText(d, remaining) {
  if (!remaining) return '<span class="pos">Saldada</span>';
  if (!d.dueDate) return `Desde el ${shortDate(d.date)}`;
  return d.dueDate < today() ? `<span class="neg">Venció el ${dayMonth(d.dueDate)}</span>` : `Vence ${relDay(d.dueDate)} · ${dayMonth(d.dueDate)}`;
}

export function openDebts() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const all = debts().map(d => ({ d, rem: debtRemaining(d), paid: debtPaid(d) }));
      const sum = dir => all.filter(x => x.d.direction === dir).reduce((s, x) => s + x.rem, 0);
      const mine = all.filter(x => x.d.direction === tab);
      const open = mine.filter(x => x.rem > 0), settled = mine.filter(x => x.rem === 0);
      const row = x => `<button class="item tap" data-id="${x.d.id}">${catIc({ icon: 'handshake', color: DIR[x.d.direction].color })}
        <span class="info"><b>${esc(x.d.name)}</b>
          ${x.rem ? `<span class="progress thin"><i style="width:${Math.min(100, (x.paid / x.d.amount) * 100)}%"></i></span>` : ''}
          <small>${dueText(x.d, x.rem)}${x.paid && x.rem ? ` · ${x.d.direction === 'owe' ? 'pagaste' : 'te pagaron'} ${money(x.paid)}` : ''}</small></span>
        <span class="val">${money(x.rem || x.d.amount)}</span></button>`;

      el.innerHTML = `${sheetHead('Deudas y préstamos')}
        <div class="row" style="margin-bottom:14px">
          <div class="pill"><small>${icon('arrow-down-left', 'pos')}Me deben</small><b class="pos">${money(sum('owed'))}</b></div>
          <div class="pill"><small>${icon('arrow-up-right', 'neg')}Debo</small><b class="neg">${money(sum('owe'))}</b></div>
        </div>
        <div class="seg" style="margin-bottom:14px">${Object.entries(DIR).map(([k, v]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${v.tab}</button>`).join('')}</div>
        ${open.length ? `<div class="list">${open.map(row).join('')}</div>`
          : empty('handshake', tab === 'owed' ? 'Nadie te debe plata' : 'No tenés deudas cargadas',
            tab === 'owed' ? 'Si le prestás plata a alguien, anotalo acá para no olvidarte.' : 'Préstamos, plata que te prestaron amigos o familia, compras a pagar…')}
        <button class="btn primary" data-new style="margin-top:14px">${icon('plus')}${tab === 'owed' ? 'Anotar plata que presté' : 'Anotar una deuda'}</button>
        ${settled.length ? `<div class="section-h"><h3>Saldadas</h3></div><div class="list">${settled.map(row).join('')}</div>` : ''}`;

      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) ctl.close();
        else if (b.dataset.tab) { tab = b.dataset.tab; ctl.refresh(); }
        else if ('new' in b.dataset) openDebtEdit(null, tab);
        else if (b.dataset.id) openDebt(b.dataset.id);
      };
    },
  });
}

export function openDebt(id) {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const d = getDebt(id);
      if (!d || d.deleted) { ctl.close(); return; }
      const D = DIR[d.direction];
      const rem = debtRemaining(d), paid = debtPaid(d);
      const moves = linked('debt', d.id).sort((a, b) => b.date.localeCompare(a.date));

      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>${esc(d.name)}</h2>
          <div class="row" style="gap:8px"><button class="icon-btn" data-edit aria-label="Editar">${icon('pencil')}</button><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div></div>
        <section class="card ${rem ? 'hero' : ''}">
          <div class="label">${d.direction === 'owe' ? 'Te falta pagar' : 'Te falta cobrar'}</div>
          <div class="amount" style="font-size:32px;margin:6px 0 4px">${money(rem)}</div>
          <span class="progress thin"><i style="width:${Math.min(100, (paid / d.amount) * 100)}%"></i></span>
          <div class="rows">
            <div><span>Total</span><b>${money(d.amount)}</b></div>
            <div><span>${d.direction === 'owe' ? 'Pagado' : 'Cobrado'}</span><b class="pos">${money(paid)}</b></div>
            <div><span>Desde</span><b>${shortDate(d.date)}</b></div>
            ${d.dueDate ? `<div><span>Vencimiento</span><b>${dueText(d, rem)}</b></div>` : ''}
            ${d.note ? `<div><span>Nota</span><b>${esc(d.note)}</b></div>` : ''}
          </div>
          ${rem ? `<button class="btn primary" data-pay style="margin-top:14px">${icon(D.icon)}${D.pay}</button>` : ''}
        </section>
        ${moves.length ? `<div class="section-h"><h3>Movimientos</h3></div><div class="list">${moves.map(t => `<button class="item tap" data-mtx="${t.id}">
          ${catIc({ icon: t.link.role === 'start' ? 'handshake' : D.icon, color: D.color })}
          <span class="info"><b>${t.link.role === 'start' ? (d.direction === 'owe' ? 'Te prestaron' : 'Prestaste') : d.direction === 'owe' ? 'Pagaste' : 'Te pagaron'}${t.note ? ` · ${esc(t.note)}` : ''}</b>
            <small>${dayLabel(t.date)} · ${esc(getAccount(t.accountId)?.name || '—')}</small></span>
          <span class="val">${t.type === 'in' ? '+' : '−'}${money(t.amount)}</span></button>`).join('')}</div>
          <p class="help" style="margin:8px 4px 0">Tocá un movimiento para borrarlo.</p>` : ''}
        <button class="btn danger" data-delete style="margin-top:16px">${icon('trash-2')}Eliminar</button>`;

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const x = b.dataset;
        if ('close' in x) return ctl.close();
        if ('edit' in x) return openDebtEdit(d.id);
        if ('pay' in x) {
          return openMoveSheet({
            title: D.pay, amount: rem, accountLabel: d.direction === 'owe' ? 'Pagaste desde' : 'Entró en',
            help: `Falta ${money(rem)}. Si es un pago parcial, cambiá el monto.`, saveLabel: D.pay,
            onSave: async r => {
              await upsert('transactions', {
                type: d.direction === 'owe' ? 'out' : 'in', amount: r.amount, date: r.date, note: r.note, accountId: r.accountId,
                link: { kind: 'debt', id: d.id, role: 'payment' },
              });
              toast(debtRemaining(getDebt(d.id)) === 0 ? `¡${d.name} quedó saldada!` : D.payDone, { icon: 'circle-check' });
            },
          });
        }
        if (x.mtx) {
          if (!confirm('¿Borrar este movimiento? También se corrige el saldo de la cuenta.')) return;
          await upsert('transactions', { id: x.mtx, deleted: true });
          return;
        }
        if ('delete' in x) {
          const msg = moves.length ? `¿Eliminar "${d.name}"? También se borran sus ${moves.length} movimientos y se corrigen tus saldos.` : `¿Eliminar "${d.name}"?`;
          if (!confirm(msg)) return;
          await upsertMany('transactions', moves.map(t => ({ id: t.id, deleted: true })));
          await remove('debts', d.id);
          toast('Eliminada', { icon: 'trash-2' });
          ctl.close();
        }
      };
    },
  });
}

export function openDebtEdit(id, direction = 'owed') {
  const ex = id ? getDebt(id) : null;
  const F = {
    direction: ex?.direction || direction, name: ex?.name || '', amount: ex?.amount ? fmtNum(ex.amount) : '',
    date: ex?.date || today(), dueDate: ex?.dueDate || '', note: ex?.note || '',
    paidBefore: ex?.paidBefore ? fmtNum(ex.paidBefore) : '',
    moved: false, accountId: accounts().find(a => a.type !== 'credit')?.id ?? null,
  };

  openSheet({
    full: true,
    render(el, ctl) {
      const owe = F.direction === 'owe';
      const accs = accounts().filter(a => a.type !== 'credit');
      el.innerHTML = `${sheetHead(ex ? 'Editar' : owe ? 'Nueva deuda' : 'Plata que presté')}
        ${ex ? '' : `<div class="seg" style="margin-bottom:16px">${Object.entries(DIR).map(([k, v]) => `<button data-dir="${k}" class="${F.direction === k ? 'on' : ''}">${v.tab}</button>`).join('')}</div>`}
        <div class="field"><label for="dn">${DIR[F.direction].who}</label><input class="input" id="dn" maxlength="40" autocomplete="off" placeholder="${owe ? 'Ej: Préstamo personal, Mamá' : 'Ej: Juan, Sofi'}" value="${esc(F.name)}"></div>
        <div class="field"><label for="da">Monto total</label><input class="input" id="da" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.amount}"></div>
        ${!ex ? `<div class="field"><label for="dp">¿Ya ${owe ? 'pagaste' : 'te devolvieron'} una parte? (opcional)</label><input class="input" id="dp" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.paidBefore}"></div>` : ''}
        <div class="row">
          <div class="field" style="flex:1"><label>Fecha</label><label class="date-pill" style="height:48px;width:100%;justify-content:center">${icon('calendar')}<span id="ddl">${shortDate(F.date)}</span><input type="date" id="dd" value="${F.date}"></label></div>
          <div class="field" style="flex:1"><label>Vence (opcional)</label><label class="date-pill" style="height:48px;width:100%;justify-content:center">${icon('calendar-clock')}<span id="dvl">${F.dueDate ? shortDate(F.dueDate) : 'Sin fecha'}</span><input type="date" id="dv" value="${F.dueDate}"></label></div>
        </div>
        <div class="field"><input class="input" id="dno" maxlength="80" autocomplete="off" placeholder="Nota (opcional)" value="${esc(F.note)}"></div>
        ${!ex ? `<button class="switch-row" data-moved><span class="info"><b>${owe ? 'La plata entró en una de mis cuentas' : 'La plata salió de una de mis cuentas'}</b><small>Prendelo si es un préstamo nuevo. Si es algo viejo, dejalo apagado y tus saldos no cambian.</small></span><span class="switch ${F.moved ? 'on' : ''}"></span></button>
          ${F.moved ? `<div class="field" style="margin-top:12px"><label>${owe ? 'Entró en' : 'Salió de'}</label>${accChips(accs, F.accountId)}</div>` : ''}` : ''}
        <button class="btn primary" data-save style="margin-top:16px">${ex ? 'Guardar cambios' : 'Guardar'}</button>`;

      el.querySelector('#dn').oninput = e => { F.name = e.target.value; };
      el.querySelector('#dno').oninput = e => { F.note = e.target.value; };
      amountInput(el.querySelector('#da'), v => { F.amount = v; });
      const dp = el.querySelector('#dp');
      if (dp) amountInput(dp, v => { F.paidBefore = v; });
      for (const [inp, lbl, key, empty] of [['#dd', '#ddl', 'date', false], ['#dv', '#dvl', 'dueDate', true]]) {
        const x = el.querySelector(inp);
        x.onchange = () => { F[key] = x.value || (empty ? '' : today()); el.querySelector(lbl).textContent = F[key] ? shortDate(F[key]) : 'Sin fecha'; };
        x.onclick = () => { try { x.showPicker?.(); } catch { /* selector nativo */ } };
      }
      ensureVisible(el.querySelector('#g-acc'));

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.dir) { F.direction = d.dir; return ctl.refresh(); }
        if ('moved' in d) { F.moved = !F.moved; return ctl.refresh(); }
        if (d.acc) { F.accountId = d.acc; return mark(el.querySelector('#g-acc'), b); }
        if ('save' in d) {
          const amount = parseAmount(F.amount);
          if (!F.name.trim()) { toast('Poné un nombre', { icon: 'info' }); return; }
          if (!amount) { toast('Poné el monto', { icon: 'info' }); return; }
          if (F.moved && !F.accountId) { toast('Elegí la cuenta', { icon: 'info' }); return; }
          const did = ex?.id || uid();
          const rec = { id: did, direction: F.direction, name: F.name.trim(), amount, date: F.date, dueDate: F.dueDate || null, note: F.note.trim() };
          if (!ex) rec.paidBefore = parseAmount(F.paidBefore);
          await upsert('debts', rec);
          if (!ex && F.moved) {
            await upsert('transactions', {
              type: F.direction === 'owe' ? 'in' : 'out', amount, date: F.date, note: '', accountId: F.accountId,
              link: { kind: 'debt', id: did, role: 'start' },
            });
          }
          toast(ex ? 'Cambios guardados' : 'Guardado');
          ctl.close();
          if (!ex) openDebt(did);
        }
      };
    },
  });
}
