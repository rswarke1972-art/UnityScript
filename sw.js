const CACHE_NAME = 'unityscript-v3';
const OFFLINE_FALLBACK_URL = 'offline.html';

const PRECACHE_ASSETS = [
  'index.html',
  'chapters.html',
  'verses.html',
  'viewer.html',
  'offline.html',
  'style.css',
  'script.js',
  'manifest.json',
  'data/scriptures-meta.json',
  'icons/icon-72.png',
  'icons/icon-96.png',
  'icons/icon-128.png',
  'icons/icon-144.png',
  'icons/icon-152.png',
  'icons/icon-192.png',
  'icons/icon-384.png',
  'icons/icon-512.png'
];

// Install Event - Precache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precaching app shell...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Caching strategies
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip non-GET requests and external resources (except Google Fonts)
  if (event.request.method !== 'GET') return;

  // 1. Google Fonts - Cache First
  if (requestUrl.hostname === 'fonts.googleapis.com' || requestUrl.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 2. Scripture Datasets (data/*.json) - Network First (so it stays fresh, fallbacks to cache offline)
  if (requestUrl.pathname.includes('/data/') && requestUrl.pathname.endsWith('.json') && !requestUrl.pathname.endsWith('scriptures-meta.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.request).then((networkResponse) => {
          // If network call succeeds, put in cache and return
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // If network fails (offline), load from cache
          return cache.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Fallback error response if not cached
            return new Response(JSON.stringify({ error: 'offline', message: 'Scripture content not cached for offline use.' }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        });
      })
    );
    return;
  }

  // 3. App Shell assets (HTML, CSS, JS, meta) - Stale While Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[Service Worker] Network request failed for: ' + event.request.url, err);
          // If HTML request failed, serve offline.html fallback
          if (event.request.mode === 'navigate') {
            return cache.match(OFFLINE_FALLBACK_URL);
          }
        });

        return cachedResponse || fetchPromise;
      });
    })
  );
});
