/**
 * SchoolPortal — Landing Page JS
 * Handles: mobile nav, Netlify form submissions, smooth scroll
 */

// ── Mobile Nav ─────────────────────────────────────────────────────────────
const hamburger = document.getElementById('nav-hamburger')
const navLinks  = document.getElementById('nav-links')

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open')
    hamburger.setAttribute('aria-expanded', String(isOpen))
  })

  // Close nav when a link is clicked
  navLinks.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      navLinks.classList.remove('open')
      hamburger.setAttribute('aria-expanded', 'false')
    }
  })

  // Close nav on outside click
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
      navLinks.classList.remove('open')
      hamburger.setAttribute('aria-expanded', 'false')
    }
  })
}

// ── Smooth Scroll ──────────────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const id = anchor.getAttribute('href')
    if (id === '#') return
    const target = document.querySelector(id)
    if (target) {
      e.preventDefault()
      const navHeight = document.querySelector('.nav')?.offsetHeight ?? 0
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 12
      window.scrollTo({ top, behavior: 'smooth' })
    }
  })
})

// ── Form Helpers ───────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function showError(inputEl, errorId, message) {
  const err = document.getElementById(errorId)
  if (!err) return
  err.textContent = message
  err.classList.add('visible')
  inputEl.setAttribute('aria-invalid', 'true')
  inputEl.setAttribute('aria-describedby', errorId)
}

function clearError(inputEl, errorId) {
  const err = document.getElementById(errorId)
  if (!err) return
  err.classList.remove('visible')
  inputEl.removeAttribute('aria-invalid')
  inputEl.removeAttribute('aria-describedby')
}

function setLoading(btn, loading) {
  btn.disabled = loading
  btn.dataset.originalText = btn.dataset.originalText ?? btn.textContent
  btn.textContent = loading ? 'Sending…' : btn.dataset.originalText
}

// ── Netlify Form Submission ─────────────────────────────────────────────────
// Netlify Forms require:
//   1. data-netlify="true" on the <form> element (static HTML, already present)
//   2. Content-Type: application/x-www-form-urlencoded (NOT JSON)
//   3. form-name hidden field matching the form's name attribute

async function submitToNetlify(form) {
  const data = new FormData(form)
  const body = new URLSearchParams(data).toString()
  const res = await fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Server responded ${res.status}`)
}

function showSuccess(formEl, successId) {
  formEl.closest('form').style.display = 'none'
  const success = document.getElementById(successId)
  if (success) success.classList.add('visible')
}

// ── Demo Booking Form ──────────────────────────────────────────────────────
const demoForm   = document.getElementById('demo-form')
const demoSubmit = document.getElementById('demo-submit')

if (demoForm && demoSubmit) {
  // Live validation: clear errors on input
  demoForm.querySelector('#demo-name').addEventListener('input', (e) => clearError(e.target, 'demo-name-err'))
  demoForm.querySelector('#demo-school').addEventListener('input', (e) => clearError(e.target, 'demo-school-err'))
  demoForm.querySelector('#demo-email').addEventListener('input', (e) => clearError(e.target, 'demo-email-err'))

  demoForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    let valid = true

    const name   = demoForm.querySelector('#demo-name')
    const school = demoForm.querySelector('#demo-school')
    const email  = demoForm.querySelector('#demo-email')

    if (!name.value.trim()) {
      showError(name, 'demo-name-err', 'Please enter your name.')
      valid = false
    } else clearError(name, 'demo-name-err')

    if (!school.value.trim()) {
      showError(school, 'demo-school-err', 'Please enter your school name.')
      valid = false
    } else clearError(school, 'demo-school-err')

    if (!email.value.trim() || !EMAIL_RE.test(email.value.trim())) {
      showError(email, 'demo-email-err', 'Please enter a valid email address.')
      valid = false
    } else clearError(email, 'demo-email-err')

    if (!valid) return

    setLoading(demoSubmit, true)
    try {
      await submitToNetlify(demoForm)
      showSuccess(demoForm, 'demo-success')
    } catch {
      setLoading(demoSubmit, false)
      alert('Something went wrong. Please try again or email us directly at founders.space.ai@gmail.com')
    }
  })
}

// ── Contact Form ───────────────────────────────────────────────────────────
const contactForm   = document.getElementById('contact-form')
const contactSubmit = document.getElementById('contact-submit')

if (contactForm && contactSubmit) {
  contactForm.querySelector('#contact-name').addEventListener('input', (e) => clearError(e.target, 'contact-name-err'))
  contactForm.querySelector('#contact-email').addEventListener('input', (e) => clearError(e.target, 'contact-email-err'))
  contactForm.querySelector('#contact-message').addEventListener('input', (e) => clearError(e.target, 'contact-message-err'))

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    let valid = true

    const name    = contactForm.querySelector('#contact-name')
    const email   = contactForm.querySelector('#contact-email')
    const message = contactForm.querySelector('#contact-message')

    if (!name.value.trim()) {
      showError(name, 'contact-name-err', 'Please enter your name.')
      valid = false
    } else clearError(name, 'contact-name-err')

    if (!email.value.trim() || !EMAIL_RE.test(email.value.trim())) {
      showError(email, 'contact-email-err', 'Please enter a valid email address.')
      valid = false
    } else clearError(email, 'contact-email-err')

    if (!message.value.trim()) {
      showError(message, 'contact-message-err', 'Please enter a message.')
      valid = false
    } else clearError(message, 'contact-message-err')

    if (!valid) return

    setLoading(contactSubmit, true)
    try {
      await submitToNetlify(contactForm)
      showSuccess(contactForm, 'contact-success')
    } catch {
      setLoading(contactSubmit, false)
      alert('Something went wrong. Please try again or email us directly at founders.space.ai@gmail.com')
    }
  })
}
