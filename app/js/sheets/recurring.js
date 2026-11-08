// Pagos recurrentes: alquiler, servicios, suscripciones, sueldo…
import { recurrings, getRecurring, getCategory, categories, accounts, upsert, remove } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, money, signed, amountInput, parseAmount, fmtNum, mark, ensureVisible } from '../ui.js';
import { sheetHead, catIc, catGrid, accChips, empty } from '../components.js';
import { dayMonth, relDay, MONTHS_SHORT } from '../dates.js';
import { nextOccurrence, runAutoRecurring } from '../logic/recurring.js';

const freqText = r => (r.frequency === 'yearly' ? `Cada año, el ${r.day} de ${MONTHS_SHORT[r.month - 1]}` : `Todos los meses, el día ${r.day}`);

export function openRecurring() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const all = recurrings();
      const active = all.filter(r => r.active !== false);
      const paused = all.filter(r => r.active === false);
      const monthly = t => active.filter(r => r.type === t && r.frequency !== 'yearly').reduce((s, r) => s + r.amount, 0);
      const row = r => {
        const c = getCategory(r.categoryId) || { icon: 'repeat', color: '#94A3FF' };
        const next = r.active !== false ? nextOccurrence(r) : null;
        return `<button class="item tap" data-id="${r.id}">${catIc(c)}
          <span class="info"><b><span class="ell">${esc(r.name)}</span>${r.auto ? '<span class="tag">Auto</span>' : ''}</b>
            <small>${freqText(r)}${next ? ` · próximo ${dayMonth(next)}` : ''}</small></span>
          <span class="val ${r.type === 'income' ? 'pos' : ''}">${signed(r.type === 'income' ? r.amount : -r.amount)}</span></button>`;
      };
      el.innerHTML = `${sheetHead('Pagos recurrentes')}
        ${active.length ? `<div class="row" style="margin-bottom:14px">
          <div class="pill"><small>Gastos fijos por mes</small><b>${money(monthly('expense'))}</b></div>
          <div class="pill"><small>Ingresos fijos por mes</small><b class="pos">${money(monthly('income'))}</b></div></div>
          <div class="list">${active.map(row).join('')}</div>`
          : empty('repeat', 'Sin pagos recurrentes', 'Cargá lo que pagás o cobrás todos los meses (alquiler, servicios, Netflix, sueldo) y te aviso cuando vence.')}
        <button class="btn primary" data-new style="margin-top:14px">${icon('plus')}Nuevo pago recurrente</button>
        ${paused.length ? `<div class="section-h"><h3>Pausados</h3></div><div class="list">${paused.map(row).join('')}</div>` : ''}`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) ctl.close();
        else if ('new' in b.dataset) openRecurringEdit();
        else if (b.dataset.id) openRecurringEdit(b.dataset.id);
      };
    },
  });
}

export function openRecurringEdit(id) {
  const ex = id ? getRecurring(id) : null;
  const F = {
    type: ex?.type || 'expense', name: ex?.name || '', amount: ex?.amount ? fmtNum(ex.amount) : '',
    categoryId: ex?.categoryId || null, accountId: ex?.accountId || null,
    frequency: ex?.frequency || 'monthly', month: ex?.month || new Date().getMonth() + 1,
    day: ex?.day ? String(ex.day) : '', auto: ex?.auto ?? false,
  };

  openSheet({
    full: true,
    render(el, ctl) {
      const cats = categories(F.type);
      const accs = accounts().filter(a => F.type === 'expense' || a.type !== 'credit');
      if (!accs.some(a => a.id === F.accountId)) F.accountId = accs[0]?.id ?? null;

      el.innerHTML = `${sheetHead(ex ? 'Editar pago recurrente' : 'Nuevo pago recurrente')}
        <div class="seg" id="rtype" style="margin-bottom:16px"><button data-type="expense" class="${F.type === 'expense' ? 'on' : ''}">Gasto fijo</button><button data-type="income" class="${F.type === 'income' ? 'on' : ''}">Ingreso fijo</button></div>
        <div class="field"><label for="rn">Nombre</label><input class="input" id="rn" maxlength="40" autocomplete="off" placeholder="${F.type === 'expense' ? 'Ej: Alquiler, Luz, Netflix' : 'Ej: Sueldo'}" value="${esc(F.name)}"></div>
        <div class="field"><label for="ra">Monto</label><input class="input" id="ra" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.amount}">
          <p class="help">Si cambia todos los meses (luz, gas), poné un aproximado: lo vas a poder corregir al registrarlo.</p></div>
        <div class="field"><label>Categoría</label>${catGrid(cats, F.categoryId)}</div>
        <div class="field"><label>${F.type === 'expense' ? 'Se paga con' : 'Entra en'}</label>${accChips(accs, F.accountId)}</div>
        <div class="field"><label>Frecuencia</label><div class="seg" id="rfreq"><button data-freq="monthly" class="${F.frequency === 'monthly' ? 'on' : ''}">Todos los meses</button><button data-freq="yearly" class="${F.frequency === 'yearly' ? 'on' : ''}">Una vez al año</button></div></div>
        ${F.frequency === 'yearly' ? `<div class="field"><label>Mes</label><div class="chips wrap" id="rmonth">${MONTHS_SHORT.map((m, i) =>
          `<button class="chip ${F.month === i + 1 ? 'on' : ''}" data-month="${i + 1}">${m}</button>`).join('')}</div></div>` : ''}
        <div class="field"><label for="rd">Día del mes</label><input class="input" id="rd" inputmode="numeric" maxlength="2" placeholder="Ej: 10" value="${F.day}"></div>
        <button class="switch-row" data-auto><span class="info"><b>Registrar automáticamente</b><small>Para débitos automáticos de monto fijo. Si está apagado, te aviso y lo confirmás vos.</small></span><span class="switch ${F.auto ? 'on' : ''}"></span></button>
        <button class="btn primary" data-save style="margin-top:16px">${ex ? 'Guardar cambios' : 'Crear pago recurrente'}</button>
        ${ex ? `<div class="row" style="margin-top:10px">
          <button class="btn" data-pause>${icon(ex.active === false ? 'play' : 'pause')}${ex.active === false ? 'Reactivar' : 'Pausar'}</button>
          <button class="btn danger" data-delete>${icon('trash-2')}Eliminar</button></div>` : ''}`;

      ['#g-cat', '#g-acc'].forEach(s => ensureVisible(el.querySelector(s)));
      el.querySelector('#rn').oninput = e => { F.name = e.target.value; };
      amountInput(el.querySelector('#ra'), v => { F.amount = v; });
      el.querySelector('#rd').addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
        F.day = e.target.value;
      });

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.type) { if (F.type !== d.type) { F.type = d.type; F.categoryId = null; ctl.refresh(); } return; }
        if (d.freq) { F.frequency = d.freq; return ctl.refresh(); }
        if (d.month) { F.month = Number(d.month); return mark(el.querySelector('#rmonth'), b); }
        if (d.cat) { F.categoryId = d.cat; return mark(el.querySelector('#g-cat'), b); }
        if (d.acc) { F.accountId = d.acc; return mark(el.querySelector('#g-acc'), b); }
        if ('auto' in d) { F.auto = !F.auto; return b.querySelector('.switch').classList.toggle('on', F.auto); }
        if ('save' in d) return save(ctl);
        if ('pause' in d) {
          await upsert('recurring', { id: ex.id, active: ex.active === false });
          toast(ex.active === false ? 'Pago reactivado' : 'Pago pausado', { icon: ex.active === false ? 'play' : 'pause' });
          return ctl.close();
        }
        if ('delete' in d) {
          if (!confirm(`¿Eliminar "${ex.name}"? Los movimientos que ya registraste quedan.`)) return;
          await remove('recurring', ex.id);
          toast('Pago recurrente eliminado', { icon: 'trash-2' });
          ctl.close();
        }
      };
    },
  });

  async function save(ctl) {
    const amount = parseAmount(F.amount), day = Number(F.day);
    const problem = !F.name.trim() ? 'Ponele un nombre'
      : !amount ? 'Poné el monto'
      : !F.categoryId ? 'Elegí una categoría'
      : !F.accountId ? 'Elegí una cuenta'
      : !(day >= 1 && day <= 31) ? 'El día tiene que ser del 1 al 31' : null;
    if (problem) { toast(problem, { icon: 'info' }); return; }

    const rec = {
      type: F.type, name: F.name.trim(), amount, categoryId: F.categoryId, accountId: F.accountId,
      frequency: F.frequency, month: F.frequency === 'yearly' ? F.month : null, day, auto: F.auto,
    };
    const scheduleChanged = !ex || ex.day !== day || ex.frequency !== F.frequency || (ex.month ?? null) !== rec.month;
    // Empieza desde la próxima fecha (para no registrar de nuevo algo que ya pagaste este mes).
    if (scheduleChanged) rec.startDate = nextOccurrence(rec);
    if (ex) rec.id = ex.id; else rec.active = true;
    const saved = await upsert('recurring', rec);
    const created = await runAutoRecurring();
    toast(ex ? 'Cambios guardados' : `Listo. Próximo: ${dayMonth(nextOccurrence(saved))} (${relDay(nextOccurrence(saved))})`);
    if (created) setTimeout(() => toast(created === 1 ? 'Se registró 1 pago automático' : `Se registraron ${created} pagos automáticos`, { icon: 'repeat' }), 2400);
    ctl.close();
  }
}
