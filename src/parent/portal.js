/**
 * SchoolPortal — Parent Portal JS
 * Protected page: requires auth + parent role
 *
 * Features:
 *   1. View school notices
 *   2. Submit forms (absence reports, permission notes)
 *   3. Message the school
 *   4. View school events
 *   5. Profile settings
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import {
  getUserDoc, getNotices, getEvents,
  submitParentForm, getParentForms,
  sendMessage, getUserMessages,
  updateUserProfile,
} from '../firebase/firestore.js'
import { updateProfile } from 'firebase/auth'

// ── Auth Guard ───────────────────────────────────────────────────────────
const { user } = await initGuard({
  requireAuth: true,
  requiredRole: 'parent',
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
const noticesList = document.getElementById('notices-list')

async function loadNotices() {
  try {
    const notices = await getNotices(schoolId)
    if (notices.length === 0) {
      noticesList.innerHTML = '<div class="dash-list-empty"><p>No notices from your school yet. Check back later!</p></div>'
      return
    }
    noticesList.innerHTML = notices.map(n => {
      const date = n.createdAt?.toDate?.() ? n.createdAt.toDate() : new Date()
      const priorityClass = n.priority === 'urgent' ? 'priority-urgent' : n.priority === 'important' ? 'priority-important' : ''
      return `
        <div class="dash-list-item ${priorityClass}">
          <div class="dash-list-item-main">
            <div class="dash-list-item-header">
              <h4>${esc(n.title)}</h4>
              ${n.priority !== 'normal' ? `<span class="dash-priority-badge ${n.priority}">${n.priority}</span>` : ''}
            </div>
            <p class="dash-list-item-body">${esc(n.body)}</p>
            <span class="dash-list-item-meta">From ${esc(n.authorName)} &middot; ${fmtDate(date)}</span>
          </div>
        </div>`
    }).join('')
  } catch (err) {
    console.error('Failed to load notices:', err)
    noticesList.innerHTML = '<div class="dash-list-empty"><p>Unable to load notices. Please try again later.</p></div>'
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 2: FORMS (Absence + Permission Notes)
// ══════════════════════════════════════════════════════════════════════════
const absenceForm = document.getElementById('absence-form')
const permissionForm = document.getElementById('permission-form')
const formTypeBtns = document.querySelectorAll('[data-form-type]')
const myFormsList = document.getElementById('my-forms-list')

// Toggle between form types
formTypeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    formTypeBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    if (btn.dataset.formType === 'absence') {
      absenceForm.classList.remove('hidden')
      permissionForm.classList.add('hidden')
    } else {
      absenceForm.classList.add('hidden')
      permissionForm.classList.remove('hidden')
    }
  })
})

// Submit absence report
absenceForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const status = document.getElementById('absence-status')
  const btn = absenceForm.querySelector('button[type="submit"]')
  btn.disabled = true
  status.textContent = 'Submitting...'
  status.className = 'dash-form-status sending'

  try {
    await submitParentForm({
      formType: 'absence',
      parentId: user.uid,
      parentName: displayName,
      schoolId,
      data: {
        childName: document.getElementById('absence-child').value.trim(),
        grade: document.getElementById('absence-grade').value.trim(),
        dateFrom: document.getElementById('absence-date-from').value,
        dateTo: document.getElementById('absence-date-to').value,
        reason: document.getElementById('absence-reason').value.trim(),
      },
    })
    absenceForm.reset()
    status.textContent = 'Absence report submitted!'
    status.className = 'dash-form-status success'
    await loadMyForms()
    setTimeout(() => { status.textContent = ''; status.className = 'dash-form-status'; }, 3000)
  } catch (err) {
    console.error('Failed to submit absence:', err)
    status.textContent = 'Failed to submit. Try again.'
    status.className = 'dash-form-status error'
  } finally {
    btn.disabled = false
  }
})

// Submit permission note
permissionForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const status = document.getElementById('permission-status')
  const btn = permissionForm.querySelector('button[type="submit"]')
  btn.disabled = true
  status.textContent = 'Submitting...'
  status.className = 'dash-form-status sending'

  try {
    await submitParentForm({
      formType: 'permission',
      parentId: user.uid,
      parentName: displayName,
      schoolId,
      data: {
        childName: document.getElementById('perm-child').value.trim(),
        grade: document.getElementById('perm-grade').value.trim(),
        date: document.getElementById('perm-date').value,
        permissionType: document.getElementById('perm-type').value,
        details: document.getElementById('perm-details').value.trim(),
      },
    })
    permissionForm.reset()
    status.textContent = 'Permission note submitted!'
    status.className = 'dash-form-status success'
    await loadMyForms()
    setTimeout(() => { status.textContent = ''; status.className = 'dash-form-status'; }, 3000)
  } catch (err) {
    console.error('Failed to submit permission note:', err)
    status.textContent = 'Failed to submit. Try again.'
    status.className = 'dash-form-status error'
  } finally {
    btn.disabled = false
  }
})

async function loadMyForms() {
  try {
    const forms = await getParentForms(user.uid)
    if (forms.length === 0) {
      myFormsList.innerHTML = '<div class="dash-list-empty"><p>No forms submitted yet.</p></div>'
      return
    }
    myFormsList.innerHTML = forms.map(f => {
      const date = f.createdAt?.toDate?.() ? fmtDate(f.createdAt.toDate()) : 'Just now'
      const typeLabel = f.formType === 'absence' ? 'Absence Report' : 'Permission Note'
      const typeBadge = f.formType === 'absence' ? 'blue' : 'green'
      const statusBadge = f.status === 'pending' ? 'status-pending'
        : f.status === 'acknowledged' ? 'status-ack'
        : f.status === 'approved' ? 'status-approved'
        : 'status-denied'
      const d = f.data || {}
      return `
        <div class="dash-list-item">
          <div class="dash-list-item-main">
            <div class="dash-list-item-header">
              <h4>${esc(d.childName || 'Form')}</h4>
              <span class="dash-type-badge ${typeBadge}">${typeLabel}</span>
              <span class="dash-status-badge ${statusBadge}">${f.status}</span>
            </div>
            <p class="dash-list-item-body">${f.formType === 'absence'
              ? `${esc(d.dateFrom)} to ${esc(d.dateTo)} — ${esc(d.reason)}`
              : `${esc(d.permissionType)} on ${esc(d.date)} — ${esc(d.details)}`}</p>
            <span class="dash-list-item-meta">${date}</span>
          </div>
        </div>`
    }).join('')
  } catch (err) {
    console.error('Failed to load forms:', err)
    myFormsList.innerHTML = '<div class="dash-list-empty"><p>Unable to load your submissions.</p></div>'
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 3: MESSAGES
// ══════════════════════════════════════════════════════════════════════════
const messageForm = document.getElementById('message-form')
const messagesList = document.getElementById('messages-list')

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const status = document.getElementById('message-status')
  const btn = messageForm.querySelector('button[type="submit"]')
  const subject = document.getElementById('msg-subject').value.trim()
  const body = document.getElementById('msg-body').value.trim()
  if (!subject || !body) return

  btn.disabled = true
  status.textContent = 'Sending...'
  status.className = 'dash-form-status sending'

  try {
    await sendMessage({
      senderId: user.uid,
      senderName: displayName,
      senderRole: 'parent',
      recipientId: 'school',
      schoolId,
      subject,
      body,
    })
    messageForm.reset()
    status.textContent = 'Message sent!'
    status.className = 'dash-form-status success'
    await loadMessages()
    setTimeout(() => { status.textContent = ''; status.className = 'dash-form-status'; }, 3000)
  } catch (err) {
    console.error('Failed to send message:', err)
    status.textContent = 'Failed to send. Try again.'
    status.className = 'dash-form-status error'
  } finally {
    btn.disabled = false
  }
})

async function loadMessages() {
  try {
    const msgs = await getUserMessages(user.uid)
    if (msgs.length === 0) {
      messagesList.innerHTML = '<div class="dash-list-empty"><p>No messages sent yet. Use the form above to contact the school.</p></div>'
      return
    }
    messagesList.innerHTML = msgs.map(m => {
      const date = m.createdAt?.toDate?.() ? fmtDate(m.createdAt.toDate()) : 'Just now'
      return `
        <div class="dash-list-item">
          <div class="dash-list-item-main">
            <div class="dash-list-item-header">
              <h4>${esc(m.subject)}</h4>
              <span class="dash-type-badge ${m.read ? 'green' : 'blue'}">${m.read ? 'Read' : 'Sent'}</span>
            </div>
            <p class="dash-list-item-body">${esc(m.body)}</p>
            <span class="dash-list-item-meta">${date}</span>
          </div>
        </div>`
    }).join('')
  } catch (err) {
    console.error('Failed to load messages:', err)
    messagesList.innerHTML = '<div class="dash-list-empty"><p>Unable to load messages.</p></div>'
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 4: EVENTS
// ══════════════════════════════════════════════════════════════════════════
const eventsList = document.getElementById('events-list')

async function loadEvents() {
  try {
    const events = await getEvents(schoolId)
    if (events.length === 0) {
      eventsList.innerHTML = '<div class="dash-list-empty"><p>No upcoming events scheduled. Check back later!</p></div>'
      return
    }
    const now = new Date()
    eventsList.innerHTML = events.map(ev => {
      const evDate = new Date(ev.date)
      const isPast = evDate < new Date(now.toISOString().split('T')[0])
      const dateStr = evDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      return `
        <div class="dash-list-item event-item ${isPast ? 'event-past' : ''}">
          <div class="event-date-badge">
            <span class="event-month">${evDate.toLocaleDateString('en-US', { month: 'short' })}</span>
            <span class="event-day">${evDate.getDate()}</span>
          </div>
          <div class="dash-list-item-main">
            <div class="dash-list-item-header">
              <h4>${esc(ev.title)}</h4>
              ${isPast ? '<span class="dash-type-badge">Past</span>' : ''}
            </div>
            <p class="dash-list-item-body">${esc(ev.description || '')}</p>
            <span class="dash-list-item-meta">
              ${dateStr}${ev.time ? ` at ${esc(ev.time)}` : ''}${ev.location ? ` &middot; ${esc(ev.location)}` : ''}
            </span>
          </div>
        </div>`
    }).join('')
  } catch (err) {
    console.error('Failed to load events:', err)
    eventsList.innerHTML = '<div class="dash-list-empty"><p>Unable to load events.</p></div>'
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   FEATURE 5: PROFILE
// ══════════════════════════════════════════════════════════════════════════
const profileForm = document.getElementById('profile-form')

// Populate profile fields
document.getElementById('profile-name').value = userDoc?.displayName || displayName
document.getElementById('profile-email').value = user.email
document.getElementById('profile-phone').value = userDoc?.phone || ''
document.getElementById('profile-school').value = userDoc?.schoolId || ''
document.getElementById('profile-child-name').value = userDoc?.childName || ''
document.getElementById('profile-child-grade').value = userDoc?.childGrade || ''
document.getElementById('profile-email-display').textContent = user.email
document.getElementById('profile-joined').textContent = userDoc?.createdAt?.toDate?.()
  ? fmtDate(userDoc.createdAt.toDate()) : 'Unknown'

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const status = document.getElementById('profile-status')
  const btn = profileForm.querySelector('button[type="submit"]')
  btn.disabled = true
  status.textContent = 'Saving...'
  status.className = 'dash-form-status sending'

  try {
    const newName = document.getElementById('profile-name').value.trim()
    const phone = document.getElementById('profile-phone').value.trim()
    const childName = document.getElementById('profile-child-name').value.trim()
    const childGrade = document.getElementById('profile-child-grade').value.trim()

    await updateUserProfile(user.uid, {
      displayName: newName,
      phone,
      childName,
      childGrade,
    })

    // Also update Firebase Auth display name
    if (newName !== user.displayName) {
      await updateProfile(user, { displayName: newName })
      document.getElementById('user-name').textContent = newName
      document.getElementById('welcome-name').textContent = newName
    }

    status.textContent = 'Profile saved!'
    status.className = 'dash-form-status success'
    setTimeout(() => { status.textContent = ''; status.className = 'dash-form-status'; }, 3000)
  } catch (err) {
    console.error('Failed to save profile:', err)
    status.textContent = 'Failed to save. Try again.'
    status.className = 'dash-form-status error'
  } finally {
    btn.disabled = false
  }
})

// ══════════════════════════════════════════════════════════════════════════
//   HELPERS
// ══════════════════════════════════════════════════════════════════════════
function esc(str) {
  const div = document.createElement('div')
  div.textContent = str || ''
  return div.innerHTML
}

function fmtDate(date) {
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
  loadMyForms(),
  loadMessages(),
  loadEvents(),
])
