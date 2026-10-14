/* Tiebreak · cache para funcionar offline. Ao publicar uma versão nova, mude VERSAO. */
const VERSAO = 'tiebreak-1.2.0';
const FONTES = 'tiebreak-fontes';
const ARQUIVOS = [
  './', 'index.html', 'styles.css', 'app.js', 'plano.json', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO && k !== FONTES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fontes do Google: guarda na primeira vez e usa o cache depois.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Arquivos do app: responde do cache na hora e atualiza em segundo plano.
  e.respondWith(caches.open(VERSAO).then(async (c) => {
    const chave = req.mode === 'navigate' ? 'index.html' : req;
    const hit = await c.match(chave, { ignoreSearch: true });
    const rede = fetch(req).then((res) => {
      if (res.ok) c.put(chave, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(rede); return hit; }
    const res = await rede;
    return res || new Response('Sem conexão.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
