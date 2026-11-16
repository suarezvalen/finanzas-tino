// Informes del mercado (apertura 10:00, cierre 18:15 y revisión semanal del domingo).
// Los arma una rutina de Claude en la nube y llegan por la sincronización (tipo de dato 'informes').
import { state, informes, upsert, saveSettings } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, esc, money } from '../ui.js';
import { sheetHead, catIc, empty } from '../components.js';
import { dayLabel } from '../dates.js';

export const HORIZONS = [['corto', 'Corto plazo', 'días a semanas'], ['mediano', 'Mediano plazo', 'meses'], ['largo', 'Largo plazo', 'años']];
const KIND = {
  am: { label: 'Apertura', icon: 'sun', color: '#FFB547' },
  pm: { label: 'Cierre', icon: 'moon', color: '#8B93FF' },
  weekly: { label: 'Semanal', icon: 'calendar-range', color: '#2EF2A0' },
};
const VIEW = {
  alcista: { label: 'Alcista', cls: 'pos', icon: 'trending-up' },
  neutral: { label: 'Neutral', cls: '', icon: 'minus' },
  bajista: { label: 'Bajista', cls: 'neg', icon: 'trending-down' },
};
const IMPACT = { alta: 'Impacto alto', media: 'Impacto medio', baja: 'Impacto bajo' };
const pct = v => (v == null || !Number.isFinite(+v) ? '' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')}%</span>`);
const horizon = () => state.settings.reportHorizon || 'mediano';
const kindOf = r => KIND[r.kind] || KIND.pm;
/** Texto con párrafos (el informe trae saltos de línea). */
const para = s => (s ? String(s).split(/\n{2,}|\n/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('') : '');
const link = (href, text) => (href && /^https?:\/\//.test(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text);

export const informeItem = r => `<button class="item tap" data-informe="${r.id}">${catIc({ icon: kindOf(r).icon, color: r.seen ? '#4A5866' : kindOf(r).color })}
  <span class="info"><b>${esc(r.title || `Informe de ${kindOf(r).label.toLowerCase()}`)}</b><small>${dayLabel(r.date)} · ${esc(r.headline || '')}</small></span>${r.seen ? '' : '<span class="dot-new"></span>'}${icon('chevron-right', 'chev')}</button>`;

/** Lista de todos los informes. */
export function openInformes() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const list = informes().slice(0, 60);
      el.innerHTML = `${sheetHead('Informes')}
        ${list.length ? `<div class="list">${list.map(informeItem).join('')}</div>`
          : empty('file-text', 'Todavía no hay informes', 'Llegan solos de lunes a viernes a las 10:00 y a las 18:15, y el domingo la revisión de la semana.')}`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.informe) openInforme(b.dataset.informe);
      };
    },
  });
}

/** Un informe, con el selector de plazo (corto / mediano / largo). */
export function openInforme(id) {
  const r = informes().find(x => x.id === id);
  if (!r) return openInformes();
  if (!r.seen) setTimeout(() => upsert('informes', { id: r.id, seen: true }), 1200);
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const h = horizon();
      const k = kindOf(r);
      const outlook = r.outlook?.[h];
      const assets = r.assets || [];
      el.innerHTML = `${sheetHead(r.title || `Informe de ${k.label.toLowerCase()}`)}
        <div class="rep-meta">${catIc(k)}<span><b>${k.label} · ${dayLabel(r.date)}</b><small>${r.createdAt ? new Date(r.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}${r.model ? ` · ${esc(r.model)}` : ''}</small></span></div>

        <div class="seg rep-h">${HORIZONS.map(([v, l]) => `<button data-h="${v}" class="${h === v ? 'on' : ''}">${l.replace(' plazo', '')}</button>`).join('')}</div>
        <p class="help" style="margin:6px 4px 12px">Mirada a ${HORIZONS.find(x => x[0] === h)[1].toLowerCase()} (${HORIZONS.find(x => x[0] === h)[2]}).</p>

        <section class="card rep-sum">
          ${r.headline ? `<h2>${esc(r.headline)}</h2>` : ''}
          ${para(r.summary)}
          ${r.portfolio ? `<div class="row rep-pf">
            ${r.portfolio.changePct != null ? `<div class="pill"><small>Tu cartera ${r.kind === 'weekly' ? 'en la semana' : 'hoy'}</small><b>${pct(r.portfolio.changePct)}</b></div>` : ''}
            ${r.portfolio.changeArs != null ? `<div class="pill"><small>En pesos</small><b class="${r.portfolio.changeArs >= 0 ? 'pos' : 'neg'}">${r.portfolio.changeArs >= 0 ? '+' : '−'}${money(Math.abs(r.portfolio.changeArs))}</b></div>` : ''}
          </div>${para(r.portfolio.text)}` : ''}
        </section>

        ${outlook ? `<section class="card rep-outlook"><div class="label">${icon(VIEW[outlook.view]?.icon || 'compass')} Qué hacer con tu cartera · ${HORIZONS.find(x => x[0] === h)[1].toLowerCase()}</div>
          ${outlook.view ? `<b class="rep-view ${VIEW[outlook.view]?.cls || ''}">${VIEW[outlook.view]?.label || esc(outlook.view)}</b>` : ''}${para(outlook.text)}
          ${outlook.actions?.length ? `<ul class="rep-actions">${outlook.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</section>` : ''}

        ${r.macro?.length ? `<div class="section-h"><h3>Contexto</h3></div>
          <div class="rep-macro">${r.macro.map(m => `<div class="fx"><small>${esc(m.label)}</small><b>${esc(m.value ?? '—')}</b>${m.change != null ? `<small>${typeof m.change === 'number' ? pct(m.change) : esc(m.change)}</small>` : ''}</div>`).join('')}</div>
          ${r.macroText ? `<div class="rep-text">${para(r.macroText)}</div>` : ''}` : ''}

        ${r.news?.length ? `<div class="section-h"><h3>Noticias que importan</h3></div>
          <div class="rep-news">${r.news.map(n => `<div class="rep-n ${n.impact || ''}">
            <b>${link(n.link, esc(n.title))}</b>
            <small>${[n.ticker && `<span class="tk">${esc(n.ticker)}</span>`, n.impact && IMPACT[n.impact], n.source && esc(n.source)].filter(Boolean).join(' · ')}</small>
            ${n.why ? `<p>${esc(n.why)}</p>` : ''}</div>`).join('')}</div>` : ''}

        ${assets.length ? `<div class="section-h"><h3>Tus activos</h3></div>
          ${assets.map(a => { const o = a.horizons?.[h]; return `<section class="card rep-asset">
            <div class="rep-a-h"><b>${esc(a.ticker)}</b><span>${esc(a.name || '')}</span>${pct(a.pct)}</div>
            ${a.why ? `<div class="rep-why"><small>${r.kind === 'am' ? 'Qué está pasando' : r.kind === 'weekly' ? 'Por qué se movió en la semana' : 'Por qué se movió hoy'}</small>${para(a.why)}</div>` : ''}
            ${a.news?.length ? `<ul class="rep-links">${a.news.map(n => `<li>${link(n.link, esc(n.title))}${n.source ? ` <small>— ${esc(n.source)}</small>` : ''}</li>`).join('')}</ul>` : ''}
            ${a.technical ? `<p class="rep-tech">${icon('chart-line')} ${esc(a.technical)}</p>` : ''}
            ${a.premium ? `<p class="rep-tech">${icon('globe')} ${esc(a.premium)}</p>` : ''}
            ${o ? `<div class="rep-o"><div><small>${HORIZONS.find(x => x[0] === h)[1]}</small>${o.view ? ` <b class="${VIEW[o.view]?.cls || ''}">${VIEW[o.view]?.label || esc(o.view)}</b>` : ''}</div>
              ${para(o.text)}${o.action ? `<p class="rep-act">${icon('target')} <b>Qué podrías hacer:</b> ${esc(o.action)}</p>` : ''}</div>` : ''}
          </section>`; }).join('')}` : ''}

        ${r.calendar?.length ? `<div class="section-h"><h3>Próximas fechas</h3></div>
          <div class="list">${r.calendar.map(c => `<div class="item">${catIc({ icon: 'calendar', color: '#5CC8FF' })}<span class="info"><b>${esc(c.ticker ? `${c.ticker}: ${c.event}` : c.event)}</b><small>${esc(c.date || '')}${c.note ? ` · ${esc(c.note)}` : ''}</small></span></div>`).join('')}</div>` : ''}

        ${r.ideas?.length ? `<div class="section-h"><h3>Para mirar</h3></div>
          <div class="rep-text"><ul class="rep-actions">${r.ideas.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}

        ${r.risks?.length ? `<div class="section-h"><h3>Riesgos a vigilar</h3></div>
          <div class="rep-text"><ul class="rep-actions">${r.risks.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}

        ${r.sources?.length ? `<p class="help rep-src">Fuentes: ${r.sources.map(s => link(s.link, esc(s.label || s.link))).join(' · ')}</p>` : ''}
        <p class="foot">${esc(r.disclaimer || 'Informe orientativo armado con inteligencia artificial a partir de datos públicos. No es una recomendación personalizada de inversión ni asesoramiento financiero profesional: verificá antes de operar.')}</p>
        <button class="btn ghost" data-all style="margin-top:6px">${icon('file-text')}Ver todos los informes</button>`;

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.h) { await saveSettings({ reportHorizon: b.dataset.h }); return; }
        if ('all' in b.dataset) openInformes();
      };
    },
  });
}
