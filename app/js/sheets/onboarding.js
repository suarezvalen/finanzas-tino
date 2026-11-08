// Bienvenida: nombre, cuentas con su saldo actual y presupuesto.
import { setup } from '../store.js';
import { icon } from '../icons.js';
import { esc, amountInput, parseAmount } from '../ui.js';
import { ACCOUNT_TYPES, DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../constants.js';
import { openSync } from './sync.js';

export function startOnboarding(done) {
  const el = document.createElement('div');
  el.className = 'onboard';
  document.getElementById('app').append(el);
  const F = { step: 0, name: '', budget: '', accs: DEFAULT_ACCOUNTS.map(a => ({ ...a, bal: '' })) };

  const dots = () => `<div class="dots">${[0, 1, 2].map(i => `<i class="${i === F.step ? 'on' : ''}"></i>`).join('')}</div>`;

  function render() {
    if (F.step === 0) {
      el.innerHTML = `<div class="ob-body">
        <img class="ob-logo" src="icons/icon-192.png" alt="">
        <h1>Tus finanzas,<br><span class="acc-c">bajo control.</span></h1>
        <p>Anotá gastos en segundos, mirá a dónde va tu plata y seguí tus cuentas. Todo queda guardado en tu celular.</p>
        <div class="field"><label for="obn">¿Cómo te llamás?</label><input class="input" id="obn" maxlength="30" autocomplete="given-name" placeholder="Tu nombre" value="${esc(F.name)}"></div>
      </div>
      <div class="ob-foot"><button class="btn primary" data-next>Empezar ${icon('chevron-right')}</button></div>
      <button class="link ob-login" data-login>${icon('cloud')}Ya uso Finanzas en otro dispositivo</button>${dots()}`;
      el.querySelector('#obn').oninput = e => { F.name = e.target.value; };
    } else if (F.step === 1) {
      el.innerHTML = `<div class="ob-body">
        <h2>¿Dónde tenés tu plata?</h2>
        <p>Marcá las cuentas que usás y poné cuánto tenés hoy en cada una. Después podés cambiarles el nombre o sumar más.</p>
        ${F.accs.map((a, i) => `<div class="ob-acc ${a.on ? 'on' : ''}">
          <button class="ob-toggle" data-toggle="${i}" aria-label="${a.on ? 'Quitar' : 'Agregar'} ${esc(a.name)}">${icon(a.on ? 'check' : 'plus')}</button>
          <span class="cat-ic">${icon(ACCOUNT_TYPES[a.type].icon)}</span>
          <span class="info"><b>${esc(a.name)}</b><small>${a.type === 'credit' ? 'Deuda actual' : 'Saldo actual'}</small></span>
          <input class="input" inputmode="numeric" autocomplete="off" placeholder="$ 0" data-bal="${i}" value="${a.bal}" ${a.on ? '' : 'disabled'}>
        </div>`).join('')}
      </div>
      <div class="ob-foot"><button class="btn ghost" data-back>Atrás</button><button class="btn primary" data-next>Continuar ${icon('chevron-right')}</button></div>${dots()}`;
      el.querySelectorAll('[data-bal]').forEach(inp => amountInput(inp, v => { F.accs[inp.dataset.bal].bal = v; }));
    } else {
      el.innerHTML = `<div class="ob-body">
        <h2>¿Cuánto querés gastar por mes?</h2>
        <p>Con un presupuesto, la app te avisa cuánto te queda y cuánto podés gastar por día. Es opcional.</p>
        <div class="field"><label for="obb">Presupuesto mensual</label><input class="input" id="obb" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${F.budget}"></div>
      </div>
      <div class="ob-foot"><button class="btn ghost" data-back>Atrás</button><button class="btn primary" data-finish>${F.budget ? 'Listo' : 'Saltear y empezar'}</button></div>${dots()}`;
      amountInput(el.querySelector('#obb'), v => {
        F.budget = v;
        el.querySelector('[data-finish]').textContent = v ? 'Listo' : 'Saltear y empezar';
      });
    }
  }

  el.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.toggle !== undefined) {
      const a = F.accs[d.toggle];
      a.on = !a.on;
      const row = b.closest('.ob-acc');
      row.classList.toggle('on', a.on);
      b.innerHTML = icon(a.on ? 'check' : 'plus');
      const inp = row.querySelector('input');
      inp.disabled = !a.on;
      if (a.on) inp.focus();
      return;
    }
    if ('back' in d) { F.step--; render(); return; }
    if ('login' in d) {
      openSync({ onboarding: true, onDone: () => { el.classList.add('out'); setTimeout(() => el.remove(), 450); done(); } });
      return;
    }
    if ('next' in d) {
      if (F.step === 1 && !F.accs.some(a => a.on)) { alert('Elegí al menos una cuenta.'); return; }
      F.step++; render(); return;
    }
    if ('finish' in d) {
      b.disabled = true;
      await finish();
    }
  };

  async function finish() {
    const accounts = F.accs.filter(a => a.on).map((a, i) => {
      const n = parseAmount(a.bal);
      return { name: a.name, type: a.type, initialBalance: a.type === 'credit' ? -n : n, order: i };
    });
    const categories = [];
    for (const kind of ['expense', 'income']) {
      DEFAULT_CATEGORIES[kind].forEach(([name, ic, color], i) => categories.push({ kind, name, icon: ic, color, order: i }));
    }
    await setup({ accounts, categories, settings: { name: F.name.trim(), budget: parseAmount(F.budget) } });
    navigator.storage?.persist?.().catch(() => {});
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
    done();
  }

  render();
}
