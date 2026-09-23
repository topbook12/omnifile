/* OmniFile Service Worker — offline shell (network-first with cache fallback) */
const CACHE = 'omnifile-v1'
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/pdf.worker.min.mjs',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(CORE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    (async () => {
      try {
        // Network-first: always prefer fresh content while online.
        const fresh = await fetch(req)
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
          const clone = fresh.clone()
          caches
            .open(CACHE)
            .then((cache) => cache.put(req, clone))
            .catch(() => {})
        }
        return fresh
      } catch (err) {
        // Offline: serve from cache.
        const cached = await caches.match(req)
        if (cached) return cached
        if (req.mode === 'navigate') {
          const shell = (await caches.match('/')) || (await caches.match('/index.html'))
          if (shell) return shell
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      }
    })()
  )
})
