/**
 * SchoolOS — MPA Auth Guard
 *
 * Each protected page calls initGuard() at the top of its JS.
 * The guard:
 *   1. Waits for Firebase to check the persisted auth token
 *   2. Checks login status + Firestore role
 *   3. Redirects or reveals the page content
 *   4. Fetches user doc + school doc for branding and module checks
 *
 * Usage:
 *   import { initGuard } from '../firebase/guard.js'
 *   const { user, role, userDoc, school } = await initGuard({
 *     requireAuth: true,
 *     allowedRoles: ['super_admin', 'admin'],
 *   })
 */
import { waitForAuth } from './auth.js'
import { getUserDoc } from './firestore.js'
import { getSchool } from './schools.js'
import { ROLES, ROLE_ROUTES } from '../shared/constants.js'
import { applyBranding } from '../shared/branding.js'
import { registerServiceWorker } from '../shared/pwa.js'
import { isNative, setStatusBarColor, setupBackButton } from '../shared/native.js'

// Register PWA service worker on every guarded page
registerServiceWorker()

// Legacy ROLE_ROUTES re-export for backward compatibility
// (existing firestore.js still exports ROLE_ROUTES from its own ROLES — those pages still work)

/**
 * Resolve the correct dashboard URL for a role.
 * Supports both new roles and the legacy 'school_admin' role.
 */
function getRouteForRole(role) {
  // Legacy mapping: school_admin → admin dashboard (existing pages still work)
  if (role === 'school_admin') return '/admin/dashboard.html'
  return ROLE_ROUTES[role] || '/login.html'
}

/**
 * @param {Object} options
 * @param {boolean} options.requireAuth — true for protected pages
 * @param {string|null} options.requiredRole — single role check (legacy, still works)
 * @param {string[]|null} options.allowedRoles — array of allowed roles (new, preferred)
 * @param {string} options.redirectTo — where to send unauthenticated users
 * @param {boolean} options.loadSchool — whether to fetch school doc + apply branding (default true)
 * @returns {Promise<{user, role, userDoc, school}>}
 */
export async function initGuard({
  requireAuth = false,
  requiredRole = null,
  allowedRoles = null,
  redirectTo = '/login.html',
  loadSchool = true,
} = {}) {
  const user = await waitForAuth()

  // ── Not logged in ───────────────────────────────────────────────
  if (!user) {
    if (requireAuth) {
      window.location.replace(redirectTo)
      return new Promise(() => {})
    }
    revealContent()
    return { user: null, role: null, userDoc: null, school: null }
  }

  // ── Logged in — fetch user doc from Firestore ──────────────────
  let userDoc = null
  let role = null
  try {
    userDoc = await getUserDoc(user.uid)
    role = userDoc?.role || null
  } catch (err) {
    console.error('Failed to fetch user doc:', err)
  }

  // ── On the login page while logged in → redirect to dashboard ──
  if (!requireAuth) {
    const destination = getRouteForRole(role)
    if (destination !== '/login.html') {
      window.location.replace(destination)
      return new Promise(() => {})
    }
  }

  // ── On a protected page — check role match ─────────────────────
  if (requireAuth) {
    const roleAllowed = checkRoleAllowed(role, requiredRole, allowedRoles)
    if (!roleAllowed) {
      const destination = getRouteForRole(role)
      window.location.replace(destination)
      return new Promise(() => {})
    }
  }

  // ── Fetch school doc + apply branding ──────────────────────────
  let school = null
  if (loadSchool && userDoc?.schoolId) {
    try {
      school = await getSchool(userDoc.schoolId)
      if (school?.branding) {
        applyBranding(school.branding)
      }
    } catch (err) {
      console.warn('Failed to load school branding:', err)
    }
  }

  // ── Native app setup (Capacitor) ───────────────────────────────
  if (isNative()) {
    setupBackButton()
    const primaryColor = school?.branding?.primaryColor || '#2563eb'
    setStatusBarColor(primaryColor)
  }

  // ── All checks passed — reveal the page ────────────────────────
  revealContent()
  return { user, role, userDoc, school }
}

/**
 * Check if a role is allowed on this page.
 * Supports both single requiredRole (legacy) and allowedRoles array (new).
 */
function checkRoleAllowed(role, requiredRole, allowedRoles) {
  if (!requiredRole && !allowedRoles) return true // No restriction
  if (allowedRoles) return allowedRoles.includes(role)
  return role === requiredRole
}

/** Remove the auth-loading state so page content becomes visible. */
function revealContent() {
  document.body.classList.remove('auth-loading')
  document.body.classList.add('auth-ready')
}
