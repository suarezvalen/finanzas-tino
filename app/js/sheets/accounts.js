// Administrar cuentas: efectivo, bancos, billeteras, tarjetas y ahorro.
import { accounts, balance, getAccount, upsert, remove, txs } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, money, amountInput, parseAmount, fmtNum } from '../ui.js';
import { ACCOUNT_TYPES } from '../constants.js';
import { accIcon } from '../components.js';

function row(a) {
  const b = balance(a);
  return `<button class="item tap" data-id="${a.id}">
    <span class="cat-ic">${icon(accIcon(a))}</span>
    <span class="info"><b>${esc(a.name)}</b><small>${ACCOUNT_TYPES[a.type]?.label || ''}</small></span>
    <span class="val ${b < 0 ? 'neg' : ''}">${b < 0 ? '−' : ''}${money(Math.abs(b))}</span>${icon('chevron-right', 'chev')}</button>`;
}

export function openAccounts() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const act = accounts();
      const arch = accounts(true).filter(a => a.archived);
      const total = act.reduce((s, a) => s + balance(a), 0);
      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>Cuentas</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <div class="card hero sm"><div class="label">Total en cuentas</div><div class="amount">${money(total)}</div></div>
        ${act.length ? `<div class="list">${act.map(row).join('')}</div>` : ''}
        <button class="btn primary" data-new style="margin-top:14px">${icon('plus')}Nueva cuenta</button>
        <p class="help" style="margin-top:12px">Las tarjetas de crédito muestran lo que debés (en rojo). Para pagar la tarjeta, cargá una transferencia desde tu banco hacia la tarjeta.</p>
        ${arch.length ? `<div class="section-h"><h3>Archivadas</h3></div><div class="list">${arch.map(row).join('')}</div>` : ''}`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) ctl.close();
        else if ('new' in b.dataset) openAccountEdit();
        else if (b.dataset.id) openAccountEdit(b.dataset.id);
      };
    },
  });
}

export function openAccountEdit(id, preset = {}) {
  const ex = id ? getAccount(id) : null;
  const cur = ex ? balance(ex) : 0;
  const F = {
    name: ex?.name || '', type: ex?.type || preset.type || 'bank', bal: '',
    closingDay: ex?.closingDay ? String(ex.closingDay) : '', dueDay: ex?.dueDay ? String(ex.dueDay) : '',
    limit: ex?.limit ? fmtNum(ex.limit) : '',
  };
  if (ex) {
    const shown = ex.type === 'credit' ? Math.max(-cur, 0) : Math.max(cur, 0);
    F.bal = shown ? fmtNum(shown) : '';
  }

  openSheet({
    render(el, ctl) {
      const credit = F.type === 'credit';
      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>${ex ? 'Editar cuenta' : 'Nueva cuenta'}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <div class="field"><label>Tipo</label><div class="chips wrap">${Object.entries(ACCOUNT_TYPES).map(([k, t]) =>
          `<button class="chip ${F.type === k ? 'on' : ''}" data-type="${k}">${icon(t.icon)}${t.label}</button>`).join('')}</div></div>
        <div class="field"><label for="an">Nombre</label>
          <input class="input" id="an" maxlength="30" autocomplete="off" placeholder="Ej: Banco Nación, Mercado Pago, Visa…" value="${esc(F.name)}"></div>
        <div class="field"><label for="ab">${credit ? 'Deuda actual de la tarjeta' : 'Saldo actual'}</label>
          <input class="input" id="ab" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.bal}">
          <p class="help">${credit ? 'Lo que debés hoy en la tarjeta.' : 'Lo que tenés hoy en esta cuenta.'} Si más adelante no coincide con la realidad, corregilo acá y la app ajusta el saldo.</p></div>
        ${credit ? `
        <div class="row">
          <div class="field" style="flex:1"><label for="acd">Día de cierre</label><input class="input" id="acd" inputmode="numeric" maxlength="2" placeholder="Ej: 25" value="${F.closingDay}"></div>
          <div class="field" style="flex:1"><label for="add">Día de vencimiento</label><input class="input" id="add" inputmode="numeric" maxlength="2" placeholder="Ej: 5" value="${F.dueDay}"></div>
        </div>
        <p class="help" style="margin:-8px 2px 16px">Los encontrás en el resumen de la tarjeta. Con estos días la app arma tus resúmenes y te avisa cuándo pagar.</p>
        <div class="field"><label for="alim">Límite de compra (opcional)</label><input class="input" id="alim" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.limit}"></div>` : ''}
        <button class="btn primary" data-save>${ex ? 'Guardar cambios' : 'Crear cuenta'}</button>
        ${ex ? `<div class="row" style="margin-top:10px">
          <button class="btn" data-archive>${icon(ex.archived ? 'archive-restore' : 'archive')}${ex.archived ? 'Reactivar' : 'Archivar'}</button>
          <button class="btn danger" data-delete>${icon('trash-2')}Eliminar</button></div>` : ''}`;

      el.querySelector('#an').oninput = e => { F.name = e.target.value; };
      amountInput(el.querySelector('#ab'), v => { F.bal = v; });
      if (credit) {
        const day = (sel, key) => el.querySelector(sel).addEventListener('input', e => {
          e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
          F[key] = e.target.value;
        });
        day('#acd', 'closingDay');
        day('#add', 'dueDay');
        amountInput(el.querySelector('#alim'), v => { F.limit = v; });
      }

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.type) { F.type = d.type; return ctl.refresh(); }
        if ('save' in d) {
          const n = parseAmount(F.bal);
          const desired = F.type === 'credit' ? -n : n;
          const moves = ex ? cur - (ex.initialBalance || 0) : 0;
          const rec = { name: F.name.trim() || ACCOUNT_TYPES[F.type].label, type: F.type, initialBalance: desired - moves };
          if (F.type === 'credit') {
            const cd = Number(F.closingDay) || 0, dd = Number(F.dueDay) || 0;
            if ((cd || dd) && !(cd >= 1 && cd <= 31 && dd >= 1 && dd <= 31)) {
              toast('Revisá los días: tienen que ser del 1 al 31', { icon: 'triangle-alert' });
              return;
            }
            Object.assign(rec, { closingDay: cd, dueDay: dd, limit: parseAmount(F.limit) });
          }
          if (ex) rec.id = ex.id; else rec.order = Date.now();
          await upsert('accounts', rec);
          toast(ex ? 'Cuenta actualizada' : 'Cuenta creada');
          return ctl.close();
        }
        if ('archive' in d) {
          if (!ex.archived && cur !== 0 && !confirm(`Esta cuenta tiene un saldo de ${money(cur)}. Si la archivás, deja de sumarse a tus totales. ¿Archivar igual?`)) return;
          await upsert('accounts', { id: ex.id, archived: !ex.archived });
          toast(ex.archived ? 'Cuenta reactivada' : 'Cuenta archivada', { icon: 'archive' });
          return ctl.close();
        }
        if ('delete' in d) {
          const used = txs().some(t => t.accountId === ex.id || t.toAccountId === ex.id);
          if (used) { alert('Esta cuenta tiene movimientos cargados, así que no se puede eliminar. Podés archivarla para ocultarla.'); return; }
          if (!confirm(`¿Eliminar la cuenta "${ex.name}"?`)) return;
          await remove('accounts', ex.id);
          toast('Cuenta eliminada', { icon: 'trash-2' });
          ctl.close();
        }
      };
    },
  });
}
