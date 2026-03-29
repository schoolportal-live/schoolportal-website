/**
 * SchoolPortal — Password Reset Page JS
 */
import { sendPasswordReset } from './firebase/auth.js'

const form        = document.getElementById('reset-form')
const emailInput  = document.getElementById('reset-email')
const submitBtn   = document.getElementById('reset-submit')
const authError   = document.getElementById('auth-error')
const success     = document.getElementById('reset-success')
const emailDisplay = document.getElementById('reset-email-display')

const ERROR_MESSAGES = {
  'auth/user-not-found':          'No account found with this email address.',
  'auth/invalid-email':           'Please enter a valid email address.',
  'auth/too-many-requests':       'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed':  'Network error. Check your connection and try again.',
}

function showError(code) {
  const msg = ERROR_MESSAGES[code] || 'Something went wrong. Please try again.'
  authError.textContent = msg
  authError.classList.add('visible')
}

function hideError() {
  authError.classList.remove('visible')
  authError.textContent = ''
}

if (form) {
  emailInput.addEventListener('input', hideError)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError()

    const email = emailInput.value.trim()
    if (!email) { showError('auth/invalid-email'); return }

    submitBtn.disabled = true
    submitBtn.textContent = 'Sending…'

    try {
      await sendPasswordReset(email)
      // Show success state
      form.style.display = 'none'
      emailDisplay.textContent = email
      success.style.display = 'flex'
    } catch (err) {
      console.error('Password reset error:', err)
      showError(err.code || 'unknown')
      submitBtn.disabled = false
      submitBtn.textContent = 'Send Reset Link →'
    }
  })
}
