// Alertas de precio, recordatorios de compra y lista de avisos.
import { state, alertRules, alertLog, upsert, upsertMany, remove, saveSettings } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, amountInput, parseAmount, fmtNum, mark } from '../ui.js';
import { sheetHead, catIc, empty } from '../components.js';
import { dayLabel } from '../dates.js';
import { MARKETS, quoteOf, refreshMarket, linkedHoldings } from '../logic/market.js';
import { hoursFor, arNow } from '../logic/market-hours.js';
import { RULE_TYPES, fmtPrice } from '../logic/alerts-core.js';
import { openPickAsset, marketIc } from './pick-asset.js';
import { ruleText } from './asset.js';
import { pushSupported, pushEnabled, enablePush, disablePush } from '../logic/push.js';

const WEEKDAYS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes']];

/** Panel principal: reglas, avisos automáticos y notificaciones. */
export function openAlerts() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const rules = alertRules();
      const plans = rules.filter(r => r.type === 'plan');
      const price = rules.filter(r => r.type !== 'plan');
      const auto = state.settings.autoMove ?? 5;
      const hoursOn = state.settings.marketHours !== false;
      // Aviso de las 17:00: lo que elijas; si nunca lo tocaste, se activa solo si tenés bonos u ONs.
      const holdsFixed = linkedHoldings().some(i => i.market === 'bond' || i.market === 'on');
      const fixedOn = hoursOn && (state.settings.closeFixedAlert ?? holdsFixed);
      const row = r => `<button class="item tap" data-id="${r.id}">${catIc({ icon: r.type === 'plan' ? 'calendar-clock' : 'bell', color: r.active === false ? '#4A5866' : r.type === 'plan' ? '#2EF2A0' : '#00E5FF' })}
        <span class="info"><b>${esc(ruleText(r, quoteOf(r.market, r.ticker)?.ccy))}</b><small>${r.active === false ? 'Pausada' : r.armed === false ? 'Ya avisó · se reactiva si vuelve atrás' : 'Activa'}</small></span>${icon('chevron-right', 'chev')}</button>`;

      el.innerHTML = `${sheetHead('Alertas y recordatorios')}
        ${notifCard()}
        <div class="label" style="margin:2px 4px 8px">Horario del mercado (Cocos)</div>
        <button class="switch-row" data-hours style="margin-bottom:8px">${icon('clock')}<span class="info"><b>Apertura y cierre</b><small>Cuando abre a las ${hoursFor(arNow().date).open} (o si hoy no abre por feriado) y 1 hora antes del cierre de acciones y CEDEARs a 24 hs (${hoursFor(arNow().date).equityClose}), con aviso si al día siguiente no hay mercado.</small></span><span class="switch ${hoursOn ? 'on' : ''}"></span></button>
        <button class="switch-row" data-fixed style="margin-bottom:14px${hoursOn ? '' : ';opacity:.45'}">${icon('clock')}<span class="info"><b>Cierre de contado inmediato, cauciones y bonos</b><small>1 hora antes de las ${hoursFor(arNow().date).fixedClose}. Activalo si operás en contado inmediato, cauciones o renta fija${holdsFixed && state.settings.closeFixedAlert == null ? ' (se activó solo porque tenés bonos u ONs)' : ''}.</small></span><span class="switch ${fixedOn ? 'on' : ''}"></span></button>
        <div class="field"><label>Aviso automático para lo que tenés</label>
          <div class="seg">${[[0, 'Apagado'], [3, '±3%'], [5, '±5%'], [8, '±8%']].map(([v, l]) => `<button data-auto="${v}" class="${auto === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <p class="help">Te aviso cuando algo de tu cartera se mueve más que eso en un día.</p></div>
        <div class="section-h"><h3>Alertas de precio</h3></div>
        ${price.length ? `<div class="list">${price.map(row).join('')}</div>` : '<p class="help" style="margin:0 4px">Ninguna todavía.</p>'}
        <div class="section-h"><h3>Planes de compra</h3></div>
        ${plans.length ? `<div class="list">${plans.map(row).join('')}</div>` : '<p class="help" style="margin:0 4px">Por ejemplo: "comprar SPY por $50.000 el día 10 de cada mes". Te lo recuerdo ese día.</p>'}
        <div class="row" style="margin-top:16px"><button class="btn primary" data-new>${icon('bell')}Nueva alerta</button><button class="btn" data-plan>${icon('calendar-clock')}Nuevo plan</button></div>
        <button class="btn ghost" data-log style="margin-top:8px">${icon('list')}Ver avisos anteriores</button>`;

      bindNotif(el, ctl);
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.auto !== undefined) { await saveSettings({ autoMove: Number(d.auto) }); return; }
        if ('hours' in d) { await saveSettings({ marketHours: state.settings.marketHours === false }); return; }
        if ('fixed' in d) {
          if (!hoursOn) { toast('Primero activá los avisos de apertura y cierre', { icon: 'info' }); return; }
          await saveSettings({ closeFixedAlert: !fixedOn });
          return;
        }
        if ('new' in d) return openAlertEdit();
        if ('plan' in d) return openAlertEdit(null, { type: 'plan' });
        if ('log' in d) return openAlertLog();
        if (d.id) return openAlertEdit(d.id);
        notifClick(d, ctl);
      };
    },
  });
}

/* ---------- Notificaciones ---------- */
function notifCard() {
  const s = pushSupported();
  if (s === 'unsupported') return '<p class="help" style="margin:0 4px 14px">Este navegador no permite notificaciones. Las alertas aparecen al abrir la app.</p>';
  if (s === 'install') return `<section class="card card-cta"><span class="cta-ic">${icon('bell-ring')}</span><span class="info"><b>Para recibir notificaciones</b><small>Instalá la app en el iPhone (Safari → Compartir → Agregar a inicio) y activalas desde ahí.</small></span></section>`;
  if (pushEnabled()) return `<button class="switch-row" data-notif-off style="margin-bottom:14px">${icon('bell-ring')}<span class="info"><b>Notificaciones activadas</b><small>Te llegan aunque la app esté cerrada.</small></span><span class="switch on"></span></button>`;
  return `<button class="switch-row" data-notif-on style="margin-bottom:14px">${icon('bell-ring')}<span class="info"><b>Activar notificaciones</b><small>Para enterarte aunque no abras la app.</small></span><span class="switch"></span></button>`;
}
function bindNotif() { /* los clics se manejan en notifClick */ }
async function notifClick(d, ctl) {
  if ('notifOn' in d) {
    try { await enablePush(); toast('Notificaciones activadas', { icon: 'bell-ring' }); }
    catch (e) { toast(e.message || 'No se pudieron activar', { icon: 'info' }); }
    ctl.refresh();
  } else if ('notifOff' in d) {
    if (!confirm('¿Dejar de recibir notificaciones en este dispositivo?')) return;
    await disablePush();
    ctl.refresh();
  }
}

/* ---------- Crear / editar ---------- */
export function openAlertEdit(id, preset = {}) {
  const ex = id ? alertRules().find(r => r.id === id) : null;
  const F = {
    type: ex?.type || preset.type || 'below', market: ex?.market || preset.market || null, ticker: ex?.ticker || preset.ticker || null,
    value: ex?.value != null ? String(ex.value).replace('.', ',') : '', note: ex?.note || '',
    frequency: ex?.plan?.frequency || 'monthly', day: ex?.plan?.day || 10, weekday: ex?.plan?.weekday || 1,
    amount: ex?.plan?.amount ? fmtNum(ex.plan.amount) : '',
  };
  openSheet({
    full: true,
    render(el, ctl) {
      const isPlan = F.type === 'plan';
      const unit = RULE_TYPES[F.type].unit;
      const q = F.ticker ? quoteOf(F.market, F.ticker) : null;
      el.innerHTML = `${sheetHead(ex ? 'Editar' : isPlan ? 'Nuevo plan de compra' : 'Nueva alerta')}
        <div class="field"><label>Activo</label>
          ${F.ticker ? `<button class="item tap pick-box" data-pickt>${catIc(marketIc(F.market))}<span class="info"><b>${esc(F.ticker)}</b><small>${MARKETS[F.market]?.label || ''}${q ? ` · ahora ${fmtPrice(q.price, q.ccy)}` : ''}</small></span>${icon('pencil', 'chev')}</button>`
            : `<button class="btn" data-pickt>${icon('search')}Elegir activo</button>`}</div>
        ${isPlan ? '' : `<div class="field"><label>Avisarme</label><div class="chips wrap" id="rt">${Object.entries(RULE_TYPES).filter(([k]) => k !== 'plan').map(([k, t]) =>
          `<button class="chip ${F.type === k ? 'on' : ''}" data-type="${k}">${t.label}</button>`).join('')}</div></div>
          <div class="field"><label for="rv">${unit === 'price' ? `Precio${F.market === 'crypto' ? ' (USD)' : ''}` : 'Porcentaje'}</label>
            <input class="input input-big" id="rv" inputmode="decimal" autocomplete="off" placeholder="${unit === 'price' ? (q ? String(Math.round(q.price)) : '0') : 'Ej: 10'}" value="${F.value}">
            ${F.type.startsWith('cost') ? '<p class="help">Se compara con tu precio promedio de compra (solo para lo que tenés en cartera).</p>' : ''}</div>`}
        ${isPlan ? `
          <div class="field"><label>Cada cuánto</label><div class="seg" id="pf"><button data-freq="monthly" class="${F.frequency === 'monthly' ? 'on' : ''}">Todos los meses</button><button data-freq="weekly" class="${F.frequency === 'weekly' ? 'on' : ''}">Todas las semanas</button></div></div>
          ${F.frequency === 'monthly'
            ? `<div class="field"><label for="pd">Día del mes</label><input class="input" id="pd" inputmode="numeric" maxlength="2" value="${F.day}"></div>`
            : `<div class="field"><label>Día</label><div class="chips wrap" id="pw">${WEEKDAYS.map(([v, l]) => `<button class="chip ${Number(F.weekday) === v ? 'on' : ''}" data-wd="${v}">${l}</button>`).join('')}</div></div>`}
          <div class="field"><label for="pa">Monto a invertir (opcional)</label><input class="input" id="pa" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.amount}"></div>` : ''}
        <div class="field"><label for="rn">Nota (opcional)</label><input class="input" id="rn" maxlength="80" autocomplete="off" placeholder="${isPlan ? 'Ej: con lo que sobra del sueldo' : 'Ej: zona de compra'}" value="${esc(F.note)}"></div>
        <button class="btn primary" data-save>${ex ? 'Guardar cambios' : isPlan ? 'Crear plan' : 'Crear alerta'}</button>
        ${ex ? `<div class="row" style="margin-top:10px"><button class="btn" data-pause>${icon(ex.active === false ? 'play' : 'pause')}${ex.active === false ? 'Reactivar' : 'Pausar'}</button><button class="btn danger" data-delete>${icon('trash-2')}Eliminar</button></div>` : ''}`;

      const rv = el.querySelector('#rv');
      if (rv) rv.oninput = () => { rv.value = rv.value.replace(/[^\d.,]/g, ''); F.value = rv.value; };
      el.querySelector('#rn').oninput = e => { F.note = e.target.value; };
      const pd = el.querySelector('#pd');
      if (pd) pd.oninput = () => { pd.value = pd.value.replace(/\D/g, '').slice(0, 2); F.day = Number(pd.value) || ''; };
      const pa = el.querySelector('#pa');
      if (pa) amountInput(pa, v => { F.amount = v; });

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if ('pickt' in d) return openPickAsset({ title: 'Elegí el activo', onPick: a => { F.market = a.market; F.ticker = a.ticker; ctl.refresh(); } });
        if (d.type) { F.type = d.type; F.value = ''; return ctl.refresh(); }
        if (d.freq) { F.frequency = d.freq; return ctl.refresh(); }
        if (d.wd) { F.weekday = Number(d.wd); return mark(el.querySelector('#pw'), b); }
        if ('pause' in d) { await upsert('alerts', { id: ex.id, active: ex.active === false, armed: true }); return ctl.close(); }
        if ('delete' in d) { if (!confirm('¿Eliminar?')) return; await remove('alerts', ex.id); toast('Eliminada', { icon: 'trash-2' }); return ctl.close(); }
        if ('save' in d) {
          if (!F.ticker) { toast('Elegí el activo', { icon: 'info' }); return; }
          const rec = { type: F.type, market: F.market, ticker: F.ticker, note: F.note.trim(), active: true, armed: true };
          if (isPlan) {
            const day = Number(F.day);
            if (F.frequency === 'monthly' && !(day >= 1 && day <= 31)) { toast('El día tiene que ser del 1 al 31', { icon: 'info' }); return; }
            rec.plan = { frequency: F.frequency, day, weekday: F.weekday, amount: parseAmount(F.amount) };
          } else {
            const v = Number(String(F.value).replace(/\./g, '').replace(',', '.'));
            if (!(v > 0)) { toast(RULE_TYPES[F.type].unit === 'price' ? 'Poné el precio' : 'Poné el porcentaje', { icon: 'info' }); return; }
            rec.value = v;
          }
          if (ex) rec.id = ex.id;
          await upsert('alerts', rec);
          toast(ex ? 'Guardado' : isPlan ? 'Plan creado: te aviso ese día' : 'Alerta creada', { icon: 'bell' });
          ctl.close();
          refreshMarket({ force: true });
        }
      };
    },
  });
}

/* ---------- Avisos ---------- */
export function openAlertLog() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const log = alertLog().slice(0, 100);
      const unseen = log.filter(a => !a.seen);
      el.innerHTML = `${sheetHead('Avisos')}
        ${log.length ? `<div class="list">${log.map(a => `<button class="item tap ${a.seen ? '' : 'unseen'}" data-asset="${a.market}|${a.ticker}">
            ${catIc({ icon: a.type === 'plan' ? 'calendar-clock' : 'bell', color: a.seen ? '#4A5866' : '#00E5FF' })}
            <span class="info"><b>${esc(a.title)}</b><small>${dayLabel(a.date)} · ${esc(a.body)}</small></span></button>`).join('')}</div>`
          : empty('bell', 'Sin avisos todavía', 'Cuando una alerta se cumpla o algo de tu cartera se mueva fuerte, aparece acá.')}
        <button class="btn" data-cfg style="margin-top:14px">${icon('settings')}Configurar alertas</button>`;
      if (unseen.length) setTimeout(() => upsertMany('alertlog', unseen.map(a => ({ id: a.id, seen: true }))), 1500);
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if ('cfg' in b.dataset) return openAlerts();
        if (b.dataset.asset) {
          const [market, ticker] = b.dataset.asset.split('|');
          if (market && ticker && market !== 'undefined') { const { openAsset } = await import('./asset.js'); openAsset({ market, ticker }); }
        }
      };
    },
  });
}
