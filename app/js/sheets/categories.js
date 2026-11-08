// Administrar categorías de gastos e ingresos.
import { categories, getCategory, upsert, remove, txs } from '../store.js';
import { icon } from '../icons.js';
import { openSheet, toast, esc, mark } from '../ui.js';
import { catIc } from '../components.js';
import { COLORS, CATEGORY_ICONS } from '../constants.js';

let kind = 'expense';

export function openCategories() {
  openSheet({
    full: true,
    live: true,
    render(el, ctl) {
      const list = categories(kind);
      const counts = {};
      for (const t of txs()) if (t.categoryId) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>Categorías</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <div class="seg" style="margin-bottom:14px"><button data-kind="expense" class="${kind === 'expense' ? 'on' : ''}">Gastos</button><button data-kind="income" class="${kind === 'income' ? 'on' : ''}">Ingresos</button></div>
        <div class="list">${list.map(c => `<button class="item tap" data-id="${c.id}">${catIc(c)}
          <span class="info"><b>${esc(c.name)}</b><small>${counts[c.id] ? `${counts[c.id]} movimiento${counts[c.id] > 1 ? 's' : ''}` : 'Sin movimientos'}</small></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>
        <button class="btn primary" data-new style="margin-top:14px">${icon('plus')}Nueva categoría</button>`;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('close' in b.dataset) ctl.close();
        else if (b.dataset.kind) { kind = b.dataset.kind; ctl.refresh(); }
        else if ('new' in b.dataset) openCategoryEdit(null, kind);
        else if (b.dataset.id) openCategoryEdit(b.dataset.id);
      };
    },
  });
}

export function openCategoryEdit(id, newKind = 'expense') {
  const ex = id ? getCategory(id) : null;
  const F = { name: ex?.name || '', icon: ex?.icon || 'shapes', color: ex?.color || COLORS[0], kind: ex?.kind || newKind };

  openSheet({
    full: true,
    render(el, ctl) {
      el.innerHTML = `
        <div class="grab"></div>
        <div class="sheet-head"><h2>${ex ? 'Editar categoría' : `Nueva categoría de ${F.kind === 'expense' ? 'gasto' : 'ingreso'}`}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <div class="preview" id="pv">${catIc(F)}<b id="pvname">${esc(F.name || 'Nombre')}</b></div>
        <div class="field"><label for="cn">Nombre</label><input class="input" id="cn" maxlength="24" autocomplete="off" placeholder="Ej: Nafta, Gimnasio, Delivery…" value="${esc(F.name)}"></div>
        <div class="field"><label>Color</label><div class="swatches" id="sw">${COLORS.map(c =>
          `<button class="swatch ${F.color === c ? 'on' : ''}" data-color="${c}" style="color:${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
        <div class="field"><label>Ícono</label><div class="icon-grid" id="ig" style="--c:${F.color}">${CATEGORY_ICONS.map(i =>
          `<button class="${F.icon === i ? 'on' : ''}" data-icon="${i}" aria-label="${i}">${icon(i)}</button>`).join('')}</div></div>
        <button class="btn primary" data-save>${ex ? 'Guardar cambios' : 'Crear categoría'}</button>
        ${ex ? `<button class="btn danger" data-delete style="margin-top:10px">${icon('trash-2')}Eliminar categoría</button>` : ''}`;

      const preview = () => {
        el.querySelector('#pv .cat-ic').outerHTML = catIc(F);
        el.querySelector('#pvname').textContent = F.name || 'Nombre';
        el.querySelector('#ig').style.setProperty('--c', F.color);
      };
      el.querySelector('#cn').oninput = e => { F.name = e.target.value; preview(); };

      el.onclick = async e => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if ('close' in d) return ctl.close();
        if (d.color) { F.color = d.color; mark(el.querySelector('#sw'), b); return preview(); }
        if (d.icon) { F.icon = d.icon; mark(el.querySelector('#ig'), b); return preview(); }
        if ('save' in d) {
          if (!F.name.trim()) { el.querySelector('#cn').focus(); toast('Ponele un nombre', { icon: 'info' }); return; }
          const rec = { name: F.name.trim(), icon: F.icon, color: F.color, kind: F.kind };
          if (ex) rec.id = ex.id; else rec.order = Date.now();
          await upsert('categories', rec);
          toast(ex ? 'Categoría actualizada' : 'Categoría creada');
          return ctl.close();
        }
        if ('delete' in d) {
          if (!confirm(`¿Eliminar "${ex.name}"? Los movimientos que ya la usan la conservan.`)) return;
          await remove('categories', ex.id);
          toast('Categoría eliminada', { icon: 'trash-2' });
          ctl.close();
        }
      };
    },
  });
}
