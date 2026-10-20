// notepad-- service worker
// 1) offline: network-first for the app shell, cache fallback (updates land on the next online load)
// 2) Android share target: receives the POST and hands files to the page via a cache inbox
const APP = 'nph-app-31f69074ff';
const INBOX = 'nph-share';
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
               'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const MAX_FILES = 10, MAX_BYTES = 5 * 1024 * 1024;
const scoped = p => new URL(p, self.registration.scope).href;

self.addEventListener('install', e => e.waitUntil(
  caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== APP && k !== INBOX) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.href === scoped('share-target')) return e.respondWith(receiveShare(req));
  if (req.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;  // not ours: browser default
  // Opening the app, with any query or #fragment, is one cache entry. Other pages in scope
  // (the README, say) are left alone, so they can never replace the app offline.
  const app = [scoped('./'), scoped('index.html')].includes(url.origin + url.pathname);
  if (req.mode === 'navigate' && !app) return;
  const key = app ? scoped('./') : req;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') await (await caches.open(APP)).put(key, res.clone());
      return res;
    } catch (err) {
      return (await caches.match(key, { ignoreSearch: true })) || Response.error();
    }
  })());
});

async function receiveShare(req) {
  const items = [];
  try {
    const form = await req.formData();
    for (const f of form.getAll('files').slice(0, MAX_FILES)) {
      if (!(f instanceof File) || f.size > MAX_BYTES) continue;
      items.push({ name: String(f.name || 'shared.txt').slice(0, 120), text: await f.text() });
    }
    const text = ['title', 'text', 'url'].map(k => form.get(k)).filter(v => typeof v === 'string' && v).join('\n');
    if (!items.length && text) items.push({ name: 'shared.txt', text: text.slice(0, MAX_BYTES) });
  } catch (err) { /* malformed share: open the app empty-handed */ }
  await (await caches.open(INBOX)).put(scoped('shared-inbox'),
    new Response(JSON.stringify(items), { headers: { 'content-type': 'application/json' } }));
  return Response.redirect(scoped('./?share=1'), 303);
}
