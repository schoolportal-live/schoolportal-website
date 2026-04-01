/**
 * SchoolOS — Service Worker
 *
 * Strategy:
 *   - App shell (HTML, CSS, JS, fonts) → Cache First with network fallback
 *   - API calls (Firestore) → Network First with no cache (real-time data)
 *   - Images/icons → Cache First
 *   - Offline fallback page for navigation requests
 */

const CACHE_NAME = 'schoolos-v1'
const APP_SHELL = [
  '/login.html',
  '/offline.html',
  '/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
]

// ── Install: pre-cache app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: clean old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: strategy router ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip Firebase/Firestore API calls — always network
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com') ||
      url.hostname.includes('firebaseio.com')) {
    return
  }

  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') return

  // Navigation requests: network first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful navigation responses
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match('/offline.html'))
    )
    return
  }

  // Static assets: cache first, network fallback
  if (url.pathname.match(/\.(js|css|svg|png|jpg|jpeg|gif|woff2?|ttf|eot)$/)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          return response
        })
      })
    )
    return
  }

  // Google Fonts: cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          return response
        })
      })
    )
    return
  }

  // Everything else: network first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  )
})
