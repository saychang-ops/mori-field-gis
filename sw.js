const CACHE_VERSION = 'v1.2.0';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const TILE_CACHE = 'tiles-v1';

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/style.css',
  '/js/config.js',
  '/js/storage.js',
  '/js/map.js',
  '/js/layers.js',
  '/js/gps.js',
  '/js/search.js',
  '/js/register.js',
  '/js/form.js',
  '/js/camera.js',
  '/js/highlight.js',
  '/js/photo_store.js',
  '/js/migration.js',
  '/js/orphan_gc.js',
  '/js/toast.js',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

const DATA_URLS = [
  '/data/town_roads.geojson',
  '/data/town_bridges.geojson'
];

const TILE_CACHE_MAX_ENTRIES = 500;

async function addAllResilient(cache, urls) {
  const results = await Promise.allSettled(urls.map(u => cache.add(u)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.warn('SW install skip:', urls[i], r.reason);
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await addAllResilient(shell, SHELL_URLS);
    const data = await caches.open(DATA_CACHE);
    await addAllResilient(data, DATA_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== SHELL_CACHE && k !== DATA_CACHE && k !== TILE_CACHE) {
        return caches.delete(k);
      }
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/geocode')) {
    event.respondWith(fetch(req).catch(() => new Response(
      JSON.stringify({ status: 'OFFLINE', results: [] }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )));
    return;
  }

  if (isTileRequest(url)) {
    event.respondWith(handleTile(req));
    return;
  }

  if (isShellRequest(req) || DATA_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

function isTileRequest(url) {
  return url.hostname === 'cyberjapandata.gsi.go.jp' ||
         url.hostname === 'mt1.google.com';
}

function isShellRequest(req) {
  return req.destination === 'style' ||
         req.destination === 'script' ||
         req.destination === 'document' ||
         req.destination === 'image';
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const url = new URL(req.url);
      const cacheName = DATA_URLS.includes(url.pathname) ? DATA_CACHE : SHELL_CACHE;
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return new Response('offline', { status: 503 });
  }
}

async function handleTile(req) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone()).then(() => scheduleTileTrim(cache));
    }
    return res;
  } catch (e) {
    return new Response('', { status: 503 });
  }
}

let trimPending = false;
function scheduleTileTrim(cache) {
  if (trimPending) return;
  trimPending = true;
  setTimeout(async () => {
    try {
      await trimTileCache(cache);
    } finally {
      trimPending = false;
    }
  }, 2000);
}

async function trimTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_CACHE_MAX_ENTRIES) return;
  const toDelete = keys.length - TILE_CACHE_MAX_ENTRIES;
  for (let i = 0; i < toDelete; i++) {
    await cache.delete(keys[i]);
  }
}
