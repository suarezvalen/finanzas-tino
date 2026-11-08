// Cargar varios gastos de una vez: pegás el texto del resumen y la app arma la lista.
import { accounts, categories, getCategory, upsertMany } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, money, mark, ensureVisible } from '../ui.js';
import { sheetHead, catIc, accChips } from '../components.js';
import { today, shortDate } from '../dates.js';
import { parseStatement } from '../logic/parse.js';

const EXAMPLE = '05/11 COTO SUC 123            48.320,00\n06/11 NETFLIX.COM               11.999,00\n07/11 ZAPATILLAS NIKE C.01/03   29.997,00';

export function openBulk({ accountId } = {}) {
  const accs = accounts();
  const F = {
    step: 1, text: '', rows: [],
    accountId: accountId || accs.find(a => a.type === 'credit')?.id || accs[0]?.id || null,
    date: today(),
  };

  const ctl = openSheet({
    full: true,
    render(el) { if (F.step === 1) renderInput(el); else renderPreview(el); },
  });

  function renderInput(el) {
    el.innerHTML = `${sheetHead('Cargar varios gastos')}
      <p class="help" style="margin:-6px 2px 12px">Copiá las líneas de consumos del resumen de la tarjeta (o del home banking) y pegalas acá. Una línea por gasto, con fecha, detalle y monto.</p>
      <textarea class="input textarea" id="bt" placeholder="${esc(EXAMPLE)}" spellcheck="false">${esc(F.text)}</textarea>
      <div class="field" style="margin-top:14px"><label>Se pagaron con</label>${accChips(accs, F.accountId)}</div>
      <div class="field"><label>Fecha para las líneas sin fecha</label>
        <label class="date-pill" style="height:44px">${icon('calendar')}<span id="bdl">${shortDate(F.date)}</span><input type="date" id="bd" value="${F.date}"></label></div>
      <button class="btn primary" data-parse>${icon('sparkles')}Analizar</button>`;
    ensureVisible(el.querySelector('#g-acc'));
    el.querySelector('#bt').oninput = e => { F.text = e.target.value; };
    const d = el.querySelector('#bd');
    d.onchange = () => { F.date = d.value || today(); el.querySelector('#bdl').textContent = shortDate(F.date); };
    d.onclick = () => { try { d.showPicker?.(); } catch { /* selector nativo */ } };
    el.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if ('close' in b.dataset) return ctl.close();
      if (b.dataset.acc) { F.accountId = b.dataset.acc; return mark(el.querySelector('#g-acc'), b); }
      if ('parse' in b.dataset) {
        F.rows = parseStatement(F.text, F.date);
        if (!F.rows.length) { toast('No encontré montos. Revisá que cada línea tenga el importe', { icon: 'info' }); return; }
        F.step = 2;
        ctl.refresh();
        ctl.el.scrollTop = 0;
      }
    };
  }

  function renderPreview(el) {
    const sel = F.rows.filter(r => r.include);
    const total = sel.reduce((s, r) => s + r.amount, 0);
    el.innerHTML = `${sheetHead('Revisá los gastos')}
      <div class="row" style="margin-bottom:12px">
        <div class="pill"><small>Seleccionados</small><b>${sel.length} de ${F.rows.length}</b></div>
        <div class="pill"><small>Total</small><b>${money(total)}</b></div>
      </div>
      <p class="help" style="margin:0 2px 10px">Tocá el círculo para incluir o sacar un gasto, y la categoría para cambiarla.</p>
      <div class="list">${F.rows.map((r, i) => {
        const c = getCategory(r.categoryId) || { name: 'Elegir', icon: 'shapes', color: '#8A9AA8' };
        return `<div class="item bulk-row ${r.include ? '' : 'off'}">
          <button class="ob-toggle ${r.include ? 'on' : ''}" data-tog="${i}" aria-label="Incluir">${icon(r.include ? 'check' : 'plus')}</button>
          <span class="info"><b>${esc(r.note)}</b><small>${shortDate(r.date)}${r.warning ? ` · <span class="warn-c">${esc(r.warning)}</span>` : ''}</small>
            <button class="mini-cat" data-cat="${i}" style="--c:${c.color}">${icon(c.icon)}${esc(c.name)}</button></span>
          <span class="val">${money(r.amount)}</span></div>`;
      }).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" data-back>${icon('chevron-left')}Volver</button>
        <button class="btn primary" data-save ${sel.length ? '' : 'disabled'}>Guardar ${sel.length}</button></div>`;
    el.onclick = async e => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if ('close' in d) return ctl.close();
      if ('back' in d) { F.step = 1; return ctl.refresh(); }
      if (d.tog !== undefined) { const r = F.rows[d.tog]; r.include = !r.include; return keepScroll(); }
      if (d.cat !== undefined) return pickCategory(F.rows[d.cat], keepScroll);
      if ('save' in d) {
        b.disabled = true;
        const recs = sel.map(r => ({ type: 'expense', amount: r.amount, date: r.date, note: r.note, categoryId: r.categoryId, accountId: F.accountId }));
        await upsertMany('transactions', recs);
        toast(`${recs.length} gastos guardados`);
        ctl.close();
      }
    };
  }

  function keepScroll() { const t = ctl.el.scrollTop; ctl.refresh(); ctl.el.scrollTop = t; }
}

function pickCategory(row, done) {
  openSheet({
    render(el, ctl) {
      el.innerHTML = `${sheetHead('Categoría')}
        <p class="help" style="margin:-6px 2px 12px">${esc(row.note)}</p>
        <div class="cat-pick">${categories('expense').map(c => `<button class="cat ${row.categoryId === c.id ? 'on' : ''}" data-id="${c.id}">${catIc(c)}<span class="cat-name">${esc(c.name)}</span></button>`).join('')}</div>`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.id) { row.categoryId = b.dataset.id; ctl.close(); done(); }
      };
    },
  });
}
