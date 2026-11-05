// オフライン対応(Service Worker)
// - 初回に下の一覧をすべて保存する。保存が終わるまでは古い版が動き続ける
// - 画面と自前のファイルはネット優先。つながれば最新、つながらなければ保存したものを使う
// - vendor/ は大きくて変わらないので保存優先
// - 一覧にないファイル(tests/ など)と別サイトへの通信には関わらない
// ファイルを増やすか vendor/ を入れ替えたら、下の一覧を直して VERSION を上げること
const VERSION = '1';
const PREFIX = 'iv-importer-';
const CACHE = PREFIX + VERSION;
const NET_WAIT_MS = 4000;

const APP_FILES = [
  'index.html', 'manifest.webmanifest',
  'css/style.css',
  'js/match.js', 'js/csv.js', 'js/reader.js', 'js/app.js',
  'data/pokemon.js', 'data/dict.js', 'data/icons.js',
  'icons/icon.svg', 'icons/icon-32.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
const VENDOR_FILES = [
  'vendor/tesseract.min.js', 'vendor/worker.min.js',
  'vendor/core/tesseract-core-simd-lstm.wasm.js', 'vendor/core/tesseract-core-lstm.wasm.js',
  'vendor/lang/eng.traineddata.gz', 'vendor/lang/jpn.traineddata.gz',
];
const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...APP_FILES, ...VENDOR_FILES].map((path) => new Request(scoped(path), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// 読めたら保存し直す。電波が弱くて返事がないときは NET_WAIT_MS で保存したものに切り替える
async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(async (res) => {
    if (res.ok) await cache.put(key, res.clone());
    return res;
  });
  net.catch(() => {}); // 先に保存したものを返したあとの失敗は無視する
  let timer;
  const wait = new Promise((_, ng) => { timer = setTimeout(() => ng(new Error('timeout')), NET_WAIT_MS); });
  try {
    return await Promise.race([net, wait]);
  } catch {
    return (await cache.match(key)) ?? net;
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirst(req, key) {
  const cache = await caches.open(CACHE);
  return (await cache.match(key)) ?? fetch(req);
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  const path = req.url.slice(self.registration.scope.length).split(/[?#]/)[0] || 'index.html';
  if (APP_FILES.includes(path)) ev.respondWith(networkFirst(req, scoped(path)));
  else if (VENDOR_FILES.includes(path)) ev.respondWith(cacheFirst(req, scoped(path)));
});
