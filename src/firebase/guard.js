/**
 * SchoolPortal — MPA Auth Guard
 *
 * Each protected page calls initGuard() at the top of its JS.
 * The guard:
 *   1. Waits for Firebase to check the persisted auth token
 *   2. Checks login status + Firestore role
 *   3. Redirects or reveals the page content
 *
 * Usage:
 *   import { initGuard } from '../firebase/guard.js'
 *   const { user, role } = await initGuard({ requireAuth: true, requiredRole: 'school_admin' })
 */
import { waitForAuth } from './auth.js'
import { getUserRole, ROLE_ROUTES } from './firestore.js'

/**
 * @param {Object} options
 * @param {boolean} options.requireAuth  — true for protected pages
 * @param {string|null} options.requiredRole — 'school_admin', 'parent', or null (any)
 * @param {string} options.redirectTo — where to send unauthenticated users
 * @returns {Promise<{user: object|null, role: string|null}>}
 */
export async function initGuard({
  requireAuth = false,
  requiredRole = null,
  redirectTo = '/login.html',
} = {}) {
  const user = await waitForAuth()

  // ── Not logged in ───────────────────────────────────────────────
  if (!user) {
    if (requireAuth) {
      window.location.replace(redirectTo)
      // Return a never-resolving promise to halt page execution
      return new Promise(() => {})
    }
    // Public page — just reveal content
    revealContent()
    return { user: null, role: null }
  }

  // ── Logged in — fetch role from Firestore ───────────────────────
  let role = null
  try {
    role = await getUserRole(user.uid)
  } catch (err) {
    console.error('Failed to fetch user role:', err)
  }

  // ── On the login page while logged in → redirect to dashboard ──
  if (!requireAuth) {
    const destination = ROLE_ROUTES[role] || '/login.html'
    if (destination !== '/login.html') {
      window.location.replace(destination)
      return new Promise(() => {})
    }
  }

  // ── On a protected page — check role match ─────────────────────
  if (requireAuth && requiredRole && role !== requiredRole) {
    // Wrong role — send to the correct dashboard, or login if no role
    const destination = ROLE_ROUTES[role] || '/login.html'
    window.location.replace(destination)
    return new Promise(() => {})
  }

  // ── All checks passed — reveal the page ────────────────────────
  revealContent()
  return { user, role }
}

/** Remove the auth-loading state so page content becomes visible. */
function revealContent() {
  document.body.classList.remove('auth-loading')
  document.body.classList.add('auth-ready')
}
