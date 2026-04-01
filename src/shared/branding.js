/**
 * SchoolOS — Branding Engine
 *
 * Applies per-school branding (logo, name, colors) to the page.
 * Called after auth guard resolves and school document is fetched.
 *
 * Each school document has:
 *   branding: {
 *     logo: "<url>",
 *     schoolName: "Greenfield Academy",
 *     primaryColor: "#2563eb",
 *     secondaryColor: "#16a34a",
 *     accentColor: "#f59e0b"
 *   }
 */

/** Default brand colors (fallback if school has no branding set) */
const DEFAULTS = {
  primaryColor: '#2563eb',
  secondaryColor: '#16a34a',
  accentColor: '#f59e0b',
}

/**
 * Apply school branding to the current page.
 *
 * @param {Object} branding — the school.branding object from Firestore
 * @param {Object} opts
 * @param {boolean} opts.applyColors — apply CSS custom properties (default true)
 * @param {boolean} opts.applyLogo — update logo element (default true)
 * @param {boolean} opts.applyName — update school name elements (default true)
 */
export function applyBranding(branding, { applyColors = true, applyLogo = true, applyName = true } = {}) {
  if (!branding) return

  const root = document.documentElement

  // ── Colors ─────────────────────────────────────────────────────────
  if (applyColors) {
    const primary = branding.primaryColor || DEFAULTS.primaryColor
    const secondary = branding.secondaryColor || DEFAULTS.secondaryColor
    const accent = branding.accentColor || DEFAULTS.accentColor

    root.style.setProperty('--brand-primary', primary)
    root.style.setProperty('--brand-secondary', secondary)
    root.style.setProperty('--brand-accent', accent)

    // Generate lighter/darker variants for hover states and backgrounds
    root.style.setProperty('--brand-primary-light', lighten(primary, 0.9))
    root.style.setProperty('--brand-primary-dark', darken(primary, 0.15))
    root.style.setProperty('--brand-secondary-light', lighten(secondary, 0.9))
    root.style.setProperty('--brand-accent-light', lighten(accent, 0.9))
  }

  // ── Logo ───────────────────────────────────────────────────────────
  if (applyLogo && branding.logo) {
    const logoEls = document.querySelectorAll('[data-brand-logo]')
    logoEls.forEach(el => {
      if (el.tagName === 'IMG') {
        el.src = branding.logo
        el.alt = branding.schoolName || 'School Logo'
      } else {
        el.style.backgroundImage = `url(${branding.logo})`
      }
    })
  }

  // ── School Name ────────────────────────────────────────────────────
  if (applyName && branding.schoolName) {
    const nameEls = document.querySelectorAll('[data-brand-name]')
    nameEls.forEach(el => { el.textContent = branding.schoolName })

    // Update page title
    document.title = `${branding.schoolName} — SchoolOS`
  }
}

/**
 * Get CSS variable values for use in JS (e.g., chart colors).
 */
export function getBrandColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    primary: style.getPropertyValue('--brand-primary').trim() || DEFAULTS.primaryColor,
    secondary: style.getPropertyValue('--brand-secondary').trim() || DEFAULTS.secondaryColor,
    accent: style.getPropertyValue('--brand-accent').trim() || DEFAULTS.accentColor,
  }
}

// ── Color Utilities ────────────────────────────────────────────────────────

/** Lighten a hex color by mixing with white. factor 0-1 (0 = no change, 1 = white) */
function lighten(hex, factor) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.round(rgb.r + (255 - rgb.r) * factor)
  const g = Math.round(rgb.g + (255 - rgb.g) * factor)
  const b = Math.round(rgb.b + (255 - rgb.b) * factor)
  return rgbToHex(r, g, b)
}

/** Darken a hex color by mixing with black. factor 0-1 (0 = no change, 1 = black) */
function darken(hex, factor) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.round(rgb.r * (1 - factor))
  const g = Math.round(rgb.g * (1 - factor))
  const b = Math.round(rgb.b * (1 - factor))
  return rgbToHex(r, g, b)
}

function hexToRgb(hex) {
  const match = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!match) return null
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}
