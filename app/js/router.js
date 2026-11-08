// Navegación entre las pestañas inferiores.
const views = {};
let current = 'home';

export const register = (name, fn) => { views[name] = fn; };
export const currentTab = () => current;

export function go(name, params) {
  current = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `s-${name}`));
  document.querySelectorAll('#nav [data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === name));
  const el = document.getElementById(`s-${name}`);
  views[name](el, params);
  el.scrollTop = 0;
}

export function rerender() {
  const el = document.getElementById(`s-${current}`);
  if (!el) return;
  const top = el.scrollTop;
  views[current](el);
  el.scrollTop = top;
}
