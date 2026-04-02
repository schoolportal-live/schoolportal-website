/**
 * SchoolOS — Login Page JS
 * Handles: Firebase Auth login, role-based redirect,
 *          tab switching, show/hide password, school branding
 */
import { loginWithEmail } from './firebase/auth.js'
import { getUserRole, ROLE_ROUTES } from './firebase/firestore.js'
import { initGuard } from './firebase/guard.js'
import { getSchool } from './firebase/schools.js'
import { applyBranding } from './shared/branding.js'
import { isNative, isBiometricAvailable, authenticateWithBiometric } from './shared/native.js'

// ── Auth Guard: if already logged in, redirect to dashboard ───────────────
// We await the guard so Firebase is fully initialized before loading branding
const guardResult = initGuard({ requireAuth: false })

// ── School Branding ──────────────────────────────────────────────────────
// Detect school from URL: /login.html?school=greenfield-academy
const urlParams = new URLSearchParams(window.location.search)
const schoolSlug = urlParams.get('school')

// Wait for guard to finish (Firebase init), then apply branding
guardResult.then(() => {
  if (schoolSlug) loadSchoolBranding(schoolSlug)
})

async function loadSchoolBranding(slug) {
  try {
    const school = await getSchool(slug)
    if (!school || !school.branding) return

    const branding = school.branding

    // Apply CSS custom properties (colors)
    applyBranding(branding, { applyColors: true, applyLogo: true, applyName: true })

    // Update login page title
    document.title = `Log In — ${branding.schoolName || 'SchoolOS'}`

    // Show school logo if available
    const logoImg = document.getElementById('school-logo-img')
    const logoMark = document.getElementById('logo-mark-fallback')
    if (branding.logo && logoImg) {
      logoImg.src = branding.logo
      logoImg.alt = branding.schoolName || 'School Logo'
      logoImg.style.display = 'block'
      if (logoMark) logoMark.style.display = 'none'
    }

    // Update tagline for school-specific login
    const tagline = document.getElementById('login-tagline')
    if (tagline) {
      tagline.textContent = `Welcome to ${branding.schoolName}`
    }
    const desc = document.getElementById('login-description')
    if (desc) {
      desc.textContent = `Sign in to access your school portal. Parents, teachers, and staff — enter your credentials below.`
    }

    // Apply primary color to login-left panel background
    if (branding.primaryColor) {
      const leftPanel = document.querySelector('.login-left')
      if (leftPanel) {
        leftPanel.style.background = `linear-gradient(135deg, ${branding.primaryColor} 0%, ${darkenHex(branding.primaryColor, 0.3)} 100%)`
      }
    }
  } catch (err) {
    // Silent fail — show default branding
    console.warn('Could not load school branding:', err)
  }
}

/** Simple hex darken for the gradient */
function darkenHex(hex, factor) {
  const match = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!match) return hex
  const r = Math.round(parseInt(match[1], 16) * (1 - factor))
  const g = Math.round(parseInt(match[2], 16) * (1 - factor))
  const b = Math.round(parseInt(match[3], 16) * (1 - factor))
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

// ── DOM References ────────────────────────────────────────────────────────
const form       = document.getElementById('login-form')
const emailInput = document.getElementById('login-email')
const passInput  = document.getElementById('login-password')
const submitBtn  = document.getElementById('login-submit')
const authError  = document.getElementById('auth-error')

// ── Role Tabs ─────────────────────────────────────────────────────────────
const tabs = document.querySelectorAll('.login-tab')
const placeholders = { school: 'you@school.edu', parent: 'you@example.com' }

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => {
      t.classList.remove('active')
      t.setAttribute('aria-selected', 'false')
    })
    tab.classList.add('active')
    tab.setAttribute('aria-selected', 'true')
    const role = tab.dataset.role
    if (emailInput && placeholders[role]) {
      emailInput.placeholder = placeholders[role]
    }
  })
})

// ── Show / Hide Password ──────────────────────────────────────────────────
const showPassBtn = document.getElementById('show-pass-btn')
const eyeIcon     = document.getElementById('eye-icon')

const eyeOpen = `
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
`
const eyeClosed = `
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
`

if (showPassBtn && passInput && eyeIcon) {
  showPassBtn.addEventListener('click', () => {
    const isPassword = passInput.type === 'password'
    passInput.type = isPassword ? 'text' : 'password'
    eyeIcon.innerHTML = isPassword ? eyeClosed : eyeOpen
    showPassBtn.setAttribute('aria-pressed', String(isPassword))
    showPassBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password')
  })
}

// ── Error Display ─────────────────────────────────────────────────────────
const ERROR_MESSAGES = {
  'auth/user-not-found':          'No account found with this email address.',
  'auth/wrong-password':          'Incorrect password. Please try again.',
  'auth/invalid-credential':      'Invalid email or password. Please try again.',
  'auth/invalid-email':           'Please enter a valid email address.',
  'auth/too-many-requests':       'Too many attempts. Please wait a moment and try again.',
  'auth/user-disabled':           'This account has been disabled. Contact your school admin.',
  'auth/network-request-failed':  'Network error. Check your connection and try again.',
}

function showAuthError(errorCode) {
  const message = ERROR_MESSAGES[errorCode] || 'Something went wrong. Please try again.'
  authError.textContent = message
  authError.classList.add('visible')
}

function hideAuthError() {
  authError.classList.remove('visible')
  authError.textContent = ''
}

function setLoading(loading) {
  submitBtn.disabled = loading
  submitBtn.textContent = loading ? 'Signing in…' : 'Sign In →'
}

// ── Form Submit — Firebase Auth Login ─────────────────────────────────────
if (form && submitBtn) {
  // Clear error when user starts typing
  emailInput.addEventListener('input', hideAuthError)
  passInput.addEventListener('input', hideAuthError)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideAuthError()

    const email = emailInput.value.trim()
    const password = passInput.value

    if (!email) { showAuthError('auth/invalid-email'); return }
    if (!password) { showAuthError('auth/wrong-password'); return }

    setLoading(true)

    try {
      // 1. Sign in with Firebase Auth
      const { user } = await loginWithEmail(email, password)

      // 2. Fetch role from Firestore
      const role = await getUserRole(user.uid)

      // 3. Redirect to the correct dashboard
      const destination = ROLE_ROUTES[role]
      if (destination) {
        // Save credentials for biometric quick-login (native app only)
        if (isNative()) {
          try {
            localStorage.setItem('schoolos_last_email', email)
            localStorage.setItem('schoolos_last_pass', btoa(password))
            localStorage.setItem('schoolos_biometric_enabled', 'true')
          } catch { /* silent */ }
        }
        window.location.replace(destination)
      } else {
        // User has no role doc — likely a new account not set up yet
        showAuthError('no-role')
        authError.textContent = 'Your account is not set up yet. Please contact your school administrator.'
        setLoading(false)
      }
    } catch (err) {
      console.error('Login error:', err)
      showAuthError(err.code || 'unknown')
      setLoading(false)
    }
  })
}

// ── Biometric Quick Login (native app only) ───────────────────────────────
async function setupBiometricLogin() {
  if (!isNative()) return
  const savedEmail = localStorage.getItem('schoolos_last_email')
  const biometricEnabled = localStorage.getItem('schoolos_biometric_enabled') === 'true'
  if (!savedEmail || !biometricEnabled) return

  const available = await isBiometricAvailable()
  if (!available) return

  // Show biometric button
  const biometricBtn = document.createElement('button')
  biometricBtn.type = 'button'
  biometricBtn.className = 'btn btn-secondary btn-full btn-lg'
  biometricBtn.style.marginTop = '12px'
  biometricBtn.innerHTML = '&#128274; Unlock with Fingerprint'
  biometricBtn.addEventListener('click', async () => {
    const authenticated = await authenticateWithBiometric('Sign in to SchoolOS')
    if (!authenticated) return

    const savedPass = localStorage.getItem('schoolos_last_pass')
    if (!savedEmail || !savedPass) return

    setLoading(true)
    try {
      const { user } = await loginWithEmail(savedEmail, atob(savedPass))
      const role = await getUserRole(user.uid)
      const destination = ROLE_ROUTES[role]
      if (destination) window.location.replace(destination)
      else setLoading(false)
    } catch (err) {
      showAuthError(err.code || 'unknown')
      setLoading(false)
    }
  })

  // Insert after the sign-in button
  submitBtn?.parentElement?.appendChild(biometricBtn)
}

guardResult.then(() => setupBiometricLogin())
