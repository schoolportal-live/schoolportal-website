/**
 * SchoolOS — Student Portal
 * Protected page: requires auth + student role
 *
 * Shows:
 *   - Timetable view
 *   - Homework assignments
 *   - Attendance record
 *   - Published exam results
 *   - Fee status
 *   - Library books
 *   - Transport route info
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import {
  getSections, getClasses, getSchoolUsers,
  getHomeworkBySection,
  getAttendance,
  getStudentResults,
  getFeesByStudent,
  getTimetable,
  getTransportRoutes,
  getLibraryTransactions,
  getNotifications, getUnreadNotificationCount, markNotificationRead,
} from '../firebase/schools.js'
import { MODULES, HOMEWORK_STATUSES, ATTENDANCE_STATUSES } from '../shared/constants.js'
import { esc, formatDate, timeAgo, toast, statusBadge } from '../shared/components.js'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user, role, userDoc, school } = await initGuard({
  requireAuth: true,
  allowedRoles: ['student'],
  loadSchool: true,
})

const schoolId = userDoc.schoolId
const activeModules = school?.activeModules || []
const sectionId = userDoc.sectionId || ''
const classId = userDoc.classId || ''
const studentId = userDoc.studentDocId || user.uid

// ── Header ──────────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName

document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── State ───────────────────────────────────────────────────────────────
let sections = []
let classes = []
let homework = []
let attendance = {}
let results = []
let fees = []
let timetable = null
let transportRoutes = []
let libraryTxns = []
let notifications = []
let unreadCount = 0

// ── Tab Configuration ──────────────────────────────────────────────────
const ALL_TABS = [
  { id: 'timetable', label: 'Timetable', module: MODULES.TIMETABLE },
  { id: 'homework', label: 'Homework', module: MODULES.HOMEWORK },
  { id: 'attendance', label: 'Attendance', module: MODULES.ATTENDANCE },
  { id: 'results', label: 'Results', module: MODULES.RESULTS },
  { id: 'fees', label: 'Fees', module: MODULES.FEES },
  { id: 'transport', label: 'Transport', module: MODULES.TRANSPORT },
  { id: 'library', label: 'Library', module: MODULES.LIBRARY },
  { id: 'notifications', label: 'Notifications', alwaysOn: true },
]

// ── Load Data ───────────────────────────────────────────────────────────
async function loadAll() {
  try {
    ;[sections, classes, homework, results, fees, timetable, transportRoutes, libraryTxns] = await Promise.all([
      getSections(schoolId),
      getClasses(schoolId).catch(() => []),
      sectionId ? getHomeworkBySection(schoolId, sectionId).catch(() => []) : [],
      classId ? getStudentResults(schoolId, classId).catch(() => []) : [],
      getFeesByStudent(schoolId, studentId).catch(() => []),
      sectionId ? getTimetable(schoolId, sectionId).catch(() => null) : null,
      getTransportRoutes(schoolId).catch(() => []),
      getLibraryTransactions(schoolId).catch(() => []),
    ])

    // Load today's attendance
    const today = new Date().toISOString().split('T')[0]
    try {
      attendance = sectionId ? await getAttendance(schoolId, today, sectionId) || {} : {}
    } catch { attendance = {} }

    ;[notifications, unreadCount] = await Promise.all([
      getNotifications(schoolId, user.uid).catch(() => []),
      getUnreadNotificationCount(schoolId, user.uid).catch(() => 0),
    ])

    updateStats()
    renderTabs()
    renderActiveTab()
  } catch (err) {
    console.error('Failed to load data:', err)
    toast('Failed to load data', 'error')
  }
}

function updateStats() {
  const sec = sections.find(s => s.id === sectionId)
  const cls = classes.find(c => c.id === classId)
  document.getElementById('stat-section').textContent = sec?.displayName || sectionId || '—'
  document.getElementById('stat-class').textContent = cls?.name || classId || '—'
  document.getElementById('section-info').textContent = sec ? `Section: ${sec.displayName}` : ''

  const pendingHW = homework.filter(h => {
    const comp = h.completions?.[studentId]
    return !comp || comp.status === HOMEWORK_STATUSES.ASSIGNED
  })
  document.getElementById('stat-homework').textContent = pendingHW.length

  // Attendance today
  const myRecord = Array.isArray(attendance?.records)
    ? attendance.records.find(r => r.studentId === studentId || r.studentId === user.uid)
    : attendance?.records?.[studentId]
  const myStatus = myRecord?.status || (typeof myRecord === 'string' ? myRecord : null)
  document.getElementById('stat-attendance').textContent = myStatus
    ? myStatus.charAt(0).toUpperCase() + myStatus.slice(1)
    : '—'

  document.getElementById('stat-results').textContent = results.length
}

// ── Tab Rendering ──────────────────────────────────────────────────────
let currentTab = 'timetable'

function getEnabledTabs() {
  return ALL_TABS.filter(t => t.alwaysOn || activeModules.includes(t.module))
}

function renderTabs() {
  const tabs = getEnabledTabs()
  if (tabs.length && !tabs.find(t => t.id === currentTab)) {
    currentTab = tabs[0].id
  }
  const btnContainer = document.getElementById('tab-buttons')
  btnContainer.innerHTML = tabs.map(t => `
    <button class="dash-tab ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">
      ${esc(t.label)}
      ${t.id === 'notifications' && unreadCount > 0 ? `<span class="section-badge">${unreadCount}</span>` : ''}
    </button>
  `).join('')

  btnContainer.querySelectorAll('.dash-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab
      renderTabs()
      renderActiveTab()
    })
  })
}

function renderActiveTab() {
  const container = document.getElementById('tab-content')
  const renderers = {
    timetable: renderTimetable,
    homework: renderHomework,
    attendance: renderAttendance,
    results: renderResults,
    fees: renderFees,
    transport: renderTransport,
    library: renderLibrary,
    notifications: renderNotifications,
  }
  const renderer = renderers[currentTab]
  if (renderer) {
    container.innerHTML = '<div class="dash-tab-content active" id="tab-active"></div>'
    renderer(document.getElementById('tab-active'))
  }
}

// ── Timetable Tab ──────────────────────────────────────────────────────
function renderTimetable(el) {
  if (!timetable || !timetable.schedule) {
    el.innerHTML = '<div class="dash-card"><p class="dash-empty">No timetable set for your section yet.</p></div>'
    return
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const periods = timetable.periods || []

  let html = '<div class="dash-card"><h3>Weekly Timetable</h3><div style="overflow-x:auto;"><table class="dash-table"><thead><tr><th>Day</th>'
  periods.forEach((p, i) => { html += `<th>P${i + 1}</th>` })
  html += '</tr></thead><tbody>'

  for (const day of days) {
    const daySchedule = timetable.schedule[day] || []
    html += `<tr><td><strong>${day}</strong></td>`
    periods.forEach((_, i) => {
      const slot = daySchedule.find(s => s.periodIndex === i)
      html += `<td>${slot ? esc(slot.subject || '—') : '—'}</td>`
    })
    html += '</tr>'
  }
  html += '</tbody></table></div></div>'
  el.innerHTML = html
}

// ── Homework Tab ───────────────────────────────────────────────────────
function renderHomework(el) {
  if (!homework.length) {
    el.innerHTML = '<div class="dash-card"><p class="dash-empty">No homework assigned.</p></div>'
    return
  }

  const rows = homework.map(h => {
    const comp = h.completions?.[studentId]
    const status = comp?.status || 'assigned'
    return `<tr>
      <td>${esc(h.subject || '—')}</td>
      <td>${esc(h.title || h.description || '')}</td>
      <td>${formatDate(h.deadline)}</td>
      <td>${statusBadge(status)}</td>
    </tr>`
  }).join('')

  el.innerHTML = `<div class="dash-card"><h3>Homework</h3>
    <table class="dash-table"><thead><tr><th>Subject</th><th>Description</th><th>Deadline</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

// ── Attendance Tab ─────────────────────────────────────────────────────
function renderAttendance(el) {
  const myRecord = Array.isArray(attendance?.records)
    ? attendance.records.find(r => r.studentId === studentId || r.studentId === user.uid)
    : attendance?.records?.[studentId]
  const attStatus = myRecord?.status || (typeof myRecord === 'string' ? myRecord : null)
  el.innerHTML = `<div class="dash-card"><h3>Today's Attendance</h3>
    <p>${attStatus ? statusBadge(attStatus) : '<span class="dash-empty">Not recorded yet.</span>'}</p>
    <p class="stat-label" style="margin-top:12px;">Full attendance history will be available in the detailed view.</p>
  </div>`
}

// ── Results Tab ────────────────────────────────────────────────────────
function renderResults(el) {
  if (!results.length) {
    el.innerHTML = '<div class="dash-card"><p class="dash-empty">No published results yet.</p></div>'
    return
  }

  const rows = results.map(exam => {
    const myResults = exam.results?.[studentId] || {}
    const subjects = exam.subjects || Object.keys(myResults)
    const totalObtained = subjects.reduce((sum, s) => sum + (myResults[s] || 0), 0)
    const totalMax = subjects.reduce((sum, s) => sum + (exam.maxMarks?.[s] || 100), 0)
    const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : '—'
    return `<tr>
      <td>${esc(exam.name)}</td>
      <td>${esc(exam.examType || '—')}</td>
      <td>${totalObtained} / ${totalMax}</td>
      <td>${percentage}%</td>
      <td>${formatDate(exam.publishedAt || exam.createdAt)}</td>
    </tr>`
  }).join('')

  el.innerHTML = `<div class="dash-card"><h3>Exam Results</h3>
    <table class="dash-table"><thead><tr><th>Exam</th><th>Type</th><th>Marks</th><th>%</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

// ── Fees Tab ───────────────────────────────────────────────────────────
function renderFees(el) {
  if (!fees.length) {
    el.innerHTML = '<div class="dash-card"><p class="dash-empty">No fee records found.</p></div>'
    return
  }

  const rows = fees.map(f => `<tr>
    <td>${esc(f.month || '—')}</td>
    <td>${esc(f.feeType || 'tuition')}</td>
    <td>${f.amount?.toLocaleString() || '—'}</td>
    <td>${(f.amountPaid ?? f.paid ?? 0).toLocaleString()}</td>
    <td>${statusBadge(f.status)}</td>
  </tr>`).join('')

  el.innerHTML = `<div class="dash-card"><h3>Fee Records</h3>
    <table class="dash-table"><thead><tr><th>Month</th><th>Type</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

// ── Transport Tab ──────────────────────────────────────────────────────
function renderTransport(el) {
  const myRoute = userDoc.transportRoute
  const route = myRoute ? transportRoutes.find(r => r.id === myRoute) : null

  if (!route) {
    el.innerHTML = '<div class="dash-card"><p class="dash-empty">No transport route assigned.</p></div>'
    return
  }

  el.innerHTML = `<div class="dash-card"><h3>My Transport Route</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
      <div><strong>Route:</strong> ${esc(route.routeName)}</div>
      <div><strong>Driver:</strong> ${esc(route.driverName || '—')}</div>
      <div><strong>Phone:</strong> ${esc(route.driverPhone || '—')}</div>
      <div><strong>Vehicle:</strong> ${esc(route.vehicleNumber || '—')}</div>
    </div>
    ${route.stops?.length ? `<div style="margin-top:12px;"><strong>Stops:</strong> ${route.stops.map(s => esc(s)).join(' → ')}</div>` : ''}
  </div>`
}

// ── Library Tab ────────────────────────────────────────────────────────
function renderLibrary(el) {
  const myTxns = libraryTxns.filter(t => t.borrowerId === studentId || t.borrowerId === user.uid)
  if (!myTxns.length) {
    el.innerHTML = '<div class="dash-card"><p class="dash-empty">No library records.</p></div>'
    return
  }

  const rows = myTxns.map(t => `<tr>
    <td>${esc(t.bookTitle)}</td>
    <td>${formatDate(t.issueDate)}</td>
    <td>${formatDate(t.dueDate)}</td>
    <td>${t.returnDate ? formatDate(t.returnDate) : '—'}</td>
    <td>${statusBadge(t.status === 'issued' ? 'pending' : 'approved')}</td>
  </tr>`).join('')

  el.innerHTML = `<div class="dash-card"><h3>Library Books</h3>
    <table class="dash-table"><thead><tr><th>Book</th><th>Issued</th><th>Due</th><th>Returned</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

// ── Notifications Tab ──────────────────────────────────────────────────
function renderNotifications(el) {
  if (!notifications.length) {
    el.innerHTML = '<div class="dash-card"><p class="dash-empty">No notifications.</p></div>'
    return
  }

  const items = notifications.map(n => `
    <div class="dash-card ${!n.read ? 'notification-unread' : ''}" style="margin-bottom:8px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${esc(n.title || 'Notification')}</strong>
        <span class="stat-label">${timeAgo(n.createdAt)}</span>
      </div>
      <p style="margin:4px 0 0;">${esc(n.body || '')}</p>
    </div>
  `).join('')

  el.innerHTML = `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3>Notifications</h3>
      ${unreadCount > 0 ? '<button class="btn btn-secondary btn-sm" id="mark-all-read">Mark All Read</button>' : ''}
    </div>
    ${items}
  </div>`

  document.getElementById('mark-all-read')?.addEventListener('click', async () => {
    try {
      const unread = notifications.filter(n => !n.read)
      await Promise.all(unread.map(n => markNotificationRead(schoolId, n.id)))
      unreadCount = 0
      notifications.forEach(n => n.read = true)
      renderTabs()
      renderNotifications(el)
      toast('All marked as read', 'success')
    } catch (err) {
      toast('Failed to mark as read', 'error')
    }
  })
}

// ── Init ────────────────────────────────────────────────────────────────
loadAll()
