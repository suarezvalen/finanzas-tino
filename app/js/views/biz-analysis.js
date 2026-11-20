// Negocio → Análisis: qué pasó ayer y por qué, lo que se va aprendiendo día a día e ideas para probar.
// El análisis lo escribe el reporte diario (Claude, 9:05) en 'biz_insights'; lo que marcás acá va a 'biz_notes'
// y el análisis del día siguiente lo lee (tools/negocio/leer.mjs) para medir si las ideas funcionaron.
import { bizInsights, bizNotes, upsert } from '../store.js';
import { icon } from '../icons.js';
import { esc, toast, openSheet } from '../ui.js';
import { catIc, empty, sheetHead } from '../components.js';
import { today, addDays } from '../dates.js';
import { shortDay } from '../logic/biz.js';
import { markdown } from '../sheets/biz.js';

export const AREAS = {
  landing: { label: 'Landing', icon: 'smartphone', color: '#5CC8FF' },
  anuncios: { label: 'Anuncios', icon: 'target', color: '#FF2E6E' },
  email: { label: 'Email', icon: 'bell', color: '#C084FC' },
  oferta: { label: 'Oferta y precio', icon: 'ticket', color: '#FFC24D' },
  marketing: { label: 'Marketing', icon: 'sparkles', color: '#2EF2A0' },
  contenido: { label: 'Contenido', icon: 'palette', color: '#FF8FB8' },
  otro: { label: 'Otro', icon: 'shapes', color: '#8A9AA8' },
};
export const STATES = {
  nueva: { label: 'Nueva', color: '#5CC8FF' },
  en_prueba: { label: 'Probando', color: '#FFC24D' },
  funciono: { label: 'Funcionó', color: '#2EF2A0' },
  no_funciono: { label: 'No funcionó', color: '#FF9A3C' },
  descartada: { label: 'Descartada', color: '#8A9AA8' },
};
const CERT = {
  firme: { label: 'Comprobado', color: '#2EF2A0' },
  probable: { label: 'Probable', color: '#5CC8FF' },
  hipotesis: { label: 'Hipótesis', color: '#FFC24D' },
};
const TREND = { nuevo: 'Nuevo', se_confirma: '▲ se confirma', se_debilita: '▼ se debilita', igual: '' };
const LEVEL = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' };
const AS = { area: 'todas' };

/** Último estado de cada idea: lo que marcaste en la app, salvo que el análisis la haya actualizado después. */
export function ideaState(idea, insight) {
  const note = bizNotes().find(n => n.type === 'idea' && n.ideaId === idea.id);
  if (note && (note.updatedAt || '') > (insight?.updatedAt || '')) return { status: note.status, note, mine: true };
  return { status: idea.status, note, mine: false };
}

const chip = (meta, extra = '') => `<span class="vchip" style="--c:${meta.color}">${extra}${meta.label}</span>`;
const paras = text => String(text || '').split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');

export function renderBizAnalysis(el) {
  const all = bizInsights();
  const ins = all[0];
  const header = `<header class="top">
    <span class="biz-badge">${icon('sparkles')}</span>
    <div class="hi"><small>Todos los días después de las 9:05</small><strong class="biz-title">Análisis</strong></div>
    ${all.length > 1 ? `<button class="icon-btn" data-act="history" aria-label="Análisis anteriores">${icon('calendar-range')}</button>` : ''}
    <button class="icon-btn" data-act="personal" aria-label="Volver a mis finanzas">${icon('house')}</button></header>`;

  if (!ins) {
    el.innerHTML = `${header}${empty('sparkles', 'Todavía no hay análisis', 'Cada mañana, después del reporte, Claude analiza tus números, explica qué pasó y por qué se vendió, y va acumulando conclusiones e ideas para la landing, los anuncios y el marketing.')}
      <button class="btn" data-act="note" style="margin-top:12px">${icon('pencil')}Anotar un cambio</button>`;
    return bind(el, null);
  }

  const ideas = ins.ideas.map(i => ({ ...i, st: ideaState(i, ins) }));
  const testing = ideas.filter(i => i.st.status === 'en_prueba');
  const open = ideas.filter(i => i.st.status === 'nueva' && (AS.area === 'todas' || i.area === AS.area))
    .sort((a, b) => rank(b) - rank(a));
  const closed = ideas.filter(i => ['funciono', 'no_funciono', 'descartada'].includes(i.st.status));
  const areas = [...new Set(ideas.filter(i => i.st.status === 'nueva').map(i => i.area))];
  const learnings = [...ins.learnings].sort((a, b) => ['firme', 'probable', 'hipotesis'].indexOf(a.certainty) - ['firme', 'probable', 'hipotesis'].indexOf(b.certainty));
  const notes = bizNotes().filter(n => n.type === 'cambio').slice(0, 5);
  const yday = addDays(today(), -1);

  el.innerHTML = `${header}
    <p class="biz-data ${ins.date < yday ? 'late' : ''}">${icon(ins.date < yday ? 'clock' : 'circle-check')}${ins.kind === 'semanal' ? 'Revisión semanal' : 'Análisis'} del ${shortDay(ins.date)}</p>

    <button class="card hero insight-hero" data-insight="${ins.id}">
      <div class="label">Qué pasó y por qué</div>
      <b class="ins-title">${esc(ins.headline)}</b>
      <div class="ins-sum clamp">${paras(ins.summary)}</div>
      <span class="link-row">Leer el análisis completo ${icon('chevron-right')}</span>
    </button>

    ${ins.numbers.length ? `<div class="fx-strip ins-nums">${ins.numbers.map(n => `<div class="fx"><small>${esc(n.label)}</small><b>${esc(n.value)}</b>${n.change ? `<span class="${n.tone === 'bueno' ? 'pos' : n.tone === 'malo' ? 'neg' : 'muted-s'}">${esc(n.change)}</span>` : ''}</div>`).join('')}</div>` : ''}

    ${ins.noSales ? `<section class="card warn-card"><div class="label">Por qué no se vendió</div>${paras(ins.noSales)}</section>` : ''}
    ${ins.why.length ? `<div class="section-h"><h3>Por qué se vendió</h3></div>
      <div class="list">${ins.why.map(w => `<div class="item why-item"><span class="wdot ${w.weight}"></span><span class="info"><b class="wrap-b">${esc(w.factor)}</b><small class="wrap">${esc(w.detail)}</small></span></div>`).join('')}</div>` : ''}

    ${testing.length ? `<div class="section-h"><h3>Lo que estás probando</h3></div>
      <div class="list">${testing.map(i => ideaItem(i, ins)).join('')}</div>` : ''}

    <div class="section-h"><h3>Ideas para probar</h3><small class="muted-s">${open.length}</small></div>
    ${areas.length > 1 ? `<div class="chips" id="a-areas" style="margin-bottom:10px"><button class="chip ${AS.area === 'todas' ? 'on' : ''}" data-area="todas">Todas</button>${areas.map(a => `<button class="chip ${AS.area === a ? 'on' : ''}" data-area="${a}">${icon(AREAS[a].icon)}${AREAS[a].label}</button>`).join('')}</div>` : ''}
    ${open.length ? `<div class="idea-list">${open.map(i => ideaCard(i)).join('')}</div>` : '<p class="help" style="margin:0 4px">No hay ideas nuevas en esta área.</p>'}

    <div class="section-h"><h3>Lo que vamos aprendiendo</h3><small class="muted-s">${learnings.length}</small></div>
    <div class="list">${learnings.map(l => `<button class="item tap learn-item" data-learn="${esc(l.id)}">
      <span class="info"><b class="wrap-b">${esc(l.text)}</b>
        <small class="vchips">${chip(CERT[l.certainty])}${TREND[l.trend] ? `<span class="trend ${l.trend}">${TREND[l.trend]}</span>` : ''}${l.since ? `<span class="muted-s">desde el ${shortDay(l.since)}</span>` : ''}</small></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>
    <p class="hint">Comprobado: se repitió muchas veces. Probable: hay señales claras. Hipótesis: hay que probarlo.</p>

    ${ins.next.length ? `<div class="section-h"><h3>Próximos pasos</h3></div><section class="card"><ol class="steps">${ins.next.map(n => `<li>${esc(n)}</li>`).join('')}</ol></section>` : ''}

    <div class="section-h"><h3>Cambios que hiciste</h3><button data-act="note">Anotar</button></div>
    ${notes.length ? `<div class="list">${notes.map(n => `<button class="item tap" data-note="${n.id}">${catIc(AREAS[n.area] || AREAS.otro)}<span class="info"><b class="wrap-b">${esc(n.text)}</b><small>${shortDay(n.date)} · ${(AREAS[n.area] || AREAS.otro).label}</small></span></button>`).join('')}</div>`
      : `<p class="help" style="margin:0 4px">Anotá cuando cambies algo (la landing, el precio, un anuncio, un cupón): el análisis compara antes y después.</p>`}

    ${closed.length ? `<div class="section-h"><h3>Ideas cerradas</h3><small class="muted-s">${closed.length}</small></div>
      <div class="list">${closed.map(i => ideaItem(i, ins)).join('')}</div>` : ''}
    <p class="foot">Lo escribe Claude con tus datos de Shopify, Meta y Klaviyo. Son sugerencias: la app nunca cambia nada sola.</p>`;
  bind(el, ins);
}

const rank = i => ({ alto: 3, medio: 2, bajo: 1 }[i.impact] || 0) * 2 - ({ bajo: 0, medio: 1, alto: 2 }[i.effort] || 0);

function ideaCard(i) {
  const A = AREAS[i.area] || AREAS.otro;
  return `<button class="card idea-card" data-idea="${esc(i.id)}" style="--c:${A.color}">
    <div class="idea-top">${chip(A, icon(A.icon))}<span class="muted-s">Impacto ${LEVEL[i.impact].toLowerCase()} · esfuerzo ${LEVEL[i.effort].toLowerCase()}</span></div>
    <b class="idea-title">${esc(i.title)}</b>
    <p class="idea-why">${esc(i.why)}</p></button>`;
}

function ideaItem(i, ins) {
  const S = STATES[i.st.status];
  const A = AREAS[i.area] || AREAS.otro;
  const follow = ins.followUp.find(f => f.idea === i.id);
  return `<button class="item tap" data-idea="${esc(i.id)}">${catIc(A)}
    <span class="info"><b class="wrap-b">${esc(i.title)}</b><small class="wrap">${follow ? esc(follow.text) : i.result ? esc(i.result) : i.st.note?.date ? `Desde el ${shortDay(i.st.note.date)}` : ''}</small></span>
    ${chip(S)}</button>`;
}

function bind(el, ins) {
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.area) { AS.area = d.area; return renderBizAnalysis(el); }
    if (d.insight) return openInsight(d.insight);
    if (d.idea) return openIdea(d.idea);
    if (d.learn) return openLearning(d.learn);
    if (d.note) return openNote(d.note);
    if (d.act === 'note') return openNote();
    if (d.act === 'history') return openHistory();
    if (d.act === 'personal') return import('../router.js').then(r => r.switchMode('personal'));
  };
}

/* ---------- Paneles ---------- */
export function openInsight(id) {
  const ins = bizInsights().find(x => x.id === id);
  if (!ins) return;
  openSheet({
    full: true,
    render(el, ctl) {
      el.innerHTML = `${sheetHead(`${ins.kind === 'semanal' ? 'Revisión semanal' : 'Análisis'} del ${shortDay(ins.date)}`)}
        <article class="md">
          <h3>${esc(ins.headline)}</h3>${paras(ins.summary)}
          ${ins.noSales ? `<h3>Por qué no se vendió</h3>${paras(ins.noSales)}` : ''}
          ${ins.why.length ? `<h3>Por qué se vendió</h3><ul>${ins.why.map(w => `<li><b>${esc(w.factor)}.</b> ${esc(w.detail)}</li>`).join('')}</ul>` : ''}
          ${ins.followUp.length ? `<h3>Seguimiento de lo que estás probando</h3><ul>${ins.followUp.map(f => `<li><b>${esc(ins.ideas.find(i => i.id === f.idea)?.title || f.idea)}.</b> ${esc(f.text)}</li>`).join('')}</ul>` : ''}
          ${ins.next.length ? `<h3>Próximos pasos</h3><ol>${ins.next.map(n => `<li>${esc(n)}</li>`).join('')}</ol>` : ''}
        </article>`;
      el.onclick = ev => { if (ev.target.closest('[data-close]')) ctl.close(); };
    },
  });
}

export function openIdea(id) {
  openSheet({
    full: true, live: true,
    render(el, ctl) {
      const ins = bizInsights()[0];
      const i = ins?.ideas.find(x => x.id === id);
      if (!i) { ctl.close(); return; }
      const st = ideaState(i, ins);
      const A = AREAS[i.area] || AREAS.otro;
      const base = i.basedOn.map(b => ins.learnings.find(l => l.id === b)).filter(Boolean);
      const follow = ins.followUp.find(f => f.idea === i.id);
      el.innerHTML = `${sheetHead('Idea')}
        <div class="idea-top" style="margin:-6px 0 10px">${chip(A, icon(A.icon))}${chip(STATES[st.status])}</div>
        <h2 class="idea-h">${esc(i.title)}</h2>
        <div class="row" style="margin:12px 0"><div class="pill"><small>Impacto</small><b>${LEVEL[i.impact]}</b></div><div class="pill"><small>Esfuerzo</small><b>${LEVEL[i.effort]}</b></div></div>
        <article class="md">
          <h4>Por qué</h4>${paras(i.why)}
          ${i.how ? `<h4>Cómo hacerlo</h4>${markdown(i.how)}` : ''}
          ${base.length ? `<h4>Se basa en</h4><ul>${base.map(l => `<li>${esc(l.text)} <i>(${CERT[l.certainty].label.toLowerCase()})</i></li>`).join('')}</ul>` : ''}
          ${follow ? `<h4>Cómo viene</h4>${paras(follow.text)}` : ''}
          ${i.result ? `<h4>Resultado</h4>${paras(i.result)}` : ''}
        </article>
        <div class="field" style="margin-top:16px"><label for="ic">Comentario (opcional)</label><input class="input" id="ic" maxlength="200" autocomplete="off" placeholder="Ej: cambié el título de la landing" value="${esc(st.note?.text || '')}"></div>
        <div class="state-grid">
          <button class="btn ${st.status === 'en_prueba' ? 'primary' : ''}" data-st="en_prueba">${icon('play')}La apliqué</button>
          <button class="btn ${st.status === 'funciono' ? 'primary' : ''}" data-st="funciono">${icon('check')}Funcionó</button>
          <button class="btn ${st.status === 'no_funciono' ? 'primary' : ''}" data-st="no_funciono">${icon('x')}No funcionó</button>
          <button class="btn ${st.status === 'descartada' ? 'primary' : ''}" data-st="descartada">${icon('archive')}Descartar</button>
        </div>
        ${st.mine ? `<button class="btn ghost" data-st="nueva" style="margin-top:6px">${icon('rotate-ccw')}Volver a "nueva"</button>` : ''}
        <p class="help">Al marcar "La apliqué", el análisis de mañana empieza a medir el antes y el después.</p>`;
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        const s = b.dataset.st;
        if (!s) return;
        const text = el.querySelector('#ic').value.trim();
        const date = s === 'en_prueba' && st.status === 'en_prueba' && st.note?.date ? st.note.date : today();
        await upsert('biz_notes', { id: `idea-${i.id}`, type: 'idea', ideaId: i.id, status: s, date, text, area: i.area });
        if (s === 'en_prueba') await upsert('biz_notes', { id: `cambio-${i.id}`, type: 'cambio', ideaId: i.id, date, area: i.area, text: text || `Apliqué: ${i.title}` });
        toast(s === 'en_prueba' ? 'Anotado: mañana empiezo a medirla' : `Marcada como "${STATES[s].label.toLowerCase()}"`);
        ctl.close();
      };
    },
  });
}

function openLearning(id) {
  const ins = bizInsights()[0];
  const l = ins?.learnings.find(x => x.id === id);
  if (!l) return;
  const ideas = ins.ideas.filter(i => i.basedOn.includes(l.id));
  openSheet({
    render(el, ctl) {
      el.innerHTML = `${sheetHead('Aprendizaje')}
        <div class="idea-top" style="margin:-6px 0 10px">${chip(CERT[l.certainty])}${TREND[l.trend] ? `<span class="trend ${l.trend}">${TREND[l.trend]}</span>` : ''}</div>
        <h2 class="idea-h">${esc(l.text)}</h2>
        <article class="md">${l.evidence ? `<h4>La evidencia</h4>${paras(l.evidence)}` : ''}
          <p class="muted-s">${l.since ? `Lo vemos desde el ${shortDay(l.since)}` : ''}${l.updated ? ` · actualizado el ${shortDay(l.updated)}` : ''}</p></article>
        ${ideas.length ? `<div class="section-h"><h3>Ideas que salen de acá</h3></div><div class="list">${ideas.map(i => `<button class="item tap" data-idea="${esc(i.id)}">${catIc(AREAS[i.area] || AREAS.otro)}<span class="info"><b class="wrap-b">${esc(i.title)}</b></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>` : ''}`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.idea) { ctl.close(); openIdea(b.dataset.idea); }
      };
    },
  });
}

function openNote(id) {
  const ex = id ? bizNotes().find(n => n.id === id) : null;
  const F = { text: ex?.text || '', area: ex?.area || 'landing', date: ex?.date || today() };
  openSheet({
    full: true,
    render(el, ctl) {
      el.innerHTML = `${sheetHead(ex ? 'Editar cambio' : 'Anotar un cambio')}
        <p class="help" style="margin:-6px 2px 14px">Anotá lo que cambiaste en el negocio. El análisis compara cómo venía antes y cómo viene después.</p>
        <div class="field"><label for="nt">¿Qué cambiaste?</label><input class="input" id="nt" maxlength="200" autocomplete="off" placeholder="Ej: nuevo título en la landing, precio $19.990, apagué el anuncio C" value="${esc(F.text)}"></div>
        <div class="field"><label>¿Dónde?</label><div class="chips wrap" id="na">${Object.entries(AREAS).map(([k, a]) => `<button class="chip ${F.area === k ? 'on' : ''}" data-ar="${k}">${icon(a.icon)}${a.label}</button>`).join('')}</div></div>
        <div class="field"><label>¿Cuándo?</label><label class="date-pill" style="height:48px;width:100%;justify-content:center">${icon('calendar')}<span>${shortDay(F.date)}</span><input type="date" id="nd" value="${F.date}" max="${today()}"></label></div>
        <button class="btn primary" data-save>${ex ? 'Guardar' : 'Anotar'}</button>
        ${ex ? `<button class="btn danger" data-del style="margin-top:10px">${icon('trash-2')}Borrar</button>` : ''}`;
      el.querySelector('#nt').oninput = ev => { F.text = ev.target.value; };
      const nd = el.querySelector('#nd');
      nd.onchange = () => { if (nd.value) { F.date = nd.value; ctl.refresh(); } };
      nd.onclick = () => { try { nd.showPicker?.(); } catch { /* selector nativo */ } };
      el.onclick = async ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.ar) { F.area = d.ar; el.querySelectorAll('#na .on').forEach(x => x.classList.remove('on')); b.classList.add('on'); return; }
        if ('del' in d) { await upsert('biz_notes', { id: ex.id, deleted: true }); toast('Borrado', { icon: 'trash-2' }); return ctl.close(); }
        if ('save' in d) {
          if (!F.text.trim()) { toast('Contá qué cambiaste', { icon: 'info' }); return; }
          await upsert('biz_notes', { id: ex?.id, type: 'cambio', date: F.date, area: F.area, text: F.text.trim(), ideaId: ex?.ideaId });
          toast('Anotado');
          ctl.close();
        }
      };
    },
  });
}

function openHistory() {
  openSheet({
    full: true,
    render(el, ctl) {
      el.innerHTML = `${sheetHead('Análisis anteriores')}
        <div class="list">${bizInsights().map(x => `<button class="item tap" data-insight="${x.id}">${catIc({ icon: x.kind === 'semanal' ? 'calendar-range' : 'sparkles', color: '#FF2E6E' })}
          <span class="info"><b class="wrap-b">${esc(x.headline)}</b><small>${x.kind === 'semanal' ? 'Revisión semanal · ' : ''}${shortDay(x.date)}</small></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) return ctl.close();
        if (b.dataset.insight) openInsight(b.dataset.insight);
      };
    },
  });
}
