const CACHE_VERSION = 'v6';
const SHELL_CACHE = `rozklad-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `rozklad-assets-${CACHE_VERSION}`;
const ACTIVE_CACHES = new Set([SHELL_CACHE, ASSET_CACHE]);

const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png?v=4',
  '/icons/favicon-32x32.png?v=4',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) {
            await cache.put(url, response);
          }
        })
      );
      if (!self.registration?.active) {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('rozklad-') && !ACTIVE_CACHES.has(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isNavigationRequest(request) {
  if (request.mode === 'navigate' || request.destination === 'document') {
    return true;
  }
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

async function handleNavigation(request) {
  const shellCache = await caches.open(SHELL_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      await shellCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const exactMatch = await shellCache.match(request);
    if (exactMatch) {
      return exactMatch;
    }
    const rootMatch = await shellCache.match('/');
    if (rootMatch) {
      return rootMatch;
    }
    const offlineFallback = await shellCache.match(OFFLINE_URL);
    if (offlineFallback) {
      return offlineFallback;
    }
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const networkResponse = await fetch(request);
  if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
    await cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw new Error('Network and cache unavailable');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Handle Google Fonts for smooth offline typography
  if (url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  if (url.origin === 'https://fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE, event));
    return;
  }

  // Leave other cross-origin requests untouched
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never intercept sw.js itself
  if (url.pathname === '/sw.js') {
    return;
  }

  // Network-first for HTML / SPA navigation so users never stay on outdated builds
  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Cache-first for Vite content-hashed build assets
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Stale-while-revalidate for icons, favicons, and manifest
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE, event));
    return;
  }

  // Network-first with cache fallback for any remaining same-origin GET requests
  event.respondWith(networkFirstWithCache(request, ASSET_CACHE));
});
