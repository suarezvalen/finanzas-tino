// Ajustes generales, copias de seguridad y borrado de datos.
import { state, saveSettings, replaceAll, wipe, sortedTxs, txs, getAccount, getCategory } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, amountInput, parseAmount, fmtNum, saveFile } from '../ui.js';
import { today } from '../dates.js';
import { APP_VERSION } from '../constants.js';
import { linkInfo } from '../components.js';

const listItem = (attr, ic, title, sub, color = '') =>
  `<button class="item tap" ${attr}><span class="cat-ic" ${color ? `style="--c:${color}"` : ''}>${icon(ic)}</span>
   <span class="info"><b>${title}</b><small>${sub}</small></span>${icon('chevron-right', 'chev')}</button>`;

export function openSettings({ focus } = {}) {
  openSheet({
    full: true,
    render(el, ctl) {
      const s = state.settings;
      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>Ajustes</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <div class="field"><label for="sn">Tu nombre</label><input class="input" id="sn" maxlength="30" autocomplete="off" value="${esc(s.name)}"></div>
        <div class="field"><label for="sb">Presupuesto mensual</label>
          <input class="input" id="sb" inputmode="numeric" autocomplete="off" placeholder="$ 0 (sin presupuesto)" value="${s.budget ? fmtNum(s.budget) : ''}">
          <p class="help">Lo máximo que querés gastar por mes. Los límites por categoría están en Más → Presupuestos.</p></div>
        <button class="btn primary" data-save>Guardar</button>

        <div class="section-h"><h3>Copias de seguridad</h3></div>
        <p class="help" style="margin:-2px 4px 10px">Tus datos se guardan en este dispositivo. Hacé una copia cada tanto y guardala en un lugar seguro (por ejemplo, iCloud Drive).</p>
        <div class="list">
          ${listItem('data-export', 'download', 'Exportar copia completa', 'Archivo .json para restaurar después')}
          ${listItem('data-csv', 'file-spreadsheet', 'Exportar movimientos a Excel', 'Archivo .csv', '#2EF2A0')}
          ${listItem('data-import', 'upload', 'Restaurar una copia', 'Reemplaza los datos actuales', '#FFB547')}
        </div>
        <input type="file" id="imp" accept=".json,application/json" hidden>

        <div class="section-h"><h3>Zona peligrosa</h3></div>
        <div class="list">${listItem('data-wipe', 'trash-2', '<span class="neg">Borrar todos los datos</span>', 'Empieza de cero. No se puede deshacer.', '#FF5C7A')}</div>
        <p class="foot">Finanzas Tino · versión ${APP_VERSION}<br><span id="persist"></span></p>`;

      if (focus === 'budget') setTimeout(() => el.querySelector('#sb').focus(), 400);
      amountInput(el.querySelector('#sb'));
      navigator.storage?.persisted?.().then(p => {
        const span = el.querySelector('#persist');
        if (span) span.textContent = p ? 'Almacenamiento protegido' : 'Almacenamiento estándar';
      });

      el.querySelector('#imp').onchange = async e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (file) await importBackup(file, ctl);
      };

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if ('save' in d) {
          await saveSettings({ name: el.querySelector('#sn').value.trim(), budget: parseAmount(el.querySelector('#sb').value) });
          toast('Ajustes guardados');
          return ctl.close();
        }
        if ('export' in d) return exportBackup();
        if ('csv' in d) return exportCsv();
        if ('import' in d) return el.querySelector('#imp').click();
        if ('wipe' in d) {
          if (!confirm('¿Borrar TODOS tus datos? Se pierden cuentas, categorías y movimientos.')) return;
          if (!confirm('Última confirmación: esto no se puede deshacer. ¿Seguro?')) return;
          await wipe();
          for (const k of ['ft-lock', 'ft-auth', 'ft-sync']) { try { localStorage.removeItem(k); } catch { /* nada */ } }
          location.reload();
        }
      };
    },
  });
}

async function exportBackup() {
  const { accounts, categories, transactions, recurring, investments, goals, debts, settings, inflation } = state;
  const data = {
    app: 'finanzas-tino', format: 3, exportedAt: new Date().toISOString(),
    accounts, categories, transactions, recurring, investments, goals, debts, settings, inflation,
  };
  await saveFile(`finanzas-tino-copia-${today()}.json`, JSON.stringify(data, null, 1), 'application/json');
}

/** Exporta movimientos a CSV (Excel). Por defecto, todos. */
export async function exportCsv(list = txs(), name = `finanzas-tino-movimientos-${today()}.csv`) {
  const TYPE = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia', in: 'Entrada', out: 'Salida' };
  const cell = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Fecha', 'Tipo', 'Monto', 'Categoría', 'Cuenta', 'Cuenta destino', 'Nota', 'Cuota']];
  for (const t of sortedTxs(list).reverse()) {
    rows.push([
      t.date, TYPE[t.type], t.type === 'expense' || t.type === 'out' ? -t.amount : t.amount,
      getCategory(t.categoryId)?.name || (t.link ? linkInfo(t).label : ''), getAccount(t.accountId)?.name || '',
      getAccount(t.toAccountId)?.name || (t.link ? linkInfo(t).title : ''), t.note || '',
      t.installment ? `${t.installment.n}/${t.installment.total}` : '',
    ]);
  }
  const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  await saveFile(name, csv, 'text/csv');
}

async function importBackup(file, ctl) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { alert('No se pudo leer el archivo. ¿Es una copia exportada desde esta app?'); return; }
  const ok = data?.app === 'finanzas-tino' && ['accounts', 'categories', 'transactions'].every(k => Array.isArray(data[k]));
  if (!ok) { alert('Este archivo no es una copia de Finanzas Tino.'); return; }
  const n = data.transactions.filter(t => !t.deleted).length;
  if (!confirm(`La copia tiene ${n} movimientos. Esto reemplaza TODOS los datos actuales. ¿Continuar?`)) return;
  await replaceAll(data);
  ctl.close();
  toast('Copia restaurada');
}
