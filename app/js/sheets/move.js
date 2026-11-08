// Panel para mover plata entre una cuenta y una inversión o un préstamo:
// monto, cuenta, fecha y nota.
import { accounts } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, amountInput, parseAmount, fmtNum, esc, toast, mark, ensureVisible } from '../ui.js';
import { sheetHead, accChips } from '../components.js';
import { today, shortDate } from '../dates.js';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.help]
 * @param {string} o.accountLabel  "Desde" / "Hacia"
 * @param {boolean} [o.includeCredit]  permitir tarjetas de crédito
 * @param {number} [o.amount]
 * @param {string} [o.saveLabel]
 * @param {(r:{amount:number, accountId:string, date:string, note:string}) => Promise<void>} o.onSave
 */
export function openMoveSheet({ title, help = '', accountLabel, includeCredit = false, amount = 0, saveLabel = 'Guardar', onSave }) {
  const accs = accounts().filter(a => includeCredit || a.type !== 'credit');
  const F = { amount: amount ? fmtNum(amount) : '', accountId: accs[0]?.id ?? null, date: today(), note: '' };
  openSheet({
    render(el, ctl) {
      el.innerHTML = `${sheetHead(esc(title))}
        <div class="field"><label for="mv-a">Monto</label>
          <input class="input input-big" id="mv-a" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.amount}">
          ${help ? `<p class="help">${help}</p>` : ''}</div>
        <div class="field"><label>${esc(accountLabel)}</label>${accChips(accs, F.accountId)}</div>
        <div class="field"><label>Fecha</label><label class="date-pill">${icon('calendar')}<span id="mv-dl">${shortDate(F.date)}</span><input type="date" id="mv-d" value="${F.date}"></label></div>
        <div class="field"><input class="input" id="mv-n" maxlength="60" autocomplete="off" placeholder="Nota (opcional)"></div>
        <button class="btn primary" data-save>${esc(saveLabel)}</button>`;
      const a = el.querySelector('#mv-a');
      amountInput(a, v => { F.amount = v; });
      if (!F.amount) setTimeout(() => a.focus(), 380);
      ensureVisible(el.querySelector('#g-acc'));
      const d = el.querySelector('#mv-d');
      d.onchange = () => { F.date = d.value || today(); el.querySelector('#mv-dl').textContent = shortDate(F.date); };
      d.onclick = () => { try { d.showPicker?.(); } catch { /* selector nativo */ } };
      el.querySelector('#mv-n').oninput = e => { F.note = e.target.value; };
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.acc) { F.accountId = b.dataset.acc; return mark(el.querySelector('#g-acc'), b); }
        if ('save' in b.dataset) {
          const n = parseAmount(F.amount);
          if (!n) { toast('Poné el monto', { icon: 'info' }); return; }
          if (!F.accountId) { toast('Elegí una cuenta', { icon: 'info' }); return; }
          b.disabled = true;
          await onSave({ amount: n, accountId: F.accountId, date: F.date, note: F.note.trim() });
          ctl.close();
        }
      };
    },
  });
}
