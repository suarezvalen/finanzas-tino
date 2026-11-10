// Inversiones: plazo fijo, FCI, acciones, CEDEARs, bonos, cripto, dólares…
import { investments, getInvestment, getAccount, accounts, upsert, upsertMany, remove, uid } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, money, amountInput, parseAmount, fmtNum, mark, ensureVisible } from '../ui.js';
import { sheetHead, catIc, accChips, empty, sparkline, gainText } from '../components.js';
import { INVEST_KINDS } from '../constants.js';
import { today, dayMonth, relDay, shortDate, dayLabel } from '../dates.js';
import {
  investStats, activeInvestments, investSeries, linked, staleDays,
  pfEnd, pfTotal, pfInterestTotal, pfInterestAt, pfMatured,
} from '../logic/wealth.js';
import { openAmountSheet } from './amount.js';
import { openMoveSheet } from './move.js';
import { MARKETS, MARKET_TO_KIND, isLinked, holdingStats, quoteOf, marketCache } from '../logic/market.js';
import { positionValue } from '../logic/market-core.js';
import { fmtPrice } from '../logic/alerts-core.js';
import { openPickAsset } from './pick-asset.js';
import { openAsset, openTrade } from './asset.js';

const MARKETABLE = ['acciones', 'cedears', 'bonos', 'cripto'];
const parseUnits = s => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;
const fmtUnits = n => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 8 }).format(n);

const kindOf = i => INVEST_KINDS[i.kind] || INVEST_KINDS.otro;
const pctText = p => `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(1).replace('.', ',')}%`;
const now = () => new Date().toISOString();

function subLine(i) {
  if (i.closedAt) return `Finalizada el ${dayMonth(i.closedAt)}`;
  if (isLinked(i)) {
    const q = quoteOf(i.market, i.ticker);
    return `${esc(i.ticker)} · ${fmtUnits(i.units)}${q ? ` · ${fmtPrice(q.price, q.ccy)}${q.pct != null ? ` <span class="${q.pct >= 0 ? 'pos' : 'neg'}">${q.pct >= 0 ? '+' : '−'}${Math.abs(q.pct).toFixed(1).replace('.', ',')}%</span>` : ''}` : ''}`;
  }
  if (i.kind === 'plazo_fijo') {
    const end = pfEnd(i);
    return pfMatured(i) ? `<span class="acc-c">Venció el ${dayMonth(end)}: cobrá ${money(pfTotal(i))}</span>` : `${i.tna}% TNA · vence ${dayMonth(end)} (${relDay(end)})`;
  }
  const s = staleDays(i);
  return s == null ? kindOf(i).label : s > 30 ? `<span class="warn-c">Actualizá el valor (hace ${s} días)</span>` : `${kindOf(i).label} · actualizado ${s === 0 ? 'hoy' : `hace ${s} día${s > 1 ? 's' : ''}`}`;
}

/* ---------- Lista ---------- */
export function openInvestments() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const act = activeInvestments();
      const closed = investments().filter(i => i.closedAt);
      const stats = act.map(i => ({ i, ...investStats(i) }));
      const total = stats.reduce((s, x) => s + x.value, 0);
      const gain = stats.reduce((s, x) => s + x.gain, 0);
      const inv = stats.reduce((s, x) => s + x.invested, 0);
      const byKind = {};
      for (const x of stats) byKind[x.i.kind] = (byKind[x.i.kind] || 0) + x.value;
      const kinds = Object.entries(byKind).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

      const row = x => `<button class="item tap" data-id="${x.i.id}">${catIc(kindOf(x.i))}
        <span class="info"><b>${esc(x.i.name)}</b><small>${subLine(x.i)}</small></span>
        <span class="val">${money(x.value)}${x.i.closedAt ? '' : `<small class="sub-val ${x.gain >= 0 ? 'pos' : 'neg'}">${pctText(x.pct)}</small>`}</span></button>`;

      el.innerHTML = `${sheetHead('Inversiones')}
        ${act.length ? `
        <section class="card hero">
          <div class="label">Valor total</div>
          <div class="amount" style="font-size:32px;margin-top:6px">${money(total)}</div>
          <div class="net" style="margin-bottom:6px"><span>${gainText(gain, inv > 0 ? gain / inv : 0)}</span>${sparkline(investSeries(6))}</div>
          ${kinds.length > 1 ? `<div class="stack">${kinds.map(([k, v]) => `<i style="width:${(v / total) * 100}%;background:${INVEST_KINDS[k].color}"></i>`).join('')}</div>
          <div class="inv-legend">${kinds.map(([k, v]) => `<div><i style="background:${INVEST_KINDS[k].color}"></i>${INVEST_KINDS[k].label}<b>${Math.round((v / total) * 100)}%</b></div>`).join('')}</div>` : ''}
        </section>
        <div class="list">${stats.sort((a, b) => b.value - a.value).map(row).join('')}</div>
        <p class="help" style="margin:10px 4px 0">El plazo fijo se calcula solo, y lo que tiene ticker (acciones, CEDEARs, bonos, cripto) se actualiza con el precio del mercado. Para el resto, actualizá el valor cada tanto.</p>`
        : empty('trending-up', 'Todavía no cargaste inversiones', 'Sumá tus plazos fijos, fondos, acciones, CEDEARs, cripto o dólares para ver cuánto tenés y cuánto ganás.')}
        <button class="btn primary" data-new style="margin-top:14px">${icon('plus')}Nueva inversión</button>
        ${closed.length ? `<div class="section-h"><h3>Finalizadas</h3></div><div class="list">${closed.map(i => row({ i, ...investStats(i) })).join('')}</div>` : ''}`;

      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) ctl.close();
        else if ('new' in b.dataset) openInvestmentEdit();
        else if (b.dataset.id) openInvestment(b.dataset.id);
      };
    },
  });
}

/* ---------- Detalle ---------- */
export function openInvestment(id) {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const i = getInvestment(id);
      if (!i || i.deleted) { ctl.close(); return; }
      const st = investStats(i);
      const k = kindOf(i);
      const isPF = i.kind === 'plazo_fijo';
      const matured = pfMatured(i);
      const moves = linked('investment', i.id);

      // Historial: valores informados + aportes y retiros.
      const hist = [
        ...(isPF ? [] : (i.valuations || []).map((v, idx) => ({ date: v.date, at: v.at, kind: 'val', idx, v }))),
        ...moves.map(t => ({ date: t.date, at: t.createdAt, kind: 'tx', t })),
      ].sort((a, b) => b.date.localeCompare(a.date) || (b.at || '').localeCompare(a.at || ''));
      const histRow = h => h.kind === 'val'
        ? `<button class="item tap" data-val="${h.idx}">${catIc({ icon: 'refresh-cw', color: '#8A9AA8' })}
            <span class="info"><b>Valor actualizado</b><small>${dayLabel(h.date)}</small></span><span class="val">${money(h.v.value)}</span></button>`
        : `<button class="item tap" data-mtx="${h.t.id}">${catIc({ icon: h.t.type === 'out' ? 'arrow-down-to-line' : 'arrow-up-from-line', color: h.t.type === 'out' ? '#00E5FF' : '#FFB547' })}
            <span class="info"><b>${h.t.type === 'out' ? 'Aporte' : 'Retiro'}${h.t.note ? ` · ${esc(h.t.note)}` : ''}</b><small>${dayLabel(h.date)} · ${h.t.type === 'out' ? 'desde' : 'a'} ${esc(getAccount(h.t.accountId)?.name || '—')}</small></span>
            <span class="val">${h.t.type === 'out' ? '+' : '−'}${money(h.t.amount)}</span></button>`;

      let body;
      if (isPF) {
        const end = pfEnd(i);
        body = `<section class="card">
          <div class="rows" style="margin-top:0">
            <div><span>Capital</span><b>${money(i.capital)}</b></div>
            <div><span>Tasa (TNA)</span><b>${String(i.tna).replace('.', ',')}%</b></div>
            <div><span>Inicio</span><b>${shortDate(i.startDate)}</b></div>
            <div><span>Vencimiento</span><b>${shortDate(end)}${i.closedAt ? '' : ` · ${relDay(end)}`}</b></div>
            <div><span>Interés ganado hasta hoy</span><b class="pos">${money(pfInterestAt(i))}</b></div>
            <div class="big"><span>Cobrás al vencer</span><b>${money(pfTotal(i))}</b></div>
          </div>
          ${matured ? `<div class="row" style="margin-top:14px"><button class="btn primary" data-collect>${icon('arrow-up-from-line')}Cobrar</button><button class="btn" data-renew>${icon('refresh-cw')}Renovar</button></div>` : ''}
        </section>`;
      } else if (isLinked(i)) {
        const hs = holdingStats(i);
        body = `<section class="card"><div class="rows" style="margin-top:0">
            <div><span>Ticker</span><b>${esc(i.ticker)} · ${MARKETS[i.market]?.short || ''}</b></div>
            <div><span>Cantidad</span><b>${fmtUnits(i.units)}</b></div>
            <div><span>Precio actual</span><b>${hs.quote ? fmtPrice(hs.quote.price, hs.quote.ccy) : '—'}</b></div>
            <div><span>Precio promedio</span><b>${hs.cost ? fmtPrice(hs.cost, hs.quote?.ccy) : '—'}</b></div>
          </div></section>
          <div class="actions3">
          <button class="btn" data-buy>${icon('plus')}Comprar</button>
          <button class="btn" data-sell>${icon('minus')}Vender</button>
          <button class="btn" data-asset>${icon('chart-line')}Análisis</button></div>`;
      } else if (!i.closedAt) {
        body = `${MARKETABLE.includes(i.kind) ? `<button class="card card-cta" data-edit><span class="cta-ic">${icon('chart-line')}</span><span class="info"><b>Conectala con el mercado</b><small>Poné el ticker y la cantidad, y el valor se actualiza solo</small></span>${icon('chevron-right', 'chev')}</button>` : ''}<div class="actions3">
          <button class="btn" data-update>${icon('refresh-cw')}Actualizar valor</button>
          <button class="btn" data-add>${icon('arrow-down-to-line')}Agregar</button>
          <button class="btn" data-withdraw>${icon('arrow-up-from-line')}Retirar</button></div>`;
      } else body = '';

      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>${esc(i.name)}</h2>
          <div class="row" style="gap:8px"><button class="icon-btn" data-edit aria-label="Editar">${icon('pencil')}</button><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div></div>
        <section class="card hero">
          <div class="row" style="align-items:center;gap:10px">${catIc(k)}<div class="label">${k.label}${i.closedAt ? ' · finalizada' : ''}</div></div>
          <div class="amount" style="font-size:32px;margin:10px 0 4px">${money(st.value)}</div>
          <div style="font-size:13.5px">${gainText(st.gain, st.pct)}</div>
          <div class="rows"><div><span>Plata puesta</span><b>${money(st.invested)}</b></div></div>
        </section>
        ${body}
        ${hist.length ? `<div class="section-h"><h3>Historial</h3></div><div class="list">${hist.map(histRow).join('')}</div>
          <p class="help" style="margin:8px 4px 0">Tocá un registro para borrarlo.</p>` : ''}
        <div class="row" style="margin-top:16px">
          ${i.closedAt ? `<button class="btn" data-reopen>${icon('archive-restore')}Reabrir</button>` : `<button class="btn" data-finish>${icon('archive')}Finalizar</button>`}
          <button class="btn danger" data-delete>${icon('trash-2')}Eliminar</button></div>`;

      const linkTx = (role, type, r) => ({
        type, amount: r.amount, date: r.date, note: r.note, accountId: r.accountId,
        link: { kind: 'investment', id: i.id, role },
      });

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if ('edit' in d) return openInvestmentEdit(i.id);
        if ('buy' in d) return openTrade({ inv: i, side: 'buy' });
        if ('sell' in d) return openTrade({ inv: i, side: 'sell' });
        if ('asset' in d) return openAsset({ market: i.market, ticker: i.ticker });
        if ('update' in d) {
          return openAmountSheet({
            title: 'Actualizar valor', label: `¿Cuánto vale hoy ${i.name}?`, value: st.value,
            help: i.kind === 'dolares' ? 'Poné el valor en pesos al tipo de cambio de hoy.' : 'Lo ves en la app de tu banco o broker.',
            onSave: async v => {
              await upsert('investments', { id: i.id, valuations: [...(i.valuations || []), { date: today(), at: now(), value: v }] });
              toast('Valor actualizado');
            },
          });
        }
        if ('add' in d) {
          return openMoveSheet({
            title: `Agregar a ${i.name}`, accountLabel: 'Desde', saveLabel: 'Agregar',
            onSave: async r => { await upsert('transactions', linkTx('contribution', 'out', r)); toast('Aporte registrado'); },
          });
        }
        if ('withdraw' in d) {
          return openMoveSheet({
            title: `Retirar de ${i.name}`, accountLabel: 'Hacia', saveLabel: 'Retirar',
            help: `Valor actual: ${money(st.value)}.`,
            onSave: async r => {
              await upsert('transactions', linkTx('withdrawal', 'in', r));
              if (r.amount >= st.value && confirm('Retiraste todo. ¿Marcar la inversión como finalizada?')) await upsert('investments', { id: i.id, closedAt: r.date });
              toast('Retiro registrado');
            },
          });
        }
        if ('collect' in d) {
          return openMoveSheet({
            title: 'Cobrar plazo fijo', accountLabel: 'Hacia', amount: pfTotal(i), saveLabel: 'Cobrar',
            help: `Capital ${money(i.capital)} + interés ${money(pfInterestTotal(i))}.`,
            onSave: async r => {
              await upsert('transactions', linkTx('withdrawal', 'in', r));
              await upsert('investments', { id: i.id, closedAt: r.date });
              toast('Plazo fijo cobrado');
            },
          });
        }
        if ('renew' in d) {
          return openAmountSheet({
            title: 'Renovar plazo fijo', label: 'Nuevo capital', value: pfTotal(i),
            help: `Se renueva desde el ${shortDate(pfEnd(i))} por ${i.days} días al ${String(i.tna).replace('.', ',')}% (podés cambiar la tasa después con el lápiz).`,
            saveLabel: 'Renovar',
            onSave: async v => {
              const total = pfTotal(i);
              await upsert('investments', { id: i.id, capital: v, startDate: pfEnd(i) });
              // Diferencia entre lo cobrado y lo renovado: se registra como aporte o retiro de una cuenta.
              if (v !== total) {
                const diff = v - total;
                openMoveSheet({
                  title: diff > 0 ? 'Plata que agregaste' : 'Plata que retiraste', amount: Math.abs(diff),
                  accountLabel: diff > 0 ? 'Desde' : 'Hacia', saveLabel: 'Guardar',
                  onSave: async r => upsert('transactions', linkTx(diff > 0 ? 'contribution' : 'withdrawal', diff > 0 ? 'out' : 'in', { ...r, date: pfEnd(i) })),
                });
              }
              toast('Plazo fijo renovado');
            },
          });
        }
        if (d.val !== undefined) {
          const vals = [...(i.valuations || [])];
          if (vals.length <= 1) { toast('Es el valor inicial: para cambiarlo usá Actualizar valor', { icon: 'info' }); return; }
          if (!confirm('¿Borrar este registro de valor?')) return;
          vals.splice(Number(d.val), 1);
          await upsert('investments', { id: i.id, valuations: vals });
          return;
        }
        if (d.mtx) {
          if (!confirm('¿Borrar este movimiento? También se corrige el saldo de la cuenta.')) return;
          await upsert('transactions', { id: d.mtx, deleted: true });
          return;
        }
        if ('finish' in d) {
          if (st.value > 0 && !confirm(`Todavía vale ${money(st.value)}. Si la finalizás, deja de sumar a tu patrimonio. ¿Seguro?`)) return;
          await upsert('investments', { id: i.id, closedAt: today() });
          toast('Inversión finalizada', { icon: 'archive' });
          return;
        }
        if ('reopen' in d) { await upsert('investments', { id: i.id, closedAt: null }); return; }
        if ('delete' in d) {
          const msg = moves.length
            ? `¿Eliminar "${i.name}"? También se borran sus ${moves.length} aportes/retiros y se corrigen los saldos de tus cuentas.`
            : `¿Eliminar "${i.name}"?`;
          if (!confirm(msg)) return;
          await upsertMany('transactions', moves.map(t => ({ id: t.id, deleted: true })));
          await remove('investments', i.id);
          ctl.close();
          toast('Inversión eliminada', { icon: 'trash-2' });
        }
      };
    },
  });
}

/* ---------- Alta / edición ---------- */
const PF_DAYS = [30, 60, 90, 180, 365];

export function openInvestmentEdit(id, preset = null) {
  const ex = id ? getInvestment(id) : null;
  const F = {
    kind: ex?.kind || (preset ? MARKET_TO_KIND[preset.market] : 'plazo_fijo'), name: ex?.name || preset?.ticker || '',
    market: ex?.market || preset?.market || null, ticker: ex?.ticker || preset?.ticker || null,
    units: ex?.units ? String(ex.units).replace('.', ',') : '',
    amount: '', value: '',
    capital: ex?.capital ? fmtNum(ex.capital) : '', tna: ex?.tna != null ? String(ex.tna).replace('.', ',') : '',
    days: ex?.days || 30, startDate: ex?.startDate || today(),
    fromAccount: false, accountId: accounts().find(a => a.type === 'bank')?.id || accounts()[0]?.id || null,
  };

  openSheet({
    full: true,
    render(el, ctl) {
      const isPF = F.kind === 'plazo_fijo';
      const accs = accounts().filter(a => a.type !== 'credit');
      const pfPreview = () => {
        const cap = parseAmount(F.capital), tna = parseFloat(F.tna.replace(',', '.')) || 0;
        if (!cap || !tna) return 'Completá capital y tasa para ver cuánto cobrás.';
        const tmp = { capital: cap, tna, days: F.days, startDate: F.startDate };
        return `Cobrás <b>${money(pfTotal(tmp))}</b> el ${shortDate(pfEnd(tmp))} (interés ${money(pfInterestTotal(tmp))}).`;
      };

      el.innerHTML = `${sheetHead(ex ? 'Editar inversión' : 'Nueva inversión')}
        <div class="field"><label>Tipo</label><div class="chips wrap" id="ik">${Object.entries(INVEST_KINDS).map(([key, k]) =>
          `<button class="chip ${F.kind === key ? 'on' : ''}" data-kind="${key}" ${ex && (ex.kind === 'plazo_fijo') !== (key === 'plazo_fijo') ? 'disabled' : ''}>${icon(k.icon)}${k.label}</button>`).join('')}</div></div>
        <div class="field"><label for="in">Nombre</label><input class="input" id="in" maxlength="40" autocomplete="off" placeholder="${isPF ? 'Ej: Plazo fijo Galicia' : 'Ej: FCI Money Market, Bitcoin, Apple'}" value="${esc(F.name)}"></div>
        ${isPF ? `
          <div class="field"><label for="ic">Capital</label><input class="input" id="ic" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.capital}"></div>
          <div class="row">
            <div class="field" style="flex:1"><label for="it">Tasa TNA (%)</label><input class="input" id="it" inputmode="decimal" autocomplete="off" placeholder="Ej: 32,5" value="${F.tna}"></div>
            <div class="field" style="flex:1"><label>Inicio</label><label class="date-pill" style="height:48px;width:100%;justify-content:center">${icon('calendar')}<span id="idl">${shortDate(F.startDate)}</span><input type="date" id="id" value="${F.startDate}"></label></div>
          </div>
          <div class="field"><label>Plazo</label><div class="chips wrap" id="ipd">${PF_DAYS.map(dd => `<button class="chip ${F.days === dd ? 'on' : ''}" data-days="${dd}">${dd} días</button>`).join('')}</div></div>
          <p class="help" id="pfprev" style="margin:-4px 2px 16px">${pfPreview()}</p>`
        : ''}
        ${!isPF && MARKETABLE.includes(F.kind) ? `
          <div class="field"><label>Ticker (para que el valor se actualice solo)</label>
            ${F.ticker ? `<div class="row" style="align-items:center"><button class="chip on" data-pickt>${icon(MARKETS[F.market]?.icon || 'globe')}${esc(F.ticker)} · ${MARKETS[F.market]?.short || ''}${quoteOf(F.market, F.ticker) ? ` · ${fmtPrice(quoteOf(F.market, F.ticker).price, quoteOf(F.market, F.ticker).ccy)}` : ''}</button><button class="link" data-unlink>Quitar</button></div>`
              : `<button class="btn" data-pickt>${icon('search')}Buscar ticker (GGAL, AAPL, AL30, BTC…)</button>`}</div>
          ${F.ticker ? `<div class="field"><label for="iu">Cantidad que tenés${MARKETS[F.market]?.per100 ? ' (valor nominal)' : ''}</label><input class="input" id="iu" inputmode="decimal" autocomplete="off" placeholder="Ej: ${F.market === 'crypto' ? '0,015' : '100'}" value="${F.units}"></div>` : ''}` : ''}
        ${!isPF && !ex ? `
          <div class="field"><label for="ia">¿Cuánta plata pusiste?</label><input class="input" id="ia" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.amount}"></div>
          ${F.ticker ? '<p class="help" style="margin:-8px 2px 16px">El valor de hoy se calcula solo con el precio del mercado.</p>' : `<div class="field"><label for="iv">¿Cuánto vale hoy? (opcional)</label><input class="input" id="iv" inputmode="numeric" autocomplete="off" placeholder="Igual a lo que pusiste" value="${F.value}">
            <p class="help">${F.kind === 'dolares' ? 'En pesos, al tipo de cambio de hoy.' : 'Si no lo sabés, dejalo vacío y lo actualizás después.'}</p></div>`}` : ''}
        ${!ex ? `
          <button class="switch-row" data-from><span class="info"><b>La estoy haciendo ahora con plata de una cuenta</b><small>Si la inversión ya existía, dejalo apagado: tus saldos no cambian.</small></span><span class="switch ${F.fromAccount ? 'on' : ''}"></span></button>
          ${F.fromAccount ? `<div class="field" style="margin-top:12px"><label>Sale de</label>${accChips(accs, F.accountId)}</div>` : ''}` : ''}
        <button class="btn primary" data-save style="margin-top:16px">${ex ? 'Guardar cambios' : 'Crear inversión'}</button>`;

      ensureVisible(el.querySelector('#g-acc'));
      el.querySelector('#in').oninput = e => { F.name = e.target.value; };
      const bindAmt = (sel, key) => { const x = el.querySelector(sel); if (x) amountInput(x, v => { F[key] = v; const p = el.querySelector('#pfprev'); if (p) p.innerHTML = pfPreview(); }); };
      bindAmt('#ic', 'capital'); bindAmt('#ia', 'amount'); bindAmt('#iv', 'value');
      const iu = el.querySelector('#iu');
      if (iu) iu.oninput = () => { iu.value = iu.value.replace(/[^\d.,]/g, ''); F.units = iu.value; };
      const tna = el.querySelector('#it');
      if (tna) tna.oninput = () => { tna.value = tna.value.replace(/[^\d,.]/g, ''); F.tna = tna.value; el.querySelector('#pfprev').innerHTML = pfPreview(); };
      const dd = el.querySelector('#id');
      if (dd) {
        dd.onchange = () => { F.startDate = dd.value || today(); el.querySelector('#idl').textContent = shortDate(F.startDate); el.querySelector('#pfprev').innerHTML = pfPreview(); };
        dd.onclick = () => { try { dd.showPicker?.(); } catch { /* selector nativo */ } };
      }

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.kind) { F.kind = d.kind; if (!MARKETABLE.includes(F.kind)) { F.ticker = F.market = null; } return ctl.refresh(); }
        if ('pickt' in d) {
          const markets = { acciones: ['stock'], cedears: ['cedear'], bonos: ['bond', 'on'], cripto: ['crypto'] }[F.kind];
          return openPickAsset({ title: 'Elegí el ticker', markets, onPick: a => { F.market = a.market; F.ticker = a.ticker; if (!F.name.trim()) F.name = a.ticker; ctl.refresh(); } });
        }
        if ('unlink' in d) { F.ticker = F.market = null; return ctl.refresh(); }
        if (d.days) { F.days = Number(d.days); mark(el.querySelector('#ipd'), b); el.querySelector('#pfprev').innerHTML = pfPreview(); return; }
        if ('from' in d) { F.fromAccount = !F.fromAccount; return ctl.refresh(); }
        if (d.acc) { F.accountId = d.acc; return mark(el.querySelector('#g-acc'), b); }
        if ('save' in d) return save(ctl);
      };
    },
  });

  async function save(ctl) {
    const name = F.name.trim() || INVEST_KINDS[F.kind].label;
    const iid = ex?.id || uid();
    let rec, amountOut = 0;
    if (F.kind === 'plazo_fijo') {
      const capital = parseAmount(F.capital), tna = parseFloat(F.tna.replace(',', '.'));
      if (!capital || !(tna > 0)) { toast('Completá capital y tasa', { icon: 'info' }); return; }
      rec = { id: iid, kind: F.kind, name, capital, tna, days: F.days, startDate: F.startDate };
      if (!ex) { rec.initialInvested = F.fromAccount ? 0 : capital; amountOut = capital; }
    } else if (ex) {
      rec = { id: iid, kind: F.kind, name };
      if (F.ticker) {
        const units = parseUnits(F.units);
        if (!units) { toast('Poné la cantidad que tenés', { icon: 'info' }); return; }
        Object.assign(rec, { ticker: F.ticker, market: F.market, units });
      } else Object.assign(rec, { ticker: null, market: null, units: null });
    } else {
      const amount = parseAmount(F.amount);
      if (!amount) { toast('Poné cuánta plata pusiste', { icon: 'info' }); return; }
      let value = parseAmount(F.value) || amount;
      let link = {};
      if (F.ticker) {
        const units = parseUnits(F.units);
        if (!units) { toast('Poné la cantidad que compraste', { icon: 'info' }); return; }
        link = { ticker: F.ticker, market: F.market, units };
        value = Math.round(positionValue(link, quoteOf(F.market, F.ticker), marketCache().dollars) ?? amount);
      }
      rec = {
        id: iid, kind: F.kind, name, startDate: today(), ...link,
        initialInvested: F.fromAccount ? 0 : amount,
        valuations: [{ date: today(), at: now(), value }],
      };
      amountOut = amount;
    }
    if (!ex && F.fromAccount && !F.accountId) { toast('Elegí de qué cuenta sale', { icon: 'info' }); return; }
    if (!ex && F.fromAccount) {
      // Primero el aporte y después el valor inicial, para que el valor ya lo incluya (y no se cuente dos veces).
      await upsert('transactions', {
        type: 'out', amount: amountOut, date: rec.startDate || today(), note: '', accountId: F.accountId,
        link: { kind: 'investment', id: iid, role: 'contribution' },
      });
      if (rec.valuations) rec.valuations = [{ ...rec.valuations[0], at: now() }];
    }
    await upsert('investments', rec);
    toast(ex ? 'Inversión actualizada' : 'Inversión creada');
    ctl.close();
    if (!ex) openInvestment(iid);
  }
}
