// Panel de sincronización: crear cuenta / iniciar sesión, estado y sincronizar ahora.
import { state, hasLocalData } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc } from '../ui.js';
import { sheetHead } from '../components.js';
import {
  isConfigured, saveConfig, session, syncInfo, syncStatus, onSyncChange,
  signIn, signUp, signOut, sync, remoteHasData, replaceWithRemote,
} from '../logic/sync.js';

function ago(iso) {
  if (!iso) return 'nunca';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('es-AR');
}

const STATUS_TEXT = {
  idle: ['Listo', ''], syncing: ['Sincronizando…', 'acc-c'], ok: ['Al día', 'pos'],
  error: ['No se pudo sincronizar', 'neg'], auth: ['Tenés que volver a iniciar sesión', 'neg'], offline: ['Sin internet: se sincroniza cuando vuelva', 'warn-c'],
};

/** Texto corto para mostrar en Más / Ajustes. */
export function syncLabel() {
  if (!isConfigured()) return 'Usá tus datos en la PC';
  if (!session()) return 'Desactivada';
  const { status } = syncStatus();
  return status === 'ok' || status === 'idle' ? `Al día · ${ago(syncInfo().lastSync)}` : STATUS_TEXT[status][0];
}

/**
 * @param {object} [o]
 * @param {boolean} [o.onboarding] viene de la bienvenida (dispositivo nuevo)
 * @param {() => void} [o.onDone] se llama cuando el dispositivo quedó con datos
 */
export function openSync({ onboarding = false, onDone } = {}) {
  const F = { mode: 'login', email: '', password: '', url: '', key: '', busy: false };
  let unsub = false;
  const ctl = openSheet({
    full: true,
    onClose: () => { unsub = true; },
    render(el) {
      if (!isConfigured()) return renderSetup(el);
      if (!session()) return renderLogin(el);
      return renderStatus(el);
    },
  });
  onSyncChange(() => { if (!unsub && session()) ctl.refresh(); });

  /* --- Sin servidor configurado --- */
  function renderSetup(el) {
    el.innerHTML = `${sheetHead('Sincronización')}
      <p class="help" style="margin:-6px 2px 14px">Para usar tus datos en la PC y en el celular hace falta un proyecto gratuito en <b>Supabase</b>. Pegá acá la dirección y la clave pública del proyecto.</p>
      <div class="field"><label for="su">Project URL</label><input class="input" id="su" autocomplete="off" autocapitalize="off" placeholder="https://xxxx.supabase.co" value="${esc(F.url)}"></div>
      <div class="field"><label for="sk">Clave pública (anon / publishable)</label><input class="input" id="sk" autocomplete="off" autocapitalize="off" placeholder="sb_publishable_… o eyJ…" value="${esc(F.key)}"></div>
      <button class="btn primary" data-cfg>Guardar</button>`;
    el.querySelector('#su').oninput = e => { F.url = e.target.value; };
    el.querySelector('#sk').oninput = e => { F.key = e.target.value; };
    el.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if ('close' in b.dataset) return ctl.close();
      if ('cfg' in b.dataset) {
        if (!/^https:\/\/.+/.test(F.url.trim()) || F.key.trim().length < 20) { toast('Revisá la dirección y la clave', { icon: 'info' }); return; }
        saveConfig(F.url, F.key);
        ctl.refresh();
      }
    };
  }

  /* --- Iniciar sesión / crear cuenta --- */
  function renderLogin(el) {
    const login = F.mode === 'login';
    el.innerHTML = `${sheetHead(onboarding ? 'Traer mis datos' : 'Sincronización')}
      <div class="sync-hero">${icon('cloud')}<p>${onboarding
        ? 'Iniciá sesión con la cuenta que creaste en tu otro dispositivo y traigo todos tus datos.'
        : 'Con una cuenta, tus datos se guardan en la nube y los ves igual en el celular y en la PC.'}</p></div>
      <div class="seg" style="margin-bottom:16px"><button data-mode="login" class="${login ? 'on' : ''}">Iniciar sesión</button><button data-mode="signup" class="${login ? '' : 'on'}">Crear cuenta</button></div>
      <form id="lf" autocomplete="on" onsubmit="return false">
        <div class="field"><label for="le">Email</label><input class="input" id="le" type="email" inputmode="email" autocomplete="username" autocapitalize="off" value="${esc(F.email)}"></div>
        <div class="field"><label for="lp">Contraseña</label><input class="input" id="lp" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" minlength="6" value="${esc(F.password)}">
          ${login ? '' : '<p class="help">Mínimo 6 caracteres. El iPhone te puede sugerir una segura y guardarla.</p>'}</div>
        <button class="btn primary" type="submit" data-go ${F.busy ? 'disabled' : ''}>${F.busy ? 'Un momento…' : login ? 'Iniciar sesión' : 'Crear cuenta'}</button>
      </form>
      <p class="help" style="margin:14px 2px 0">${icon('shield-check')} Tus datos quedan protegidos: solo tu usuario puede leerlos.</p>`;
    el.querySelector('#le').oninput = e => { F.email = e.target.value.trim(); };
    el.querySelector('#lp').oninput = e => { F.password = e.target.value; };
    el.onclick = async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if ('close' in b.dataset) return ctl.close();
      if (b.dataset.mode) { F.mode = b.dataset.mode; return ctl.refresh(); }
      if ('go' in b.dataset) {
        if (!/.+@.+\..+/.test(F.email)) { toast('Poné un email válido', { icon: 'info' }); return; }
        if (F.password.length < 6) { toast('La contraseña tiene que tener al menos 6 caracteres', { icon: 'info' }); return; }
        F.busy = true; ctl.refresh();
        try {
          if (F.mode === 'signup') {
            const r = await signUp(F.email, F.password);
            if (r.confirm) {
              F.busy = false; F.mode = 'login'; ctl.refresh();
              alert('Te mandamos un mail para confirmar la cuenta. Abrilo, tocá el link y después volvé acá e iniciá sesión.');
              return;
            }
          } else {
            await signIn(F.email, F.password);
          }
          await firstSync();
        } catch (err) {
          toast(err.message || 'No se pudo conectar', { icon: 'triangle-alert' });
        }
        F.busy = false;
        if (!unsub) ctl.refresh();
      }
    };
  }

  /** Primera sincronización en este dispositivo: decide si unir o traer todo de la nube. */
  async function firstSync() {
    const remote = await remoteHasData();
    const local = hasLocalData();
    if (remote && local && !onboarding) {
      const replace = confirm('Este dispositivo y la nube ya tienen datos.\n\nAceptar: usar solo los datos de la nube en este dispositivo.\nCancelar: unir los dos (si cargaste lo mismo en ambos, puede quedar repetido).');
      if (replace) await replaceWithRemote(); else await sync();
    } else if (remote) {
      await replaceWithRemote();
    } else {
      await sync();
    }
    if (onboarding) {
      if (state.settings.onboarded) { toast('¡Listo! Tus datos ya están acá'); ctl.close(); onDone?.(); }
      else toast('Tu cuenta todavía no tiene datos: completá la bienvenida y se van a guardar en la nube', { icon: 'info' });
    } else {
      toast(remote ? 'Datos sincronizados' : 'Listo: tus datos ya están en la nube');
    }
  }

  /* --- Conectado --- */
  function renderStatus(el) {
    const s = session();
    const st = syncStatus();
    const [txt, cls] = STATUS_TEXT[st.status] || STATUS_TEXT.idle;
    el.innerHTML = `${sheetHead('Sincronización')}
      <section class="card hero">
        <div class="row" style="align-items:center;gap:12px"><span class="cta-ic">${icon('cloud')}</span>
          <div class="info"><b>${esc(s.user?.email || 'Conectado')}</b><small class="${cls}">${txt}${st.status === 'error' && st.error ? ` · ${esc(st.error)}` : ''}</small></div></div>
        <div class="rows"><div><span>Última sincronización</span><b>${ago(syncInfo().lastSync)}</b></div></div>
        <button class="btn primary" data-now style="margin-top:14px" ${st.status === 'syncing' ? 'disabled' : ''}>${icon('refresh-cw')}Sincronizar ahora</button>
      </section>
      <p class="help" style="margin:0 4px 16px">Se sincroniza solo cuando abrís la app y cada vez que cargás algo. Para usarla en la PC, entrá a la misma dirección desde el navegador e iniciá sesión con este email.</p>
      <button class="btn" data-out>${icon('x')}Cerrar sesión en este dispositivo</button>`;
    el.onclick = async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if ('close' in b.dataset) return ctl.close();
      if ('now' in b.dataset) {
        try { await sync(); toast('Al día'); } catch (err) { toast(err.message, { icon: 'triangle-alert' }); }
        return;
      }
      if ('out' in b.dataset) {
        if (!confirm('¿Cerrar sesión? Tus datos siguen guardados en este dispositivo, pero dejan de sincronizarse.')) return;
        await signOut();
        ctl.refresh();
      }
    };
  }
}
