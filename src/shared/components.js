/**
 * SchoolOS — Shared UI Components
 *
 * Reusable rendering helpers, formatters, and DOM utilities.
 * Used by all dashboard pages to maintain consistent UI patterns.
 */

// ── HTML Escaping ──────────────────────────────────────────────────────────

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escape HTML entities to prevent XSS via innerHTML */
export function esc(str) {
  if (str == null) return ''
  return String(str).replace(/[&<>"']/g, c => ESC_MAP[c])
}

// ── Date Formatting ────────────────────────────────────────────────────────

/**
 * Format a Firestore timestamp or ISO string to a readable date.
 * @param {Object|string|Date} ts — Firestore Timestamp, Date, or ISO string
 * @param {Object} opts — Intl.DateTimeFormat options
 * @returns {string}
 */
export function formatDate(ts, opts = {}) {
  if (!ts) return '—'
  let date
  if (ts.toDate) date = ts.toDate()           // Firestore Timestamp
  else if (ts instanceof Date) date = ts
  else date = new Date(ts)                     // ISO string or epoch
  if (isNaN(date.getTime())) return '—'
  const defaults = { day: 'numeric', month: 'short', year: 'numeric' }
  return date.toLocaleDateString('en-GB', { ...defaults, ...opts })
}

/**
 * Format to a short date + time string.
 */
export function formatDateTime(ts) {
  return formatDate(ts, { hour: '2-digit', minute: '2-digit', hour12: true })
}

/**
 * Relative time description ("2 hours ago", "3 days ago").
 */
export function timeAgo(ts) {
  if (!ts) return '—'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return formatDate(ts)
}

// ── Tab Navigation ─────────────────────────────────────────────────────────

/**
 * Initialize tab navigation for a dashboard page.
 * Expects buttons with class .dash-tab and [data-tab], and
 * content divs with id="tab-{name}" and class .dash-tab-content.
 *
 * @param {Object} opts
 * @param {Function} opts.onTabChange — callback(tabName) when tab switches
 * @param {string[]} opts.enabledModules — only show tabs for enabled modules
 */
export function initTabs({ onTabChange, enabledModules } = {}) {
  const tabs = document.querySelectorAll('.dash-tab')
  const tabContents = document.querySelectorAll('.dash-tab-content')

  // Hide tabs for disabled modules
  if (enabledModules) {
    tabs.forEach(tab => {
      const module = tab.dataset.module
      if (module && !enabledModules.includes(module)) {
        tab.style.display = 'none'
        const content = document.getElementById(`tab-${tab.dataset.tab}`)
        if (content) content.style.display = 'none'
      }
    })
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab
      tabs.forEach(t => t.classList.remove('active'))
      tabContents.forEach(c => c.classList.remove('active'))
      tab.classList.add('active')
      const content = document.getElementById(`tab-${target}`)
      if (content) content.classList.add('active')
      if (onTabChange) onTabChange(target)
    })
  })
}

// ── List Rendering ─────────────────────────────────────────────────────────

/**
 * Render a list of items into a container using a template function.
 *
 * @param {string} containerId — DOM element ID
 * @param {Array} items — data array
 * @param {Function} templateFn — (item) => HTML string
 * @param {string} emptyMessage — shown when items is empty
 */
export function renderList(containerId, items, templateFn, emptyMessage = 'No items found.') {
  const el = document.getElementById(containerId)
  if (!el) return
  if (!items || items.length === 0) {
    el.innerHTML = `<p class="dash-empty">${esc(emptyMessage)}</p>`
    return
  }
  el.innerHTML = items.map(templateFn).join('')
}

// ── Table Rendering ────────────────────────────────────────────────────────

/**
 * Render a data table.
 *
 * @param {string} containerId — DOM element ID
 * @param {Object} opts
 * @param {string[]} opts.columns — column headers
 * @param {Array} opts.rows — data rows
 * @param {Function} opts.rowFn — (item) => array of cell HTML strings
 * @param {string} opts.emptyMessage
 */
export function renderTable(containerId, { columns, rows, rowFn, emptyMessage = 'No data.' }) {
  const el = document.getElementById(containerId)
  if (!el) return
  if (!rows || rows.length === 0) {
    el.innerHTML = `<p class="dash-empty">${esc(emptyMessage)}</p>`
    return
  }
  const thead = `<thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${rows.map(r => {
    const cells = rowFn(r)
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`
  }).join('')}</tbody>`
  el.innerHTML = `<table class="dash-table">${thead}${tbody}</table>`
}

// ── Toast Notifications ────────────────────────────────────────────────────

let toastContainer = null

function getToastContainer() {
  if (toastContainer) return toastContainer
  toastContainer = document.createElement('div')
  toastContainer.className = 'toast-container'
  document.body.appendChild(toastContainer)
  return toastContainer
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration — ms before auto-dismiss
 */
export function toast(message, type = 'info', duration = 4000) {
  const container = getToastContainer()
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.textContent = message
  container.appendChild(el)
  // Trigger animation
  requestAnimationFrame(() => el.classList.add('toast-visible'))
  setTimeout(() => {
    el.classList.remove('toast-visible')
    el.addEventListener('transitionend', () => el.remove())
  }, duration)
}

// ── Confirm Modal ──────────────────────────────────────────────────────────

/**
 * Show a confirmation dialog. Returns a Promise<boolean>.
 * @param {string} title
 * @param {string} message
 * @param {string} confirmLabel — text for the confirm button
 * @param {'danger'|'primary'} confirmType
 */
export function confirm(title, message, confirmLabel = 'Confirm', confirmType = 'danger') {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay modal-visible'
    overlay.innerHTML = `
      <div class="modal-box">
        <h3 class="modal-title">${esc(title)}</h3>
        <p class="modal-message">${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary modal-cancel">Cancel</button>
          <button class="btn btn-${confirmType} modal-confirm">${esc(confirmLabel)}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const cleanup = (result) => { overlay.remove(); resolve(result) }
    overlay.querySelector('.modal-cancel').addEventListener('click', () => cleanup(false))
    overlay.querySelector('.modal-confirm').addEventListener('click', () => cleanup(true))
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false) })
  })
}

// ── Form Status Messages ───────────────────────────────────────────────────

/**
 * Show a status message in a form's status element.
 * @param {string} elementId — ID of the status element
 * @param {string} message
 * @param {'sending'|'success'|'error'} type
 */
export function formStatus(elementId, message, type = 'sending') {
  const el = document.getElementById(elementId)
  if (!el) return
  el.textContent = message
  el.className = `dash-form-status status-${type}`
}

/**
 * Clear a form status message.
 */
export function clearFormStatus(elementId) {
  const el = document.getElementById(elementId)
  if (!el) return
  el.textContent = ''
  el.className = 'dash-form-status'
}

// ── Badge Rendering ────────────────────────────────────────────────────────

/**
 * Render a status badge.
 * @param {string} status — e.g. 'pending', 'approved', 'denied'
 * @returns {string} HTML string
 */
export function statusBadge(status) {
  const labels = {
    pending: 'Pending', acknowledged: 'Acknowledged', in_progress: 'In Review',
    approved: 'Approved', denied: 'Denied', escalated: 'Escalated',
    resolved: 'Resolved', paid: 'Paid', unpaid: 'Unpaid', partial: 'Partial',
    overdue: 'Overdue', present: 'Present', absent: 'Absent', late: 'Late',
    assigned: 'Assigned', completed: 'Completed', incomplete: 'Incomplete',
    not_completed: 'Not Done',
  }
  const label = labels[status] || status
  return `<span class="dash-status-badge status-${status}">${esc(label)}</span>`
}

// ── Priority Badge ─────────────────────────────────────────────────────────

export function priorityBadge(priority) {
  return `<span class="dash-priority-badge priority-${priority}">${esc(priority)}</span>`
}

// ── Word Count Enforcer ────────────────────────────────────────────────────

/**
 * Attach a word-count enforcer to a textarea.
 * @param {string} textareaId
 * @param {number} maxWords
 * @param {string} counterId — ID of the counter display element
 */
export function enforceWordLimit(textareaId, maxWords, counterId) {
  const textarea = document.getElementById(textareaId)
  const counter = document.getElementById(counterId)
  if (!textarea) return

  const update = () => {
    const words = textarea.value.trim().split(/\s+/).filter(Boolean)
    const count = words.length
    if (counter) counter.textContent = `${count}/${maxWords} words`
    if (count > maxWords) {
      textarea.value = words.slice(0, maxWords).join(' ')
      if (counter) counter.textContent = `${maxWords}/${maxWords} words`
    }
  }

  textarea.addEventListener('input', update)
  update()
}

// ── Header Setup ───────────────────────────────────────────────────────────

/**
 * Set up the dashboard header with user info and logout.
 * @param {Object} user — Firebase Auth user
 * @param {Function} logoutFn — logout function
 */
export function setupHeader(user, logoutFn) {
  const displayName = user.displayName || user.email.split('@')[0]
  const nameEl = document.getElementById('user-name')
  const welcomeEl = document.getElementById('welcome-name')
  if (nameEl) nameEl.textContent = displayName
  if (welcomeEl) welcomeEl.textContent = displayName

  const logoutBtn = document.getElementById('logout-btn')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutFn()
      window.location.replace('/login.html')
    })
  }
}
