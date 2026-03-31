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
const filterBtns = document.querySelectorAll('.dash-filter')
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
  loadStats(),
])
