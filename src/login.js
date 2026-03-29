/**
 * SchoolPortal — Login Page JS
 * Handles: role tab switching, show/hide password
 * Note: No auth logic yet — UI only.
 */

// ── Role Tabs ──────────────────────────────────────────────────────────────
const tabs        = document.querySelectorAll('.login-tab')
const emailInput  = document.getElementById('login-email')

const placeholders = {
  school: 'you@school.edu',
  parent: 'you@example.com',
}

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

// ── Show / Hide Password ───────────────────────────────────────────────────
const showPassBtn = document.getElementById('show-pass-btn')
const passwordInput = document.getElementById('login-password')
const eyeIcon = document.getElementById('eye-icon')

const eyeOpen = `
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
`
const eyeClosed = `
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
`

if (showPassBtn && passwordInput && eyeIcon) {
  showPassBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password'
    passwordInput.type = isPassword ? 'text' : 'password'
    eyeIcon.innerHTML = isPassword ? eyeClosed : eyeOpen
    showPassBtn.setAttribute('aria-pressed', String(isPassword))
    showPassBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password')
  })
}

// ── Form Submit (UI feedback only) ─────────────────────────────────────────
const loginForm   = document.getElementById('login-form')
const loginSubmit = document.getElementById('login-submit')
const loginNotice = document.getElementById('login-inline-notice')

if (loginForm && loginSubmit) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault()
    loginSubmit.disabled = true
    loginSubmit.textContent = 'Signing in…'

    // Simulate — replace with real auth endpoint when ready
    setTimeout(() => {
      loginSubmit.disabled = false
      loginSubmit.textContent = 'Sign In →'
      if (loginNotice) {
        loginNotice.classList.add('visible')
        loginNotice.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 1200)
  })
}
