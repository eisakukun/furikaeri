/* ふりかえり記録 — Service Worker（PWA / オフライン対応）
   方針：network-first。オンライン時は常に最新を取得（更新がすぐ反映）、
        オフライン時のみキャッシュから返す。 */
const CACHE = 'furikaeri-v26';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;               // GAS等のPOSTはそのまま
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;           // 他オリジンは介入しない
  e.respondWith(
    fetch(e.request)
      .then(resp => { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return resp; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
