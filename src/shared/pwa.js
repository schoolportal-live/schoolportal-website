/**
 * SchoolOS — PWA Registration
 *
 * Registers the service worker and handles updates.
 * Import this in any page's JS to enable PWA features.
 */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      })

      // Check for updates periodically (every 30 minutes)
      setInterval(() => registration.update(), 30 * 60 * 1000)

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            // New version available — show a subtle toast if the components module is loaded
            const event = new CustomEvent('sw-update-available')
            window.dispatchEvent(event)
          }
        })
      })
    } catch (err) {
      console.warn('SW registration failed:', err)
    }
  })
}
