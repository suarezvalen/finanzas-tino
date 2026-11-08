import { ICONS } from './icons-data.js';

export function icon(name, cls = '') {
  const inner = ICONS[name] || ICONS.shapes;
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
