// Service worker: permite abrir la app sin internet.
// Con conexión siempre trae la última versión; sin conexión usa la copia guardada.
// Al publicar cambios, subí VERSION para limpiar copias viejas.
const VERSION = 'v1.1.0';
const CACHE = `ft-${VERSION}`;
const FONTS = 'ft-fonts';

const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'js/main.js', 'js/store.js', 'js/db.js', 'js/dates.js', 'js/ui.js', 'js/router.js',
  'js/components.js', 'js/constants.js', 'js/icons.js', 'js/icons-data.js',
  'js/views/home.js', 'js/views/movs.js', 'js/views/reports.js', 'js/views/more.js',
  'js/sheets/tx.js', 'js/sheets/accounts.js', 'js/sheets/categories.js', 'js/sheets/settings.js', 'js/sheets/onboarding.js',
  'js/sheets/amount.js', 'js/sheets/cards.js', 'js/sheets/budgets.js', 'js/sheets/recurring.js', 'js/sheets/upcoming.js',
  'js/logic/cards.js', 'js/logic/recurring.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONTS));
  } else if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { signal: AbortSignal.timeout(4000) });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    return hit || Response.error();
  }
}
