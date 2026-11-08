// Ajustes de seguridad: PIN, Face ID y cuándo bloquear.
import { icon } from '../icons.js';
import { openSheet, toast } from '../ui.js';
import { sheetHead } from '../components.js';
import {
  lockEnabled, lockSettings, openPinSetup, disableLock, setLockTimeout, TIMEOUTS,
  biometricAvailable, enableBiometric, disableBiometric,
} from './lock.js';

export const securityLabel = () => (lockEnabled() ? (lockSettings().credId ? 'PIN y Face ID' : 'PIN activado') : 'Sin bloqueo');

export function openSecurity() {
  let bioOk = null;
  biometricAvailable().then(v => { bioOk = v; ctl.refresh(); });
  const ctl = openSheet({
    full: true,
    render(el) {
      const on = lockEnabled();
      const s = lockSettings();
      el.innerHTML = `${sheetHead('Seguridad')}
        <button class="switch-row" data-pin>${icon('shield-check')}<span class="info"><b>Bloqueo con PIN</b><small>Pide un PIN de 4 números para abrir la app.</small></span><span class="switch ${on ? 'on' : ''}"></span></button>
        ${on ? `
          ${bioOk ? `<button class="switch-row" data-bio style="margin-top:10px">${icon('user')}<span class="info"><b>Desbloquear con Face ID</b><small>Si falla, siempre podés usar el PIN.</small></span><span class="switch ${s.credId ? 'on' : ''}"></span></button>` : ''}
          <div class="field" style="margin-top:16px"><label>Bloquear</label><div class="seg vertical">${Object.entries(TIMEOUTS).map(([k, l]) =>
            `<button data-t="${k}" class="${String(s.timeout ?? 1) === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <button class="btn" data-change>${icon('pencil')}Cambiar PIN</button>` : ''}
        <p class="help" style="margin:16px 4px 0">El PIN se guarda solo en este dispositivo y de forma cifrada. Si lo olvidás, para entrar hay que borrar los datos de este dispositivo; con la sincronización activada, vuelven al iniciar sesión.</p>`;
      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if ('pin' in d) {
          if (on) {
            if (!confirm('¿Quitar el bloqueo con PIN?')) return;
            disableLock();
            toast('Bloqueo desactivado', { icon: 'info' });
            return ctl.refresh();
          }
          return openPinSetup(() => ctl.refresh());
        }
        if ('change' in d) return openPinSetup(() => ctl.refresh());
        if (d.t !== undefined) { setLockTimeout(Number(d.t)); return ctl.refresh(); }
        if ('bio' in d) {
          if (s.credId) { disableBiometric(); return ctl.refresh(); }
          try { await enableBiometric(); toast('Face ID activado', { icon: 'shield-check' }); }
          catch { toast('No se pudo activar Face ID en este dispositivo', { icon: 'info' }); }
          return ctl.refresh();
        }
      };
    },
  });
}
