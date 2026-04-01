/**
 * SchoolOS — Line Manager Dashboard
 * Protected page: requires auth + line_manager role
 *
 * Shows:
 *   - Managed sections overview with teacher/student info
 *   - Teachers reporting to this LM
 *   - Module tabs based on school's active modules
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import {
  getSections, getSchoolUsers, getAllStudents,
  getMessagesForUser, markMessageRead, addMessageReply,
  getRequestsForUser, updateRequestStatus, markRequestRead,
  getAllRequisitions, reviewRequisition,
  getAttendance, getHomeworkBySection, getTimetable,
} from '../firebase/schools.js'
import { MODULES, MESSAGE_CATEGORIES, REQUEST_TYPES } from '../shared/constants.js'
import { esc, formatDate, timeAgo, toast, statusBadge } from '../shared/components.js'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user, role, userDoc, school } = await initGuard({
  requireAuth: true,
  allowedRoles: ['line_manager'],
  loadSchool: true,
})

const schoolId = userDoc.schoolId
const activeModules = school?.activeModules || []
const managedSectionIds = userDoc.managedSections || []

// ── Header ──────────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName

document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── State ───────────────────────────────────────────────────────────────
let allSections = []
let mySections = []
let allUsers = []
let students = []
let myTeachers = []
let messages = []
let myRequests = []
let allRequisitions = []

// ── Load Data ───────────────────────────────────────────────────────────
async function loadAll() {
  try {
    ;[allSections, allUsers, students, messages, myRequests, allRequisitions] = await Promise.all([
      getSections(schoolId),
      getSchoolUsers(schoolId),
      getAllStudents(schoolId),
      getMessagesForUser(schoolId, user.uid),
      getRequestsForUser(schoolId, user.uid),
      getAllRequisitions(schoolId).catch(() => []),
    ])

    // Sections managed by this LM
    mySections = allSections.filter(s => managedSectionIds.includes(s.id))

    // Teachers who report to this LM (via reportsTo field)
    myTeachers = allUsers.filter(u =>
      u.role === 'teacher' && u.reportsTo === user.uid
    )

    updateStats()
    renderTabs()
    renderActiveTab()
  } catch (err) {
    console.error('Failed to load data:', err)
    toast('Failed to load data', 'error')
  }
}

function updateStats() {
  document.getElementById('stat-sections').textContent = mySections.length
  document.getElementById('stat-teachers').textContent = myTeachers.length
  const myStudents = students.filter(s => managedSectionIds.includes(s.sectionId))
  document.getElementById('stat-students').textContent = myStudents.length
  document.getElementById('stat-pending').textContent = '0'
}

// ── Tabs ────────────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: 'sections', label: 'My Sections', always: true },
  { id: 'teachers', label: 'My Teachers', always: true },
  { id: 'attendance', label: 'Attendance', module: MODULES.ATTENDANCE },
  { id: 'homework', label: 'Homework', module: MODULES.HOMEWORK },
  { id: 'timetable', label: 'Timetable', module: MODULES.TIMETABLE },
  { id: 'messages', label: 'Messages', module: MODULES.COMMUNICATION },
  { id: 'requests', label: 'Requests', module: MODULES.REQUESTS },
  { id: 'requisitions', label: 'Requisitions', module: MODULES.REQUISITION },
]

let activeTabs = []
let currentTab = 'sections'

function renderTabs() {
  activeTabs = ALL_TABS.filter(t => t.always || activeModules.includes(t.module))

  const container = document.getElementById('tab-buttons')
  container.innerHTML = activeTabs.map((t, i) =>
    `<button class="dash-tab${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`
  ).join('')

  container.querySelectorAll('.dash-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentTab = btn.dataset.tab
      renderActiveTab()
    })
  })
}

function renderActiveTab() {
  const container = document.getElementById('tab-content')

  switch (currentTab) {
    case 'sections': return renderMySections(container)
    case 'teachers': return renderMyTeachers(container)
    case 'attendance': return renderAttendanceTab(container)
    case 'homework': return renderHomeworkTab(container)
    case 'timetable': return renderTimetableTab(container)
    case 'messages': return renderMessagesTab(container)
    case 'requests': return renderRequestsTab(container)
    case 'requisitions': return renderRequisitionsTab(container)
    default: return renderMySections(container)
  }
}

function renderMySections(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned to you yet. Ask your Super Admin to assign sections.</div></div>'
    return
  }

  const cards = mySections.map(s => {
    const ht = s.homeTeacherId ? allUsers.find(u => u.id === s.homeTeacherId) : null
    const studentCount = students.filter(st => st.sectionId === s.id).length

    return `
      <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-sm);border-left:3px solid var(--brand-primary);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:15px;">${esc(s.displayName)}</strong>
          <span style="font-size:13px;color:var(--text-muted);">${studentCount} students</span>
        </div>
        <div style="font-size:13px;color:var(--text-muted);">
          Home Teacher: ${ht ? esc(ht.displayName) : '<em>unassigned</em>'}
        </div>
      </div>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Managed Sections (${mySections.length})</h2></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
        ${cards}
      </div>
    </div>
  `
}

function renderMyTeachers(container) {
  if (myTeachers.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No teachers report to you yet.</div></div>'
    return
  }

  const rows = myTeachers.map(t => {
    const homeSec = t.homeSection ? allSections.find(s => s.id === t.homeSection) : null
    const sectionCount = (t.assignedSections || []).length
    const subjectsList = (t.subjects || []).join(', ')

    return `
      <tr>
        <td><strong>${esc(t.displayName || '—')}</strong></td>
        <td>${homeSec ? esc(homeSec.displayName) : '<span style="color:var(--text-muted);">—</span>'}</td>
        <td>${sectionCount} section(s)</td>
        <td style="font-size:13px;">${esc(subjectsList || '—')}</td>
        <td style="font-size:13px;color:var(--text-muted);">${esc(t.email || '—')}</td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>My Teachers (${myTeachers.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>Name</th><th>Home Section</th><th>Sections</th><th>Subjects</th><th>Email</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════
//   MESSAGES TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderMessagesTab(container) {
  const received = messages.filter(m => m.recipientUids?.includes(user.uid) && m.senderId !== user.uid)

  if (received.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No messages received yet.</div></div>'
    return
  }

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Inbox (${received.length})</h2></div>
      <div id="lm-messages-list"></div>
    </div>
  `

  const list = document.getElementById('lm-messages-list')
  list.innerHTML = received.map(m => {
    const catLabel = MESSAGE_CATEGORIES.find(c => c.value === m.category)?.label || m.category
    const time = m.createdAt ? timeAgo(m.createdAt) : ''
    const isRead = (m.readBy || []).includes(user.uid)
    const hasReplied = (m.repliedBy || []).includes(user.uid)
    const replyCount = (m.replies || []).length

    let repliesHtml = ''
    if (replyCount > 0) {
      repliesHtml = m.replies.map(r => `
        <div style="margin-top:6px;padding:8px;background:var(--white);border-radius:var(--radius-sm);font-size:13px;">
          <strong>${esc(r.senderName)}</strong> <span style="color:var(--text-muted);font-size:11px;">(${esc(r.senderRole.replace(/_/g, ' '))})</span>
          <div style="margin-top:4px;">${esc(r.body)}</div>
        </div>
      `).join('')
    }

    return `
      <div class="dash-list-item${!isRead ? ' notification-unread' : ''}" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <strong>${esc(m.senderName)}</strong>
            <span class="section-badge" style="font-size:11px;padding:2px 8px;margin-left:6px;">${esc(catLabel)}</span>
            ${m.studentName ? `<span style="font-size:12px;color:var(--text-muted);margin-left:6px;">re: ${esc(m.studentName)}</span>` : ''}
            ${hasReplied ? '<span style="font-size:11px;color:var(--green);margin-left:6px;">&#10003; replied</span>' : ''}
          </div>
          <span style="font-size:12px;color:var(--text-muted);">${time}</span>
        </div>
        <p style="margin-top:8px;font-size:14px;">${esc(m.body)}</p>
        ${replyCount > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--gray-200);">${repliesHtml}</div>` : ''}
        ${!hasReplied ? `
          <div style="margin-top:10px;display:flex;gap:8px;">
            <input type="text" class="reply-input" data-reply-for="${esc(m.id)}" placeholder="Type a reply..." style="flex:1;padding:6px 10px;border:1px solid var(--gray-300);border-radius:var(--radius-sm);font-size:13px;" />
            <button class="btn btn-primary btn-sm reply-btn" data-reply-for="${esc(m.id)}">Reply</button>
          </div>
        ` : ''}
      </div>
    `
  }).join('')

  // Mark as read
  received.filter(m => !(m.readBy || []).includes(user.uid)).forEach(m => {
    markMessageRead(schoolId, m.id, user.uid)
  })

  // Reply handlers
  list.querySelectorAll('.reply-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const msgId = btn.dataset.replyFor
      const input = list.querySelector(`input[data-reply-for="${msgId}"]`)
      const body = input?.value.trim()
      if (!body) return
      try {
        await addMessageReply(schoolId, msgId, {
          senderId: user.uid, senderName: displayName, senderRole: 'line_manager', body,
        })
        toast('Reply sent', 'success')
        messages = await getMessagesForUser(schoolId, user.uid)
        renderMessagesTab(container)
      } catch (err) { toast('Failed to send reply', 'error') }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUESTS TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderRequestsTab(container) {
  const received = myRequests.filter(r => r.recipientUids?.includes(user.uid) && r.senderId !== user.uid)

  if (received.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No requests received yet.</div></div>'
    return
  }

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Requests (${received.length})</h2></div>
      <div id="lm-requests-list"></div>
    </div>
  `

  const list = document.getElementById('lm-requests-list')
  list.innerHTML = received.map(r => {
    const typeLabel = REQUEST_TYPES.find(t => t.value === r.requestType)?.label || r.requestType
    const time = r.createdAt ? timeAgo(r.createdAt) : ''
    const commentCount = (r.comments || []).length

    let commentsHtml = ''
    if (commentCount > 0) {
      commentsHtml = r.comments.map(c => `
        <div style="margin-top:6px;padding:8px;background:var(--white);border-radius:var(--radius-sm);font-size:13px;">
          <strong>${esc(c.name)}</strong> ${statusBadge(c.status)}
          <div style="margin-top:4px;">${esc(c.body)}</div>
        </div>
      `).join('')
    }

    const isPending = r.status === 'pending' || r.status === 'acknowledged'

    return `
      <div class="dash-list-item" style="margin-bottom:10px;" data-req-id="${esc(r.id)}">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <strong>${esc(r.senderName)}</strong>
            <span class="section-badge" style="font-size:11px;padding:2px 8px;margin-left:6px;">${esc(typeLabel)}</span>
            ${statusBadge(r.status)}
          </div>
          <span style="font-size:12px;color:var(--text-muted);">${time}</span>
        </div>
        <p style="margin-top:6px;font-weight:600;font-size:14px;">${esc(r.subject)}</p>
        <p style="margin-top:4px;font-size:13px;color:var(--text-secondary);">${esc(r.body)}</p>
        ${commentCount > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--gray-200);">${commentsHtml}</div>` : ''}
        ${isPending ? `
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;">
            <input type="text" class="req-comment" data-req-id="${esc(r.id)}" placeholder="Add a comment..." style="flex:1;padding:6px 10px;border:1px solid var(--gray-300);border-radius:var(--radius-sm);font-size:13px;" />
            <button class="btn btn-primary btn-sm req-action" data-req-id="${esc(r.id)}" data-action="acknowledged">Acknowledge</button>
            <button class="btn btn-secondary btn-sm req-action" data-req-id="${esc(r.id)}" data-action="escalated">Escalate</button>
            <button class="btn btn-sm req-action" data-req-id="${esc(r.id)}" data-action="resolved" style="background:var(--green);color:#fff;">Resolve</button>
          </div>
        ` : ''}
      </div>
    `
  }).join('')

  // Mark as read
  received.filter(r => !(r.readBy || []).includes(user.uid)).forEach(r => {
    markRequestRead(schoolId, r.id, user.uid)
  })

  // Action handlers
  list.querySelectorAll('.req-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reqId = btn.dataset.reqId
      const action = btn.dataset.action
      const commentInput = list.querySelector(`input.req-comment[data-req-id="${reqId}"]`)
      const commentBody = commentInput?.value.trim()

      try {
        await updateRequestStatus(schoolId, reqId, action, commentBody ? {
          uid: user.uid, name: displayName, role: 'line_manager', body: commentBody,
        } : null)
        toast(`Request ${action}`, 'success')
        myRequests = await getRequestsForUser(schoolId, user.uid)
        renderRequestsTab(container)
      } catch (err) { toast('Failed to update request', 'error') }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUISITIONS TAB (LM reviews teacher requisitions)
// ═══════════════════════════════════════════════════════════════════════════

function renderRequisitionsTab(container) {
  // Filter requisitions for managed sections
  const relevant = allRequisitions.filter(r => managedSectionIds.includes(r.sectionId))

  if (relevant.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No requisitions from your sections.</div></div>'
    return
  }

  const rows = relevant.map(r => {
    const sec = allSections.find(s => s.id === r.sectionId)
    const isPending = r.status === 'submitted'
    return `
      <tr>
        <td><strong>${esc(r.teacherName)}</strong></td>
        <td>${sec ? esc(sec.displayName) : '—'}</td>
        <td>${r.totalItems} item(s)</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          ${isPending ? `<button class="btn btn-sm btn-primary review-req" data-id="${esc(r.id)}" style="padding:2px 8px;font-size:11px;">Review & Forward</button>` : ''}
        </td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Requisitions (${relevant.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>Teacher</th><th>Section</th><th>Items</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `

  container.querySelectorAll('.review-req').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await reviewRequisition(schoolId, btn.dataset.id, {
          reviewerId: user.uid, reviewerName: displayName,
          items: relevant.find(r => r.id === btn.dataset.id)?.items || [],
          comments: [],
        })
        toast('Requisition reviewed and forwarded', 'success')
        allRequisitions = await getAllRequisitions(schoolId)
        renderRequisitionsTab(container)
      } catch (err) { toast('Failed', 'error') }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   ATTENDANCE TAB (LM reviews attendance for managed sections)
// ═══════════════════════════════════════════════════════════════════════════

function renderAttendanceTab(container) {
  const today = new Date().toISOString().split('T')[0]

  const sectionOptions = mySections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Attendance Review</h2></div>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <select id="att-section" class="dash-input" style="max-width:220px;">${sectionOptions}</select>
        <input type="date" id="att-date" class="dash-input" value="${today}" style="max-width:180px;">
        <button class="btn btn-primary btn-sm" id="att-load">Load</button>
      </div>
      <div id="att-result"><p class="dash-empty">Select a section and date to review attendance.</p></div>
    </div>
  `

  document.getElementById('att-load').addEventListener('click', async () => {
    const sectionId = document.getElementById('att-section').value
    const date = document.getElementById('att-date').value
    if (!sectionId || !date) return

    const resultEl = document.getElementById('att-result')
    resultEl.innerHTML = '<p>Loading...</p>'

    try {
      const record = await getAttendance(schoolId, date, sectionId)
      if (!record || !record.records) {
        resultEl.innerHTML = '<p class="dash-empty">No attendance recorded for this date.</p>'
        return
      }

      // records is an array of {studentId, studentName, status}
      const recordsMap = new Map(
        Array.isArray(record.records)
          ? record.records.map(r => [r.studentId, r.status])
          : Object.entries(record.records).map(([id, v]) => [id, v?.status || v])
      )

      const sectionStudents = students.filter(s => s.sectionId === sectionId)
      const rows = sectionStudents.map(s => {
        const status = recordsMap.get(s.id) || 'not_recorded'
        return `<tr><td>${esc(s.displayName || s.name)}</td><td>${statusBadge(status === 'not_recorded' ? 'pending' : status)}</td></tr>`
      }).join('')

      const presentCount = sectionStudents.filter(s => recordsMap.get(s.id) === 'present').length
      const absentCount = sectionStudents.filter(s => recordsMap.get(s.id) === 'absent').length

      resultEl.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:12px;">
          <span style="color:var(--green);font-weight:600;">Present: ${presentCount}</span>
          <span style="color:#ef4444;font-weight:600;">Absent: ${absentCount}</span>
          <span style="color:var(--text-muted);">Total: ${sectionStudents.length}</span>
        </div>
        <table class="dash-table"><thead><tr><th>Student</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      `
    } catch (err) {
      resultEl.innerHTML = '<p class="dash-empty">Failed to load attendance.</p>'
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   HOMEWORK TAB (LM reviews homework status for managed sections)
// ═══════════════════════════════════════════════════════════════════════════

function renderHomeworkTab(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned.</div></div>'
    return
  }

  const sectionOptions = mySections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Homework Review</h2></div>
      <div style="margin-bottom:16px;">
        <select id="hw-section" class="dash-input" style="max-width:220px;">${sectionOptions}</select>
      </div>
      <div id="hw-result"><p class="dash-empty">Select a section to review homework.</p></div>
    </div>
  `

  document.getElementById('hw-section').addEventListener('change', async (e) => {
    const sectionId = e.target.value
    const resultEl = document.getElementById('hw-result')
    if (!sectionId) { resultEl.innerHTML = ''; return }
    resultEl.innerHTML = '<p>Loading...</p>'

    try {
      const hwList = await getHomeworkBySection(schoolId, sectionId)
      if (!hwList.length) {
        resultEl.innerHTML = '<p class="dash-empty">No homework assigned for this section.</p>'
        return
      }

      const rows = hwList.map(h => {
        const completions = h.completions || {}
        const total = Object.keys(completions).length
        const verified = Object.values(completions).filter(c => c.status === 'approved').length
        return `<tr>
          <td>${esc(h.subject || '—')}</td>
          <td style="max-width:200px;">${esc(h.description || '')}</td>
          <td>${formatDate(h.deadline)}</td>
          <td>${total} submitted</td>
          <td>${verified} verified</td>
        </tr>`
      }).join('')

      resultEl.innerHTML = `
        <table class="dash-table"><thead><tr><th>Subject</th><th>Description</th><th>Deadline</th><th>Submissions</th><th>Verified</th></tr></thead>
        <tbody>${rows}</tbody></table>
      `
    } catch (err) {
      resultEl.innerHTML = '<p class="dash-empty">Failed to load homework.</p>'
    }
  })

  // Auto-load first section
  if (mySections.length > 0) {
    document.getElementById('hw-section').dispatchEvent(new Event('change'))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//   TIMETABLE TAB (LM reviews timetables for managed sections)
// ═══════════════════════════════════════════════════════════════════════════

function renderTimetableTab(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned.</div></div>'
    return
  }

  const sectionOptions = mySections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Section Timetable</h2></div>
      <div style="margin-bottom:16px;">
        <select id="tt-section" class="dash-input" style="max-width:220px;">${sectionOptions}</select>
      </div>
      <div id="tt-result"><p class="dash-empty">Select a section to view timetable.</p></div>
    </div>
  `

  document.getElementById('tt-section').addEventListener('change', async (e) => {
    const sectionId = e.target.value
    const resultEl = document.getElementById('tt-result')
    if (!sectionId) { resultEl.innerHTML = ''; return }
    resultEl.innerHTML = '<p>Loading...</p>'

    try {
      const tt = await getTimetable(schoolId, sectionId)
      if (!tt || !tt.schedule) {
        resultEl.innerHTML = '<p class="dash-empty">No timetable set for this section.</p>'
        return
      }

      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const periods = tt.periods || []

      let html = '<div style="overflow-x:auto;"><table class="dash-table"><thead><tr><th>Day</th>'
      periods.forEach((p, i) => { html += `<th>P${i + 1}</th>` })
      html += '</tr></thead><tbody>'

      for (const day of days) {
        const daySlots = tt.schedule[day] || []
        html += `<tr><td><strong>${day}</strong></td>`
        periods.forEach((_, i) => {
          const slot = daySlots.find(s => s.periodIndex === i)
          const teacher = slot?.teacherId ? allUsers.find(u => u.id === slot.teacherId) : null
          html += `<td>${slot?.subject ? esc(slot.subject) : '—'}${teacher ? `<br><span style="font-size:11px;color:#6b7280;">${esc(teacher.displayName || '')}</span>` : ''}</td>`
        })
        html += '</tr>'
      }
      html += '</tbody></table></div>'
      resultEl.innerHTML = html
    } catch (err) {
      resultEl.innerHTML = '<p class="dash-empty">Failed to load timetable.</p>'
    }
  })

  if (mySections.length > 0) {
    document.getElementById('tt-section').dispatchEvent(new Event('change'))
  }
}

function renderPlaceholder(container, title, message) {
  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>${esc(title)}</h2></div>
      <div class="dash-empty">${esc(message)}</div>
    </div>
  `
}

// ── Init ────────────────────────────────────────────────────────────────
await loadAll()
