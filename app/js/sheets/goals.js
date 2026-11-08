// Metas de ahorro: cuánto querés juntar, para cuándo y cuánto tenés que ahorrar por mes.
import { goals, getGoal, accounts, upsert, remove, uid } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, money, amountInput, parseAmount, fmtNum, mark, ensureVisible } from '../ui.js';
import { sheetHead, catIc, empty, ring } from '../components.js';
import { COLORS, GOAL_ICONS } from '../constants.js';
import { today, shortDate, dayLabel } from '../dates.js';
import { goalPlan, activeInvestments } from '../logic/wealth.js';
import { openAmountSheet } from './amount.js';

const SOURCES = { manual: 'La voy sumando a mano', account: 'Es el saldo de una cuenta', investment: 'Es el valor de una inversión' };

function planText(g, p) {
  if (p.left === 0) return '<span class="pos">¡Meta cumplida!</span>';
  if (p.overdue) return `<span class="neg">Se pasó la fecha</span> · faltan ${money(p.left)}`;
  if (p.perMonth) return `Ahorrá <b>${money(p.perMonth)}</b> por mes para llegar al ${shortDate(g.deadline)}`;
  return `Faltan ${money(p.left)}`;
}

export function openGoals() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const list = goals().map(g => ({ g, p: goalPlan(g) }));
      const active = list.filter(x => x.p.left > 0);
      const done = list.filter(x => x.p.left === 0);
      const card = ({ g, p }) => `<button class="goal-card" data-id="${g.id}">
        <div class="goal-ring">${ring(p.pct, 64, g.color)}<span style="color:${g.color}">${icon(g.icon)}</span></div>
        <div class="info"><b>${esc(g.name)}</b>
          <small>${money(p.saved)} de ${money(g.target)} · ${Math.min(100, Math.round(p.pct * 100))}%</small>
          <small class="plan">${planText(g, p)}</small></div></button>`;
      el.innerHTML = `${sheetHead('Metas de ahorro')}
        ${list.length ? active.map(card).join('') : empty('target', 'Sin metas todavía', 'Un viaje, un auto, un fondo de emergencia… Poné cuánto querés juntar y para cuándo, y te digo cuánto ahorrar por mes.')}
        <button class="btn primary" data-new style="margin-top:6px">${icon('plus')}Nueva meta</button>
        ${done.length ? `<div class="section-h"><h3>Cumplidas</h3></div>${done.map(card).join('')}` : ''}`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) ctl.close();
        else if ('new' in b.dataset) openGoalEdit();
        else if (b.dataset.id) openGoal(b.dataset.id);
      };
    },
  });
}

export function openGoal(id) {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const g = getGoal(id);
      if (!g || g.deleted) { ctl.close(); return; }
      const p = goalPlan(g);
      const manual = (g.source || 'manual') === 'manual';
      const entries = [...(g.entries || [])].sort((a, b) => b.date.localeCompare(a.date));
      const srcName = g.source === 'account' ? accounts(true).find(a => a.id === g.sourceId)?.name
        : g.source === 'investment' ? activeInvestments().find(i => i.id === g.sourceId)?.name : null;

      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>${esc(g.name)}</h2>
          <div class="row" style="gap:8px"><button class="icon-btn" data-edit aria-label="Editar">${icon('pencil')}</button><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div></div>
        <section class="card hero goal-hero">
          <div class="goal-ring big">${ring(p.pct, 132, g.color, 10)}<div class="goal-center"><b>${Math.min(100, Math.round(p.pct * 100))}%</b><small>${money(p.saved)}</small></div></div>
          <div class="rows">
            <div><span>Objetivo</span><b>${money(g.target)}</b></div>
            <div><span>Falta</span><b>${money(p.left)}</b></div>
            ${g.deadline ? `<div><span>Fecha</span><b>${shortDate(g.deadline)}</b></div>` : ''}
            ${srcName ? `<div><span>Se mide con</span><b>${esc(srcName)}</b></div>` : ''}
          </div>
          <p class="help" style="margin-top:12px">${planText(g, p)}</p>
        </section>
        ${manual ? `<div class="row"><button class="btn primary" data-plus>${icon('plus')}Sumar</button><button class="btn" data-minus>${icon('minus')}Sacar</button></div>
          <p class="help" style="margin:8px 4px 0">Sumar o sacar acá no mueve plata de tus cuentas: es para llevar la cuenta de lo que vas apartando.</p>
          ${entries.length ? `<div class="section-h"><h3>Historial</h3></div><div class="list">${entries.map(e => `<button class="item tap" data-entry="${e.id}">
            ${catIc({ icon: e.amount > 0 ? 'plus' : 'minus', color: e.amount > 0 ? g.color : '#8A9AA8' })}
            <span class="info"><b>${e.amount > 0 ? 'Sumaste' : 'Sacaste'}${e.note ? ` · ${esc(e.note)}` : ''}</b><small>${dayLabel(e.date)}</small></span>
            <span class="val ${e.amount > 0 ? 'pos' : ''}">${e.amount > 0 ? '+' : '−'}${money(Math.abs(e.amount))}</span></button>`).join('')}</div>
            <p class="help" style="margin:8px 4px 0">Tocá un registro para borrarlo.</p>` : ''}`
        : `<p class="help" style="margin:0 4px">El avance se actualiza solo con el ${g.source === 'account' ? 'saldo de la cuenta' : 'valor de la inversión'}.</p>`}
        <button class="btn danger" data-delete style="margin-top:16px">${icon('trash-2')}Eliminar meta</button>`;

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if ('edit' in d) return openGoalEdit(g.id);
        if ('plus' in d || 'minus' in d) {
          const sign = 'plus' in d ? 1 : -1;
          return openAmountSheet({
            title: sign > 0 ? `Sumar a ${g.name}` : `Sacar de ${g.name}`, label: 'Monto', saveLabel: sign > 0 ? 'Sumar' : 'Sacar',
            onSave: async v => {
              if (!v) return;
              await upsert('goals', { id: g.id, entries: [...(g.entries || []), { id: uid(), date: today(), amount: sign * v }] });
              const after = goalPlan(getGoal(g.id));
              if (sign > 0 && after.left === 0) toast(`¡Cumpliste la meta ${g.name}!`, { icon: 'party-popper' });
              else toast(sign > 0 ? 'Sumado' : 'Restado');
            },
          });
        }
        if (d.entry) {
          if (!confirm('¿Borrar este registro?')) return;
          await upsert('goals', { id: g.id, entries: (g.entries || []).filter(x => x.id !== d.entry) });
          return;
        }
        if ('delete' in d) {
          if (!confirm(`¿Eliminar la meta "${g.name}"?`)) return;
          await remove('goals', g.id);
          toast('Meta eliminada', { icon: 'trash-2' });
          ctl.close();
        }
      };
    },
  });
}

export function openGoalEdit(id) {
  const ex = id ? getGoal(id) : null;
  const F = {
    name: ex?.name || '', target: ex?.target ? fmtNum(ex.target) : '', deadline: ex?.deadline || '',
    icon: ex?.icon || 'target', color: ex?.color || COLORS[0],
    source: ex?.source || 'manual', sourceId: ex?.sourceId || null, start: '',
  };

  openSheet({
    full: true,
    render(el, ctl) {
      const accs = accounts().filter(a => a.type !== 'credit');
      const invs = activeInvestments();
      const pool = F.source === 'account' ? accs : F.source === 'investment' ? invs : [];
      if (pool.length && !pool.some(x => x.id === F.sourceId)) F.sourceId = pool[0].id;

      el.innerHTML = `${sheetHead(ex ? 'Editar meta' : 'Nueva meta')}
        <div class="preview" id="pv">${catIc(F)}<b id="pvn">${esc(F.name || 'Tu meta')}</b></div>
        <div class="field"><label for="gn">Nombre</label><input class="input" id="gn" maxlength="30" autocomplete="off" placeholder="Ej: Viaje a Brasil, Fondo de emergencia" value="${esc(F.name)}"></div>
        <div class="field"><label for="gt">¿Cuánto querés juntar?</label><input class="input" id="gt" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.target}"></div>
        <div class="field"><label>¿Para cuándo? (opcional)</label>
          <label class="date-pill" style="height:48px;width:100%;justify-content:center">${icon('calendar')}<span id="gdl">${F.deadline ? shortDate(F.deadline) : 'Sin fecha'}</span><input type="date" id="gd" value="${F.deadline}" min="${today()}"></label>
          ${F.deadline ? '<button class="link" data-nodate style="margin-top:8px">Quitar fecha</button>' : ''}</div>
        <div class="field"><label>¿Cómo se mide el avance?</label><div class="seg vertical" id="gs">${Object.entries(SOURCES).map(([k, l]) =>
          `<button data-src="${k}" class="${F.source === k ? 'on' : ''}" ${k === 'investment' && !invs.length ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>
        ${F.source === 'account' ? `<div class="field"><label>Cuenta</label><div class="chips wrap" id="gsrc">${accs.map(a => `<button class="chip ${F.sourceId === a.id ? 'on' : ''}" data-sid="${a.id}">${esc(a.name)}</button>`).join('')}</div>
          <p class="help">Ideal si tenés una cuenta o caja de ahorro solo para esto.</p></div>` : ''}
        ${F.source === 'investment' ? `<div class="field"><label>Inversión</label><div class="chips wrap" id="gsrc">${invs.map(i => `<button class="chip ${F.sourceId === i.id ? 'on' : ''}" data-sid="${i.id}">${esc(i.name)}</button>`).join('')}</div></div>` : ''}
        ${F.source === 'manual' && !ex ? `<div class="field"><label for="g0">¿Ya tenés algo ahorrado? (opcional)</label><input class="input" id="g0" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.start}"></div>` : ''}
        <div class="field"><label>Color</label><div class="swatches" id="sw">${COLORS.map(c => `<button class="swatch ${F.color === c ? 'on' : ''}" data-color="${c}" style="color:${c}" aria-label="Color"></button>`).join('')}</div></div>
        <div class="field"><label>Ícono</label><div class="icon-grid" id="ig" style="--c:${F.color}">${GOAL_ICONS.map(i => `<button class="${F.icon === i ? 'on' : ''}" data-icon="${i}" aria-label="${i}">${icon(i)}</button>`).join('')}</div></div>
        <button class="btn primary" data-save>${ex ? 'Guardar cambios' : 'Crear meta'}</button>`;

      const preview = () => {
        el.querySelector('#pv .cat-ic').outerHTML = catIc(F);
        el.querySelector('#pvn').textContent = F.name || 'Tu meta';
        el.querySelector('#ig').style.setProperty('--c', F.color);
      };
      el.querySelector('#gn').oninput = e => { F.name = e.target.value; preview(); };
      amountInput(el.querySelector('#gt'), v => { F.target = v; });
      const g0 = el.querySelector('#g0');
      if (g0) amountInput(g0, v => { F.start = v; });
      const gd = el.querySelector('#gd');
      gd.onchange = () => { F.deadline = gd.value; ctl.refresh(); };
      gd.onclick = () => { try { gd.showPicker?.(); } catch { /* selector nativo */ } };
      ensureVisible(el.querySelector('#gsrc'));

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if ('nodate' in d) { F.deadline = ''; return ctl.refresh(); }
        if (d.src) { F.source = d.src; F.sourceId = null; return ctl.refresh(); }
        if (d.sid) { F.sourceId = d.sid; return mark(el.querySelector('#gsrc'), b); }
        if (d.color) { F.color = d.color; mark(el.querySelector('#sw'), b); return preview(); }
        if (d.icon) { F.icon = d.icon; mark(el.querySelector('#ig'), b); return preview(); }
        if ('save' in d) {
          const target = parseAmount(F.target);
          if (!F.name.trim()) { toast('Ponele un nombre', { icon: 'info' }); return; }
          if (!target) { toast('Poné cuánto querés juntar', { icon: 'info' }); return; }
          const rec = {
            name: F.name.trim(), target, deadline: F.deadline || null, icon: F.icon, color: F.color,
            source: F.source, sourceId: F.source === 'manual' ? null : F.sourceId,
          };
          if (ex) rec.id = ex.id;
          else {
            const start = parseAmount(F.start);
            rec.entries = start ? [{ id: uid(), date: today(), amount: start, note: 'Lo que ya tenía' }] : [];
          }
          const saved = await upsert('goals', rec);
          toast(ex ? 'Meta actualizada' : 'Meta creada');
          ctl.close();
          if (!ex) openGoal(saved.id);
        }
      };
    },
  });
}
