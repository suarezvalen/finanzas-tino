// Datos de inflación mensual: se bajan solos del INDEC y se pueden completar a mano.
import { state, saveInflation } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc } from '../ui.js';
import { sheetHead } from '../components.js';
import { curYm, addMonths, cap, monthName } from '../dates.js';
import { refreshInflation, rateFor } from '../logic/inflation.js';

const fmtPct = v => `${String(Math.round(v * 10) / 10).replace('.', ',')}%`;

export function openInflation() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const { values, manual, fetchedAt } = state.inflation;
      const months = Array.from({ length: 18 }, (_, i) => addMonths(curYm(), -i));
      el.innerHTML = `${sheetHead('Inflación mensual')}
        <p class="help" style="margin:-6px 2px 12px">Datos oficiales del IPC (INDEC). Se actualizan solos cuando tenés internet${fetchedAt ? `; última vez: ${new Date(fetchedAt).toLocaleDateString('es-AR')}` : ''}. Si falta un mes, podés cargarlo a mano.</p>
        <button class="btn" data-refresh style="margin-bottom:14px">${icon('refresh-cw')}Actualizar ahora</button>
        <div class="list">${months.map(ym => {
          const has = values[ym] != null;
          const est = rateFor(ym);
          return `<button class="item tap" data-ym="${ym}">
            <span class="info"><b>${esc(cap(monthName(ym)))}</b><small>${has ? (manual[ym] ? 'Cargado a mano' : 'Dato oficial') : `Sin dato · se estima ${fmtPct(est.rate)}`}</small></span>
            <span class="val ${has ? '' : 'muted'}">${has ? fmtPct(values[ym]) : 'Cargar'}</span>${icon('pencil', 'chev')}</button>`;
        }).join('')}</div>`;

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if ('refresh' in b.dataset) {
          b.disabled = true;
          const ok = await refreshInflation({ force: true });
          toast(ok ? 'Inflación actualizada' : 'No se pudo actualizar. ¿Tenés internet?', { icon: ok ? 'circle-check' : 'info' });
          b.disabled = false;
          return;
        }
        if (b.dataset.ym) editMonth(b.dataset.ym);
      };
    },
  });
}

function editMonth(ym) {
  const cur = state.inflation.values[ym];
  openSheet({
    render(el, ctl) {
      el.innerHTML = `${sheetHead(esc(cap(monthName(ym))))}
        <div class="field"><label for="ip">Inflación del mes (%)</label>
          <input class="input input-big" id="ip" inputmode="decimal" autocomplete="off" placeholder="Ej: 2,3" value="${cur != null ? String(cur).replace('.', ',') : ''}">
          <p class="help">Cuando el INDEC publique el dato oficial, reemplaza al que cargues acá.</p></div>
        <button class="btn primary" data-save>Guardar</button>
        ${cur != null && state.inflation.manual[ym] ? `<button class="btn ghost" data-clear style="margin-top:6px">${icon('x')}Borrar dato cargado a mano</button>` : ''}`;
      const input = el.querySelector('#ip');
      input.oninput = () => { input.value = input.value.replace(/[^\d,.-]/g, ''); };
      setTimeout(() => input.focus(), 380);
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        const values = { ...state.inflation.values }, manual = { ...state.inflation.manual };
        if ('save' in b.dataset) {
          const v = parseFloat(input.value.replace(',', '.'));
          if (!Number.isFinite(v) || v < -20 || v > 100) { toast('Poné un porcentaje válido, por ejemplo 2,3', { icon: 'info' }); return; }
          values[ym] = v;
          manual[ym] = true;
        } else if ('clear' in b.dataset) {
          delete values[ym];
          delete manual[ym];
        } else return;
        await saveInflation({ values, manual });
        ctl.close();
      };
    },
  });
}
