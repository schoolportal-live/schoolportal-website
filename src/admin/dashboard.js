/**
 * SchoolPortal — Admin Dashboard JS
 * Protected page: requires auth + school_admin role
 *
 * Features:
 *   1. Send notices / announcements
 *   2. View form submissions
 *   3. Manage parents (list, add, remove)
 *   4. Live stats from Firestore
 */
import { initGuard } from '../firebase/guard.js'
import { logout, registerWithEmail, setDisplayName } from '../firebase/auth.js'
import {
  getUserDoc,
  createNotice, getNotices, deleteNotice,
  getParentsBySchool, getSchoolStats,
  createUserDoc,
  getSubmissions,
  getSchoolParentForms, updateParentFormStatus,
  getSchoolMessages, markMessageRead,
  createEvent, getEvents, deleteEvent,
} from '../firebase/firestore.js'

// ── Auth Guard ───────────────────────────────────────────────────────────
const { user } = await initGuard({
  requireAuth: true,
  requiredRole: 'school_admin',
})

const userDoc = await getUserDoc(user.uid)
const schoolId = userDoc?.schoolId || 'greenfield-academy'
const displayName = user.displayName || user.email.split('@')[0]

// ── Populate Header ──────────────────────────────────────────────────────
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName

// ── Logout ───────────────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ══════════════════════════════════════════════════════════════════════════
//   TAB NAVIGATION
// ══════════════════════════════════════════════════════════════════════════
const tabs = document.querySelectorAll('.dash-tab')
const tabContents = document.querySelectorAll('.dash-tab-content')

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab
    tabs.forEach(t => t.classList.remove('active'))
    tabContents.forEach(c => c.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById(`tab-${target}`).classList.add('active')
  })
})

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 1: NOTICES
// ══════════════════════════════════════════════════════════════════════════
const noticeForm = document.getElementById('notice-form')
const noticeStatus = document.getElementById('notice-status')
const noticeSubmitBtn = document.getElementById('notice-submit-btn')
const noticesList = document.getElementById('notices-list')

// Send notice
noticeForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const title = document.getElementById('notice-title').value.trim()
  const body = document.getElementById('notice-body').value.trim()
  const priority = document.getElementById('notice-priority').value
  if (!title || !body) return

  noticeSubmitBtn.disabled = true
  noticeStatus.textContent = 'Sending...'
  noticeStatus.className = 'dash-form-status sending'

  try {
    await createNotice({
      title,
      body,
      priority,
      authorId: user.uid,
      authorName: displayName,
      schoolId,
    })
    noticeForm.reset()
    noticeStatus.textContent = 'Notice sent!'
    noticeStatus.className = 'dash-form-status success'
    await loadNotices()
    await loadStats()
    setTimeout(() => { noticeStatus.textContent = ''; noticeStatus.className = 'dash-form-status'; }, 3000)
  } catch (err) {
    console.error('Failed to send notice:', err)
    noticeStatus.textContent = 'Failed to send. Try again.'
    noticeStatus.className = 'dash-form-status error'
  } finally {
    noticeSubmitBtn.disabled = false
  }
})

async function loadNotices() {
  try {
    const notices = await getNotices(schoolId)
    if (notices.length === 0) {
      noticesList.innerHTML = '<div class="dash-list-empty"><p>No notices sent yet. Use the form above to send your first announcement.</p></div>'
      return
    }
    noticesList.innerHTML = notices.map(n => {
      const date = n.createdAt?.toDate?.() ? n.createdAt.toDate() : new Date()
      const priorityClass = n.priority === 'urgent' ? 'priority-urgent' : n.priority === 'important' ? 'priority-important' : ''
      return `
        <div class="dash-list-item ${priorityClass}">
          <div class="dash-list-item-main">
            <div class="dash-list-item-header">
              <h4>${escHtml(n.title)}</h4>
              ${n.priority !== 'normal' ? `<span class="dash-priority-badge ${n.priority}">${n.priority}</span>` : ''}
            </div>
            <p class="dash-list-item-body">${escHtml(n.body)}</p>
            <span class="dash-list-item-meta">Sent by ${escHtml(n.authorName)} on ${formatDate(date)}</span>
          </div>
          <button class="btn-icon danger" data-delete-notice="${n.id}" title="Delete notice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>`
    }).join('')

    // Delete handlers
    noticesList.querySelectorAll('[data-delete-notice]').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirmModal('Delete Notice', 'Are you sure you want to delete this notice? Parents will no longer see it.', async () => {
          await deleteNotice(btn.dataset.deleteNotice)
          await loadNotices()
          await loadStats()
        })
      })
    })
  } catch (err) {
    console.error('Failed to load notices:', err)
    noticesList.innerHTML = '<div class="dash-list-empty"><p>Failed to load notices.</p></div>'
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 2: MANAGE PARENTS
// ══════════════════════════════════════════════════════════════════════════
const parentsList = document.getElementById('parents-list')
const addParentBtn = document.getElementById('add-parent-btn')
const addParentFormWrap = document.getElementById('add-parent-form')
const parentForm = document.getElementById('parent-form')
const parentStatus = document.getElementById('parent-status')
const parentSubmitBtn = document.getElementById('parent-submit-btn')
const cancelParentBtn = document.getElementById('cancel-parent-btn')

addParentBtn.addEventListener('click', () => {
  addParentFormWrap.classList.toggle('hidden')
})
cancelParentBtn.addEventListener('click', () => {
  addParentFormWrap.classList.add('hidden')
  parentForm.reset()
  parentStatus.textContent = ''
})

parentForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = document.getElementById('parent-name').value.trim()
  const email = document.getElementById('parent-email').value.trim()
  const password = document.getElementById('parent-password').value
  if (!name || !email || password.length < 6) return

  parentSubmitBtn.disabled = true
  parentStatus.textContent = 'Creating account...'
  parentStatus.className = 'dash-form-status sending'

  try {
    // Use Firebase REST API to create user without signing out current admin
    const apiKey = 'AIzaSyA20MPMaSjsJt8qB-FsEXXP07d2Vn9d7BM'
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      }
    )
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)

    // Create Firestore user doc
    await createUserDoc(data.localId, {
      role: 'parent',
      email,
      displayName: name,
      schoolId,
    })

    parentForm.reset()
    addParentFormWrap.classList.add('hidden')
    parentStatus.textContent = 'Parent added!'
    parentStatus.className = 'dash-form-status success'
    await loadParents()
    await loadStats()
    setTimeout(() => { parentStatus.textContent = ''; }, 3000)
  } catch (err) {
    console.error('Failed to add parent:', err)
    const msg = err.message === 'EMAIL_EXISTS'
      ? 'A user with that email already exists.'
      : 'Failed to create parent. Try again.'
    parentStatus.textContent = msg
    parentStatus.className = 'dash-form-status error'
  } finally {
    parentSubmitBtn.disabled = false
  }
})

async function loadParents() {
  try {
    const parents = await getParentsBySchool(schoolId)
    if (parents.length === 0) {
      parentsList.innerHTML = '<div class="dash-list-empty"><p>No parents registered yet. Use the "Add Parent" button above.</p></div>'
      return
    }
    parentsList.innerHTML = parents.map(p => {
      const joined = p.createdAt?.toDate?.() ? formatDate(p.createdAt.toDate()) : 'Unknown'
      return `
        <div class="dash-list-item">
          <div class="dash-list-item-main">
            <div class="dash-list-item-header">
              <h4>${escHtml(p.displayName)}</h4>
            </div>
            <span class="dash-list-item-meta">${escHtml(p.email)} &middot; Joined ${joined}</span>
          </div>
          <button class="btn-icon danger" data-delete-parent="${p.id}" data-parent-name="${escHtml(p.displayName)}" title="Remove parent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>`
    }).join('')

    // Note: Delete from Firestore only (can't delete Auth user from client SDK)
    parentsList.querySelectorAll('[data-delete-parent]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.parentName
        showConfirmModal('Remove Parent', `Remove "${name}" from the school? They won't be able to log in anymore.`, async () => {
          const { deleteDoc, doc } = await import('firebase/firestore')
          const { db } = await import('../firebase/config.js')
          await deleteDoc(doc(db, 'users', btn.dataset.deleteParent))
          await loadParents()
          await loadStats()
        })
      })
    })
  } catch (err) {
    console.error('Failed to load parents:', err)
    parentsList.innerHTML = '<div class="dash-list-empty"><p>Failed to load parents.</p></div>'
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 3: SUBMISSIONS
// ══════════════════════════════════════════════════════════════════════════
const submissionsList = document.getElementById('submissions-list')
const filterBtns = document.querySelectorAll('[data-filter]')
let allSubmissions = []
let currentFilter = 'all'

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    currentFilter = btn.dataset.filter
    renderSubmissions()
  })
})

async function loadSubmissions() {
  try {
    const [demos, contacts] = await Promise.all([
      getSubmissions('demo-booking'),
      getSubmissions('contact'),
    ])
    allSubmissions = [...demos, ...contacts].sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0)
      const bTime = b.createdAt?.toDate?.() || new Date(0)
      return bTime - aTime
    })
    renderSubmissions()
    document.getElementById('stat-submissions').textContent = allSubmissions.length
  } catch (err) {
    console.error('Failed to load submissions:', err)
    submissionsList.innerHTML = '<div class="dash-list-empty"><p>Failed to load submissions.</p></div>'
  }
}

function renderSubmissions() {
  const filtered = currentFilter === 'all'
    ? allSubmissions
    : allSubmissions.filter(s => s.formType === currentFilter)

  if (filtered.length === 0) {
    submissionsList.innerHTML = '<div class="dash-list-empty"><p>No submissions found.</p></div>'
    return
  }

  submissionsList.innerHTML = filtered.map(s => {
    const date = s.createdAt?.toDate?.() ? formatDate(s.createdAt.toDate()) : 'Unknown'
    const typeLabel = s.formType === 'demo-booking' ? 'Demo Booking' : 'Contact Message'
    const typeBadge = s.formType === 'demo-booking' ? 'blue' : 'green'
    const d = s.data || {}

    let details = ''
    if (s.formType === 'demo-booking') {
      details = `
        <span><strong>Name:</strong> ${escHtml(d.name || d.firstName || '')} ${escHtml(d.lastName || '')}</span>
        <span><strong>Email:</strong> ${escHtml(d.email || '')}</span>
        <span><strong>School:</strong> ${escHtml(d.schoolName || d.school || '')}</span>
        <span><strong>Role:</strong> ${escHtml(d.role || '')}</span>`
    } else {
      details = `
        <span><strong>Name:</strong> ${escHtml(d.name || d.firstName || '')} ${escHtml(d.lastName || '')}</span>
        <span><strong>Email:</strong> ${escHtml(d.email || '')}</span>
        ${d.message ? `<span><strong>Message:</strong> ${escHtml(d.message)}</span>` : ''}`
    }

    return `
      <div class="dash-list-item">
        <div class="dash-list-item-main">
          <div class="dash-list-item-header">
            <h4>${escHtml(d.name || d.firstName || d.email || 'Unknown')}</h4>
            <span class="dash-type-badge ${typeBadge}">${typeLabel}</span>
          </div>
          <div class="dash-submission-details">${details}</div>
          <span class="dash-list-item-meta">${date}</span>
        </div>
      </div>`
  }).join('')
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 4: STATS
// ══════════════════════════════════════════════════════════════════════════
async function loadStats() {
  try {
    const stats = await getSchoolStats(schoolId)
    document.getElementById('stat-parents').textContent = stats.parentCount
    document.getElementById('stat-notices').textContent = stats.noticeCount
  } catch (err) {
    console.error('Failed to load stats:', err)
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   CONFIRM MODAL
// ══════════════════════════════════════════════════════════════════════════
let modalCallback = null
const modal = document.getElementById('confirm-modal')
const modalConfirmBtn = document.getElementById('modal-confirm')
const modalCancelBtn = document.getElementById('modal-cancel')

function showConfirmModal(title, message, onConfirm) {
  document.getElementById('modal-title').textContent = title
  document.getElementById('modal-message').textContent = message
  modalCallback = onConfirm
  modal.classList.remove('hidden')
}

modalCancelBtn.addEventListener('click', () => {
  modal.classList.add('hidden')
  modalCallback = null
})

modalConfirmBtn.addEventListener('click', async () => {
  modal.classList.add('hidden')
  if (modalCallback) {
    modalConfirmBtn.disabled = true
    try { await modalCallback() } catch (e) { console.error(e) }
    modalConfirmBtn.disabled = false
    modalCallback = null
  }
})

// Close modal on overlay click
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.add('hidden')
    modalCallback = null
  }
})

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 5: PARENT FORMS (Absence / Permission)
// ══════════════════════════════════════════════════════════════════════════
const parentFormsList = document.getElementById('parent-forms-list')
const pfFilterBtns = document.querySelectorAll('[data-pf-filter]')
let allParentForms = []
let currentPfFilter = 'all'

pfFilterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    pfFilterBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    currentPfFilter = btn.dataset.pfFilter
    renderParentForms()
  })
})

async function loadParentForms() {
  try {
    allParentForms = await getSchoolParentForms(schoolId)
    renderParentForms()
  } catch (err) {
    console.error('Failed to load parent forms:', err)
    parentFormsList.innerHTML = '<div class="dash-list-empty"><p>Failed to load parent forms.</p></div>'
  }
}

function renderParentForms() {
  const filtered = currentPfFilter === 'all'
    ? allParentForms
    : allParentForms.filter(f => f.formType === currentPfFilter)

  if (filtered.length === 0) {
    parentFormsList.innerHTML = '<div class="dash-list-empty"><p>No parent forms received yet.</p></div>'
    return
  }

  parentFormsList.innerHTML = filtered.map(f => {
    const date = f.createdAt?.toDate?.() ? formatDate(f.createdAt.toDate()) : 'Unknown'
    const typeLabel = f.formType === 'absence' ? 'Absence' : 'Permission'
    const typeBadge = f.formType === 'absence' ? 'blue' : 'green'
    const statusBadge = f.status === 'pending' ? 'status-pending'
      : f.status === 'acknowledged' ? 'status-ack' : 'status-approved'
    const d = f.data || {}
    const detail = f.formType === 'absence'
      ? `${escHtml(d.dateFrom)} to ${escHtml(d.dateTo)} — ${escHtml(d.reason)}`
      : `${escHtml(d.permissionType)} on ${escHtml(d.date)} — ${escHtml(d.details)}`

    return `
      <div class="dash-list-item">
        <div class="dash-list-item-main">
          <div class="dash-list-item-header">
            <h4>${escHtml(f.parentName)} — ${escHtml(d.childName || '')}</h4>
            <span class="dash-type-badge ${typeBadge}">${typeLabel}</span>
            <span class="dash-status-badge ${statusBadge}">${f.status}</span>
          </div>
          <p class="dash-list-item-body">${detail}</p>
          <span class="dash-list-item-meta">${date}</span>
        </div>
        ${f.status === 'pending' ? `
          <button class="btn btn-primary btn-sm" data-ack-form="${f.id}" title="Acknowledge">Acknowledge</button>
        ` : ''}
      </div>`
  }).join('')

  // Acknowledge handlers
  parentFormsList.querySelectorAll('[data-ack-form]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true
      btn.textContent = '...'
      await updateParentFormStatus(btn.dataset.ackForm, 'acknowledged')
      await loadParentForms()
    })
  })
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 6: MESSAGES FROM PARENTS
// ══════════════════════════════════════════════════════════════════════════
const adminMessagesList = document.getElementById('admin-messages-list')

async function loadAdminMessages() {
  try {
    const msgs = await getSchoolMessages(schoolId)
    if (msgs.length === 0) {
      adminMessagesList.innerHTML = '<div class="dash-list-empty"><p>No messages received from parents yet.</p></div>'
      return
    }
    adminMessagesList.innerHTML = msgs.map(m => {
      const date = m.createdAt?.toDate?.() ? formatDate(m.createdAt.toDate()) : 'Unknown'
      return `
        <div class="dash-list-item ${m.read ? '' : 'priority-important'}">
          <div class="dash-list-item-main">
            <div class="dash-list-item-header">
              <h4>${escHtml(m.subject)}</h4>
              <span class="dash-type-badge ${m.read ? 'green' : 'blue'}">${m.read ? 'Read' : 'New'}</span>
            </div>
            <p class="dash-list-item-body">${escHtml(m.body)}</p>
            <span class="dash-list-item-meta">From ${escHtml(m.senderName)} &middot; ${date}</span>
          </div>
          ${!m.read ? `<button class="btn btn-ghost btn-sm" data-read-msg="${m.id}">Mark Read</button>` : ''}
        </div>`
    }).join('')

    adminMessagesList.querySelectorAll('[data-read-msg]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        btn.textContent = '...'
        await markMessageRead(btn.dataset.readMsg)
        await loadAdminMessages()
      })
    })
  } catch (err) {
    console.error('Failed to load messages:', err)
    adminMessagesList.innerHTML = '<div class="dash-list-empty"><p>Failed to load messages.</p></div>'
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 7: EVENTS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════
const eventForm = document.getElementById('event-form')
const adminEventsList = document.getElementById('admin-events-list')

eventForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const status = document.getElementById('event-status')
  const btn = eventForm.querySelector('button[type="submit"]')
  btn.disabled = true
  status.textContent = 'Creating...'
  status.className = 'dash-form-status sending'

  try {
    await createEvent({
      title: document.getElementById('event-title').value.trim(),
      description: document.getElementById('event-desc').value.trim(),
      date: document.getElementById('event-date').value,
      time: document.getElementById('event-time').value,
      location: document.getElementById('event-location').value.trim(),
      schoolId,
    })
    eventForm.reset()
    status.textContent = 'Event created!'
    status.className = 'dash-form-status success'
    await loadAdminEvents()
    setTimeout(() => { status.textContent = ''; status.className = 'dash-form-status'; }, 3000)
  } catch (err) {
    console.error('Failed to create event:', err)
    status.textContent = 'Failed to create event.'
    status.className = 'dash-form-status error'
  } finally {
    btn.disabled = false
  }
})

async function loadAdminEvents() {
  try {
    const events = await getEvents(schoolId)
    if (events.length === 0) {
      adminEventsList.innerHTML = '<div class="dash-list-empty"><p>No events created yet. Use the form above to create one.</p></div>'
      return
    }
    adminEventsList.innerHTML = events.map(ev => {
      const evDate = new Date(ev.date)
      const dateStr = evDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
      return `
        <div class="dash-list-item">
          <div class="event-date-badge">
            <span class="event-month">${evDate.toLocaleDateString('en-US', { month: 'short' })}</span>
            <span class="event-day">${evDate.getDate()}</span>
          </div>
          <div class="dash-list-item-main">
            <div class="dash-list-item-header">
              <h4>${escHtml(ev.title)}</h4>
            </div>
            <span class="dash-list-item-meta">
              ${dateStr}${ev.time ? ' at ' + escHtml(ev.time) : ''}${ev.location ? ' &middot; ' + escHtml(ev.location) : ''}
            </span>
          </div>
          <button class="btn-icon danger" data-delete-event="${ev.id}" title="Delete event">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>`
    }).join('')

    adminEventsList.querySelectorAll('[data-delete-event]').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirmModal('Delete Event', 'Are you sure you want to delete this event?', async () => {
          await deleteEvent(btn.dataset.deleteEvent)
          await loadAdminEvents()
        })
      })
    })
  } catch (err) {
    console.error('Failed to load events:', err)
    adminEventsList.innerHTML = '<div class="dash-list-empty"><p>Failed to load events.</p></div>'
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   HELPERS
// ══════════════════════════════════════════════════════════════════════════
function escHtml(str) {
  const div = document.createElement('div')
  div.textContent = str || ''
  return div.innerHTML
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ══════════════════════════════════════════════════════════════════════════
//   INIT — Load all data
// ══════════════════════════════════════════════════════════════════════════
await Promise.all([
  loadNotices(),
  loadParents(),
  loadSubmissions(),
  loadParentForms(),
  loadAdminMessages(),
  loadAdminEvents(),
  loadStats(),
])
