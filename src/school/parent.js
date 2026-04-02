/**
 * SchoolOS — Parent Portal
 * Protected page: requires auth + parent role
 *
 * Features:
 *   - Send categorized messages (30-word limit) routed through hierarchy
 *   - Submit requests (leave, complaint, fee issue, transport, general)
 *   - View message history with replies
 *   - View request status and comments
 *   - Notification feed
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import {
  getSections, getSchoolUsers,
  createMessage, getMessagesForUser, markMessageRead, addMessageReply,
  createRequest, getRequestsForUser,
  getNotifications, getUnreadNotificationCount, markNotificationRead,
  notifyRecipients,
  getHomeworkBySection, markHomeworkCompleted,
  getTransportRoutes, createTransportRequest,
  getFeesByStudent,
  getStudentResults, getClasses,
} from '../firebase/schools.js'
import { loadHierarchy, buildNotificationChain, buildEscalationChain } from '../shared/hierarchy.js'
import { getHierarchyLoaders } from '../firebase/schools.js'
import {
  MESSAGE_CATEGORIES, REQUEST_TYPES, MESSAGE_WORD_LIMIT, MODULES, PICKUP_RELATIONS,
} from '../shared/constants.js'
import {
  esc, formatDate, formatDateTime, timeAgo, toast, statusBadge,
  enforceWordLimit,
} from '../shared/components.js'
import { printReportCard } from '../shared/report-card.js'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user, role, userDoc, school } = await initGuard({
  requireAuth: true,
  allowedRoles: ['parent'],
  loadSchool: true,
})

const schoolId = userDoc.schoolId
const activeModules = school?.activeModules || []
// Support both flat fields (legacy) and children array (new seed format)
const firstChild = Array.isArray(userDoc.children) && userDoc.children.length > 0 ? userDoc.children[0] : null
const childName = userDoc.childName || firstChild?.name || ''
const childSection = userDoc.childSection || firstChild?.sectionId || ''
const childStudentId = userDoc.childStudentId || firstChild?.studentId || null

// ── Header ──────────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName
document.getElementById('child-info').textContent = childName
  ? `Child: ${childName}`
  : 'No child linked to your account yet.'

document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── State ───────────────────────────────────────────────────────────────
let messages = []
let requests = []
let notifications = []
let unreadCount = 0
let sections = []
let allUsers = []
let homework = []
let transportRoutes = []
let fees = []
let results = []
let classes = []
let hierarchyLoaded = false

// ── Load Data ───────────────────────────────────────────────────────────
async function loadAll() {
  try {
    ;[messages, requests, sections, allUsers, homework, transportRoutes, fees] = await Promise.all([
      getMessagesForUser(schoolId, user.uid),
      getRequestsForUser(schoolId, user.uid),
      getSections(schoolId),
      getSchoolUsers(schoolId),
      childSection ? getHomeworkBySection(schoolId, childSection).catch(() => []) : [],
      getTransportRoutes(schoolId).catch(() => []),
      getFeesByStudent(schoolId, childStudentId || user.uid).catch(() => []),
    ])

    // Load hierarchy for message routing
    try {
      await loadHierarchy(schoolId, getHierarchyLoaders())
      hierarchyLoaded = true
    } catch (err) {
      console.warn('Hierarchy not loaded — messages will use fallback routing:', err)
    }

    // Load classes and results
    try {
      classes = await getClasses(schoolId).catch(() => [])
      if (childSection) {
        const sec = sections.find(s => s.id === childSection)
        const classId = sec?.classId || ''
        if (classId) {
          results = await getStudentResults(schoolId, classId).catch(() => [])
        }
      }
    } catch { /* non-critical */ }

    // Notifications
    ;[notifications, unreadCount] = await Promise.all([
      getNotifications(schoolId, user.uid),
      getUnreadNotificationCount(schoolId, user.uid),
    ])

    updateStats()
    renderTabs()
    renderActiveTab()
    updateNotificationBadge()
  } catch (err) {
    console.error('Failed to load data:', err)
    toast('Failed to load data', 'error')
  }
}

function updateStats() {
  const myMessages = messages.filter(m => m.senderId === user.uid)
  const myRequests = requests.filter(r => r.senderId === user.uid)
  document.getElementById('stat-messages').textContent = myMessages.length
  document.getElementById('stat-requests').textContent = myRequests.length
  document.getElementById('stat-notifications').textContent = unreadCount

  if (childName) {
    document.getElementById('stat-child-name').textContent = childName
    const sec = sections.find(s => s.id === childSection)
    document.getElementById('stat-child-section').textContent = sec ? sec.displayName : childSection || '—'
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById('notification-badge')
  const countEl = document.getElementById('notification-count')
  if (unreadCount > 0) {
    badge.style.display = 'inline'
    countEl.textContent = unreadCount > 99 ? '99+' : unreadCount
  } else {
    badge.style.display = 'none'
  }
}

// ── Tabs ────────────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: 'messages', label: 'Messages', module: MODULES.COMMUNICATION },
  { id: 'requests', label: 'Requests', module: MODULES.REQUESTS },
  { id: 'homework', label: 'Homework', module: MODULES.HOMEWORK },
  { id: 'results', label: 'Results', module: MODULES.RESULTS },
  { id: 'fees', label: 'Fees', module: MODULES.FEES },
  { id: 'transport', label: 'Transport', module: MODULES.TRANSPORT },
  { id: 'notifications', label: 'Notifications', always: true },
]

let activeTabs = []
let currentTab = 'messages'

function renderTabs() {
  activeTabs = ALL_TABS.filter(t => t.always || activeModules.includes(t.module))
  if (activeTabs.length === 0) activeTabs = [{ id: 'notifications', label: 'Notifications' }]

  currentTab = activeTabs[0].id

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
    case 'messages': return renderMessagesTab(container)
    case 'requests': return renderRequestsTab(container)
    case 'homework': return renderHomeworkTab(container)
    case 'results': return renderResultsTab(container)
    case 'fees': return renderFeesTab(container)
    case 'transport': return renderTransportTab(container)
    case 'notifications': return renderNotificationsTab(container)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//   MESSAGES TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderMessagesTab(container) {
  const categoryOptions = MESSAGE_CATEGORIES.map(c =>
    `<option value="${c.value}">${esc(c.label)}</option>`
  ).join('')

  const sectionOptions = childSection
    ? '' // Auto-use child's section
    : sections.map(s => `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header">
        <h2>Send Message</h2>
      </div>
      <form id="msg-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="msg-category">Category *</label>
            <select id="msg-category" required>${categoryOptions}</select>
          </div>
          ${!childSection ? `
          <div class="form-group">
            <label for="msg-section">Section *</label>
            <select id="msg-section" required>
              <option value="">Select section...</option>
              ${sectionOptions}
            </select>
          </div>` : ''}
        </div>
        <div class="form-group">
          <label for="msg-body">Message * <small style="color:var(--text-muted);">(max ${MESSAGE_WORD_LIMIT} words)</small></label>
          <textarea id="msg-body" required rows="3" placeholder="Type your message..."></textarea>
          <div id="msg-word-count" style="font-size:12px;color:var(--text-muted);margin-top:4px;">0 / ${MESSAGE_WORD_LIMIT} words</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button type="submit" class="btn btn-primary btn-sm">Send Message</button>
        </div>
        <div class="dash-form-status" id="msg-form-status"></div>
      </form>

      <h3 style="margin-bottom:12px;">Message History</h3>
      <div id="messages-list"></div>
    </div>
  `

  // Word limit enforcer
  enforceWordLimit('msg-body', MESSAGE_WORD_LIMIT, 'msg-word-count')

  // Form submit
  document.getElementById('msg-form').addEventListener('submit', handleSendMessage)

  // Render message history
  renderMessagesList()
}

async function handleSendMessage(e) {
  e.preventDefault()
  const statusEl = 'msg-form-status'
  const category = document.getElementById('msg-category').value
  const body = document.getElementById('msg-body').value.trim()
  const sectionId = childSection || document.getElementById('msg-section')?.value

  if (!body) {
    toast('Message cannot be empty', 'error')
    return
  }
  if (!sectionId) {
    toast('Please select a section', 'error')
    return
  }

  // Check word limit
  const wordCount = body.split(/\s+/).filter(Boolean).length
  if (wordCount > MESSAGE_WORD_LIMIT) {
    toast(`Message exceeds ${MESSAGE_WORD_LIMIT}-word limit`, 'error')
    return
  }

  // Compute notification chain
  let recipientUids = []
  if (hierarchyLoaded) {
    try {
      const chain = buildNotificationChain(sectionId, category)
      recipientUids = chain.map(r => r.uid).filter(Boolean)
    } catch (err) {
      console.warn('Failed to build notification chain, using fallback:', err)
    }
  }

  // Fallback: if no hierarchy chain, send to all staff
  if (recipientUids.length === 0) {
    const staffRoles = ['super_admin', 'school_admin', 'admin', 'line_manager', 'teacher']
    recipientUids = allUsers
      .filter(u => staffRoles.includes(u.role))
      .map(u => u.id)
  }

  try {
    const catLabel = MESSAGE_CATEGORIES.find(c => c.value === category)?.label || category
    const msgId = await createMessage(schoolId, {
      senderId: user.uid,
      senderName: displayName,
      senderRole: 'parent',
      category,
      subject: `[${catLabel}] from ${displayName}`,
      body,
      sectionId,
      studentName: childName,
      recipientUids,
    })

    // Notify recipients
    await notifyRecipients(schoolId, recipientUids, {
      type: 'message',
      title: `New message: ${catLabel}`,
      body: `${displayName} sent a ${catLabel.toLowerCase()} message`,
      refType: 'messages',
      refId: msgId,
    })

    toast('Message sent!', 'success')
    document.getElementById('msg-form').reset()
    document.getElementById('msg-word-count').textContent = `0 / ${MESSAGE_WORD_LIMIT} words`

    // Reload messages
    messages = await getMessagesForUser(schoolId, user.uid)
    renderMessagesList()
    updateStats()
  } catch (err) {
    console.error('Failed to send message:', err)
    toast('Failed to send message: ' + err.message, 'error')
  }
}

function renderMessagesList() {
  const container = document.getElementById('messages-list')
  if (!container) return

  const myMessages = messages.filter(m => m.senderId === user.uid)

  if (myMessages.length === 0) {
    container.innerHTML = '<div class="dash-empty">No messages sent yet.</div>'
    return
  }

  container.innerHTML = myMessages.map(m => {
    const catLabel = MESSAGE_CATEGORIES.find(c => c.value === m.category)?.label || m.category
    const time = m.createdAt ? timeAgo(m.createdAt) : ''
    const replyCount = (m.replies || []).length
    const hasReplies = replyCount > 0

    let repliesHtml = ''
    if (hasReplies) {
      repliesHtml = `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--gray-200);">
          <strong style="font-size:12px;color:var(--text-muted);">Replies (${replyCount}):</strong>
          ${m.replies.map(r => `
            <div style="margin-top:6px;padding:8px;background:var(--white);border-radius:var(--radius-sm);font-size:13px;">
              <strong>${esc(r.senderName)}</strong>
              <span style="color:var(--text-muted);font-size:11px;">(${esc(r.senderRole.replace(/_/g, ' '))})</span>
              <div style="margin-top:4px;">${esc(r.body)}</div>
            </div>
          `).join('')}
        </div>
      `
    }

    return `
      <div class="dash-list-item" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <span class="section-badge" style="font-size:11px;padding:2px 8px;">${esc(catLabel)}</span>
            ${hasReplies ? '<span style="font-size:11px;color:var(--green);margin-left:6px;">&#10003; replied</span>' : ''}
          </div>
          <span style="font-size:12px;color:var(--text-muted);">${time}</span>
        </div>
        <p style="margin-top:8px;font-size:14px;">${esc(m.body)}</p>
        ${repliesHtml}
      </div>
    `
  }).join('')
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUESTS TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderRequestsTab(container) {
  const typeOptions = REQUEST_TYPES.map(t =>
    `<option value="${t.value}">${esc(t.label)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header">
        <h2>Submit Request</h2>
      </div>
      <form id="req-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="req-type">Request Type *</label>
            <select id="req-type" required>${typeOptions}</select>
          </div>
          <div class="form-group">
            <label for="req-subject">Subject *</label>
            <input type="text" id="req-subject" required placeholder="Brief subject line" />
          </div>
        </div>
        <div class="form-group">
          <label for="req-body">Details *</label>
          <textarea id="req-body" required rows="4" placeholder="Describe your request..."></textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button type="submit" class="btn btn-primary btn-sm">Submit Request</button>
        </div>
        <div class="dash-form-status" id="req-form-status"></div>
      </form>

      <h3 style="margin-bottom:12px;">Request History</h3>
      <div id="requests-list"></div>
    </div>
  `

  document.getElementById('req-form').addEventListener('submit', handleSubmitRequest)
  renderRequestsList()
}

async function handleSubmitRequest(e) {
  e.preventDefault()
  const requestType = document.getElementById('req-type').value
  const subject = document.getElementById('req-subject').value.trim()
  const body = document.getElementById('req-body').value.trim()

  if (!subject || !body) {
    toast('Subject and details are required', 'error')
    return
  }

  const sectionId = childSection

  // Compute escalation chain
  let recipientUids = []
  let escalationChain = []
  if (hierarchyLoaded && sectionId) {
    try {
      const chain = buildEscalationChain(sectionId, requestType)
      escalationChain = chain
      recipientUids = chain.map(r => r.uid).filter(Boolean)
    } catch (err) {
      console.warn('Failed to build escalation chain:', err)
    }
  }

  // Fallback
  if (recipientUids.length === 0) {
    const staffRoles = ['super_admin', 'school_admin', 'admin', 'line_manager', 'teacher']
    recipientUids = allUsers.filter(u => staffRoles.includes(u.role)).map(u => u.id)
  }

  try {
    const typeLabel = REQUEST_TYPES.find(t => t.value === requestType)?.label || requestType
    const reqId = await createRequest(schoolId, {
      senderId: user.uid,
      senderName: displayName,
      senderRole: 'parent',
      requestType,
      subject,
      body,
      sectionId,
      studentName: childName,
      recipientUids,
      escalationChain,
    })

    await notifyRecipients(schoolId, recipientUids, {
      type: 'request',
      title: `New request: ${typeLabel}`,
      body: `${displayName} submitted: ${subject}`,
      refType: 'requests',
      refId: reqId,
    })

    toast('Request submitted!', 'success')
    document.getElementById('req-form').reset()

    requests = await getRequestsForUser(schoolId, user.uid)
    renderRequestsList()
    updateStats()
  } catch (err) {
    console.error('Failed to submit request:', err)
    toast('Failed to submit request: ' + err.message, 'error')
  }
}

function renderRequestsList() {
  const container = document.getElementById('requests-list')
  if (!container) return

  const myRequests = requests.filter(r => r.senderId === user.uid)

  if (myRequests.length === 0) {
    container.innerHTML = '<div class="dash-empty">No requests submitted yet.</div>'
    return
  }

  container.innerHTML = myRequests.map(r => {
    const typeLabel = REQUEST_TYPES.find(t => t.value === r.requestType)?.label || r.requestType
    const time = r.createdAt ? timeAgo(r.createdAt) : ''
    const commentCount = (r.comments || []).length

    let commentsHtml = ''
    if (commentCount > 0) {
      commentsHtml = `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--gray-200);">
          <strong style="font-size:12px;color:var(--text-muted);">Comments (${commentCount}):</strong>
          ${r.comments.map(c => `
            <div style="margin-top:6px;padding:8px;background:var(--white);border-radius:var(--radius-sm);font-size:13px;">
              <strong>${esc(c.name)}</strong>
              <span style="color:var(--text-muted);font-size:11px;">(${esc(c.role.replace(/_/g, ' '))})</span>
              ${statusBadge(c.status)}
              <div style="margin-top:4px;">${esc(c.body)}</div>
            </div>
          `).join('')}
        </div>
      `
    }

    return `
      <div class="dash-list-item" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <span class="section-badge" style="font-size:11px;padding:2px 8px;">${esc(typeLabel)}</span>
            ${statusBadge(r.status)}
          </div>
          <span style="font-size:12px;color:var(--text-muted);">${time}</span>
        </div>
        <p style="margin-top:6px;font-weight:600;font-size:14px;">${esc(r.subject)}</p>
        <p style="margin-top:4px;font-size:13px;color:var(--text-secondary);">${esc(r.body)}</p>
        ${commentsHtml}
      </div>
    `
  }).join('')
}

// ═══════════════════════════════════════════════════════════════════════════
//   HOMEWORK TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderHomeworkTab(container) {
  if (homework.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No homework assigned for your child\'s section yet.</div></div>'
    return
  }

  // We need a studentId to mark completion — look for a student linked to this parent
  // For now use the first student found with this parent's uid
  const studentId = userDoc.linkedStudentId || null

  const items = homework.map(hw => {
    const completions = hw.completions || {}
    const myCompletion = studentId ? completions[studentId] : null
    const isMarked = myCompletion?.parentMarked
    const teacherStatus = myCompletion?.teacherVerified
    const isOverdue = hw.deadline < new Date().toISOString().split('T')[0]

    let statusHtml = ''
    if (teacherStatus === 'approved') statusHtml = '<span style="color:var(--green);font-size:12px;font-weight:600;">&#10003; Verified by teacher</span>'
    else if (teacherStatus === 'incomplete') statusHtml = '<span style="color:var(--orange,#f59e0b);font-size:12px;">Incomplete — redo needed</span>'
    else if (isMarked) statusHtml = '<span style="color:var(--blue);font-size:12px;">Marked complete — awaiting verification</span>'

    return `
      <div class="dash-list-item" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <strong>${esc(hw.title)}</strong>
            <span class="section-badge" style="font-size:11px;padding:2px 8px;margin-left:6px;">${esc(hw.subject)}</span>
          </div>
          <span style="font-size:12px;${isOverdue ? 'color:var(--red);font-weight:600;' : 'color:var(--text-muted);'}">${isOverdue ? 'Overdue' : `Due: ${hw.deadline}`}</span>
        </div>
        ${hw.description ? `<p style="margin-top:6px;font-size:13px;color:var(--text-secondary);">${esc(hw.description)}</p>` : ''}
        <div style="margin-top:8px;font-size:13px;">
          ${statusHtml}
          ${!isMarked && studentId ? `
            <button class="btn btn-primary btn-sm hw-complete" data-hw-id="${esc(hw.id)}" style="margin-top:4px;">Mark as Completed</button>
          ` : ''}
          ${!studentId && !isMarked ? '<span style="color:var(--text-muted);font-size:12px;">Link a student to mark homework</span>' : ''}
        </div>
      </div>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Homework (${homework.length})</h2></div>
      ${items}
    </div>
  `

  // Mark complete handlers
  container.querySelectorAll('.hw-complete').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await markHomeworkCompleted(schoolId, btn.dataset.hwId, studentId)
        toast('Marked as completed!', 'success')
        homework = await getHomeworkBySection(schoolId, childSection)
        renderHomeworkTab(container)
      } catch (err) { toast('Failed to mark: ' + err.message, 'error') }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   RESULTS TAB (parent view — child's exam results with report card print)
// ═══════════════════════════════════════════════════════════════════════════

function renderResultsTab(container) {
  const sid = childStudentId || user.uid
  if (!results.length) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No published results yet.</div></div>'
    return
  }

  const rows = results.map((exam, idx) => {
    const myResults = exam.results?.[sid] || {}
    const subjects = exam.subjects || Object.keys(myResults)
    const totalObtained = subjects.reduce((sum, s) => sum + (myResults[s]?.marks || myResults[s] || 0), 0)
    const totalMax = subjects.reduce((sum, s) => sum + (exam.maxMarks?.[s] || 100), 0)
    const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : '—'
    return `<tr>
      <td>${esc(exam.name)}</td>
      <td>${esc(exam.examType || '—')}</td>
      <td>${totalObtained} / ${totalMax}</td>
      <td>${percentage}%</td>
      <td>${formatDate(exam.publishedAt || exam.createdAt)}</td>
      <td><button class="btn btn-sm btn-secondary print-report-btn" data-exam-idx="${idx}" style="padding:2px 8px;font-size:11px;">Print</button></td>
    </tr>`
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>${childName ? childName + "'s" : "Child's"} Exam Results</h2></div>
      <table class="dash-table">
        <thead><tr><th>Exam</th><th>Type</th><th>Marks</th><th>%</th><th>Date</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `

  container.querySelectorAll('.print-report-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const exam = results[parseInt(btn.dataset.examIdx)]
      const sec = sections.find(s => s.id === childSection)
      const cls = classes.find(c => c.id === sec?.classId)
      printReportCard({
        student: { name: childName || 'Student', rollNumber: '', id: sid },
        exam,
        schoolName: school?.branding?.schoolName || school?.name || '',
        schoolLogo: school?.branding?.logo || '',
        className: cls?.name || '',
        sectionName: sec?.displayName || '',
        primaryColor: school?.branding?.primaryColor || '#2563eb',
        academicYear: school?.academicYear || '',
      })
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   FEES TAB (parent view — read-only fee status)
// ═══════════════════════════════════════════════════════════════════════════

function renderFeesTab(container) {
  if (fees.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No fee records found for your account.</div></div>'
    return
  }

  const rows = fees.map(f => `
    <tr>
      <td>${esc(f.month || '—')}</td>
      <td>${esc(f.feeType || 'tuition')}</td>
      <td style="text-align:right;">Rs. ${f.amount?.toLocaleString() || '—'}</td>
      <td style="text-align:right;">Rs. ${(f.amountPaid ?? f.paid ?? 0).toLocaleString()}</td>
      <td>${statusBadge(f.status)}</td>
      <td style="font-size:12px;color:var(--text-muted);">${f.dueDate ? formatDate(f.dueDate) : '—'}</td>
    </tr>
  `).join('')

  const totalDue = fees.filter(f => f.status !== 'paid').reduce((sum, f) => sum + ((f.amount || 0) - (f.amountPaid ?? f.paid ?? 0)), 0)

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Fee Records</h2></div>
      ${totalDue > 0 ? `<div style="padding:12px;background:#fef2f2;border-radius:var(--radius-sm);margin-bottom:16px;color:#991b1b;"><strong>Total Outstanding: Rs. ${totalDue.toLocaleString()}</strong></div>` : '<div style="padding:12px;background:#f0fdf4;border-radius:var(--radius-sm);margin-bottom:16px;color:#166534;"><strong>All fees paid</strong></div>'}
      <table class="dash-table">
        <thead><tr><th>Month</th><th>Type</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════
//   TRANSPORT TAB (parent view — route info + alternate pickup request)
// ═══════════════════════════════════════════════════════════════════════════

function renderTransportTab(container) {
  const myRoute = userDoc.childTransportRoute
  const route = myRoute ? transportRoutes.find(r => r.id === myRoute) : null

  const relationOptions = PICKUP_RELATIONS.map(r =>
    `<option value="${r.value}">${esc(r.label)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Transport Information</h2></div>
      ${route ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:24px;">
          <div style="padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);"><strong>Route:</strong> ${esc(route.routeName)}</div>
          <div style="padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);"><strong>Driver:</strong> ${esc(route.driverName || '—')}</div>
          <div style="padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);"><strong>Phone:</strong> ${esc(route.driverPhone || '—')}</div>
          <div style="padding:12px;background:var(--gray-50);border-radius:var(--radius-sm);"><strong>Vehicle:</strong> ${esc(route.vehicleNumber || '—')}</div>
        </div>
        ${route.stops?.length ? `<p><strong>Stops:</strong> ${route.stops.map(s => esc(s)).join(' → ')}</p>` : ''}
      ` : '<div class="dash-empty" style="margin-bottom:24px;">No transport route assigned for your child.</div>'}

      <div class="dash-section-header"><h2>Request Alternate Pickup</h2></div>
      <form id="pickup-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);">
        <div class="dash-form-row-2">
          <div class="form-group"><label>Pickup Person Name *</label><input type="text" id="pickup-name" required placeholder="Full name"></div>
          <div class="form-group"><label>Relation *</label><select id="pickup-relation" required>${relationOptions}</select></div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group"><label>National ID *</label><input type="text" id="pickup-id" required placeholder="National ID number"></div>
          <div class="form-group"><label>Phone</label><input type="text" id="pickup-phone" placeholder="Phone number"></div>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" id="pickup-date" required>
        </div>
        <div class="form-group">
          <label>Reason</label>
          <textarea id="pickup-reason" rows="2" placeholder="Why is alternate pickup needed?"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Submit Request</button>
        <div class="dash-form-status" id="pickup-status"></div>
      </form>
    </div>
  `

  document.getElementById('pickup-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('pickup-status')
    statusEl.textContent = 'Submitting...'
    statusEl.className = 'dash-form-status status-sending'

    try {
      await createTransportRequest(schoolId, {
        parentId: user.uid,
        parentName: displayName,
        studentId: userDoc.childStudentId || '',
        studentName: childName,
        requestType: 'alternate_pickup',
        pickupPerson: {
          name: document.getElementById('pickup-name').value.trim(),
          relation: document.getElementById('pickup-relation').value,
          nationalId: document.getElementById('pickup-id').value.trim(),
          phone: document.getElementById('pickup-phone').value.trim(),
        },
        date: document.getElementById('pickup-date').value,
        reason: document.getElementById('pickup-reason').value.trim(),
      })
      statusEl.textContent = 'Request submitted!'
      statusEl.className = 'dash-form-status status-success'
      document.getElementById('pickup-form').reset()
      toast('Transport request submitted', 'success')
    } catch (err) {
      statusEl.textContent = 'Failed to submit'
      statusEl.className = 'dash-form-status status-error'
      toast('Failed: ' + err.message, 'error')
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   NOTIFICATIONS TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderNotificationsTab(container) {
  if (notifications.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No notifications yet.</div></div>'
    return
  }

  const items = notifications.map(n => {
    const time = n.createdAt ? timeAgo(n.createdAt) : ''
    const isUnread = !n.read
    return `
      <div class="dash-list-item${isUnread ? ' notification-unread' : ''}" style="margin-bottom:8px;cursor:pointer;" data-notif-id="${esc(n.id)}">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            ${isUnread ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--brand-primary);margin-right:6px;"></span>' : ''}
            <strong style="font-size:14px;">${esc(n.title)}</strong>
          </div>
          <span style="font-size:12px;color:var(--text-muted);">${time}</span>
        </div>
        ${n.body ? `<p style="margin-top:4px;font-size:13px;color:var(--text-secondary);">${esc(n.body)}</p>` : ''}
      </div>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header">
        <h2>Notifications</h2>
        ${unreadCount > 0 ? `<button class="btn btn-secondary btn-sm" id="mark-all-read">Mark All Read</button>` : ''}
      </div>
      ${items}
    </div>
  `

  // Mark individual notification as read on click
  container.querySelectorAll('[data-notif-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.notifId
      await markNotificationRead(schoolId, id)
      el.classList.remove('notification-unread')
      el.querySelector('span[style*="border-radius:50%"]')?.remove()
      unreadCount = Math.max(0, unreadCount - 1)
      updateNotificationBadge()
      document.getElementById('stat-notifications').textContent = unreadCount
    })
  })

  // Mark all read
  document.getElementById('mark-all-read')?.addEventListener('click', async () => {
    const unread = notifications.filter(n => !n.read)
    await Promise.all(unread.map(n => markNotificationRead(schoolId, n.id)))
    unreadCount = 0
    notifications.forEach(n => n.read = true)
    updateNotificationBadge()
    document.getElementById('stat-notifications').textContent = 0
    renderNotificationsTab(container)
    toast('All notifications marked as read', 'success')
  })
}

// Notification badge click → switch to notifications tab
document.getElementById('notification-badge')?.addEventListener('click', () => {
  const notifBtn = document.querySelector('[data-tab="notifications"]')
  if (notifBtn) notifBtn.click()
})

// ── Init ────────────────────────────────────────────────────────────────
await loadAll()
