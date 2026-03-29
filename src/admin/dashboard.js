/**
 * SchoolPortal — Admin Dashboard JS
 * Protected page: requires auth + school_admin role
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'

// ── Auth Guard: must be school_admin ──────────────────────────────────────
const { user } = await initGuard({
  requireAuth: true,
  requiredRole: 'school_admin',
})

// ── Populate UI ───────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
const nameEl = document.getElementById('user-name')
const welcomeEl = document.getElementById('welcome-name')

if (nameEl) nameEl.textContent = displayName
if (welcomeEl) welcomeEl.textContent = displayName

// ── Logout ────────────────────────────────────────────────────────────────
const logoutBtn = document.getElementById('logout-btn')
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await logout()
    window.location.replace('/login.html')
  })
}
