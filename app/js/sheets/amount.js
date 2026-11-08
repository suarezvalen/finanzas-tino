// Panel chico para escribir un monto (presupuestos, total de un resumen, etc.).
import { icon } from '../icons.js';
import { openSheet, amountInput, parseAmount, fmtNum, esc } from '../ui.js';
import { sheetHead } from '../components.js';

export function openAmountSheet({ title, label = 'Monto', value = 0, help = '', saveLabel = 'Guardar', clearLabel, onSave, onClear }) {
  openSheet({
    render(el, ctl) {
      el.innerHTML = `${sheetHead(esc(title))}
        <div class="field"><label for="amt-in">${esc(label)}</label>
          <input class="input input-big" id="amt-in" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${value ? fmtNum(value) : ''}">
          ${help ? `<p class="help">${help}</p>` : ''}</div>
        <button class="btn primary" data-save>${esc(saveLabel)}</button>
        ${clearLabel && value ? `<button class="btn ghost" data-clear style="margin-top:6px">${icon('x')}${esc(clearLabel)}</button>` : ''}`;
      const input = el.querySelector('#amt-in');
      amountInput(input);
      setTimeout(() => input.focus(), 380);
      const save = async () => { await onSave(parseAmount(input.value)); ctl.close(); };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) ctl.close();
        else if ('save' in b.dataset) save();
        else if ('clear' in b.dataset) { await onClear(); ctl.close(); }
      };
    },
  });
}
