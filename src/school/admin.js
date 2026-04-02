/**
 * SchoolOS — Sub-Admin Dashboard
 * Protected page: requires auth + admin role
 *
 * Dynamically adapts based on adminSubRole:
 *   - receptionist: messages/requests overview, student lookup
 *   - accountant: fee overview, payment tracking
 *   - coordinator: all sections overview, staff management
 *   - requisition_incharge: requisition management
 *
 * Module tabs are shown/hidden based on school's active modules.
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import {
  getSections, getSchoolUsers, getAllStudents, getClasses,
  getAllMessages, markMessageRead, addMessageReply,
  getAllRequests, updateRequestStatus, markRequestRead,
  getOutstandingFees, getFeesByMonth, recordPayment, bulkCreateFees,
  getAllRequisitions, approveRequisition, getCatalogue, addCatalogueItem,
  getPaperRequisitions, approvePaperRequisition,
  getTransportRoutes, getTransportRequests, createTransportRoute,
  getLibraryBooks, getLibraryTransactions, addLibraryBook, returnBook,
  getSchoolEvents, createSchoolEvent, updateSchoolEvent, deleteSchoolEvent, getEventsByMonth,
} from '../firebase/schools.js'
import { MODULES, MESSAGE_CATEGORIES, REQUEST_TYPES } from '../shared/constants.js'
import {
  esc, formatDate, timeAgo, toast, statusBadge,
} from '../shared/components.js'
import { exportStudentsCSV, exportFeesCSV } from '../shared/csv-export.js'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user, role, userDoc, school } = await initGuard({
  requireAuth: true,
  allowedRoles: ['admin'],
  loadSchool: true,
})

const schoolId = userDoc.schoolId
const subRole = userDoc.adminSubRole || 'receptionist'
const activeModules = school?.activeModules || []

// ── Header ──────────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName

const subRoleLabels = {
  receptionist: 'Receptionist',
  accountant: 'Accountant',
  coordinator: 'Coordinator',
  requisition_incharge: 'Requisition Incharge',
}
const subRoleDescriptions = {
  receptionist: 'Handle messages, requests, and student information.',
  accountant: 'Manage fee records and payment tracking.',
  coordinator: 'Oversee all sections and staff.',
  requisition_incharge: 'Manage requisitions and inventory.',
}

document.getElementById('role-badge').textContent = subRoleLabels[subRole] || 'Admin'
document.getElementById('page-title').textContent = `${subRoleLabels[subRole] || 'Admin'} Dashboard`
document.getElementById('role-description').textContent = subRoleDescriptions[subRole] || ''

document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── State ───────────────────────────────────────────────────────────────
let sections = []
let users = []
let students = []
let classes = []
let allMessages = []
let allReqs = []
let outstandingFees = []
let allRequisitions = []
let catalogue = []
let transportRoutes = []
let transportRequests = []
let libraryBooks = []
let libraryTxns = []
let events = []
let paperRequisitions = []

// ── Load Data ───────────────────────────────────────────────────────────
async function loadAll() {
  try {
    ;[sections, users, students, classes, allMessages, allReqs, outstandingFees, allRequisitions, catalogue, transportRoutes, transportRequests, libraryBooks, libraryTxns, events, paperRequisitions] = await Promise.all([
      getSections(schoolId),
      getSchoolUsers(schoolId),
      getAllStudents(schoolId),
      getClasses(schoolId),
      getAllMessages(schoolId).catch(() => []),
      getAllRequests(schoolId).catch(() => []),
      getOutstandingFees(schoolId).catch(() => []),
      getAllRequisitions(schoolId).catch(() => []),
      getCatalogue(schoolId).catch(() => []),
      getTransportRoutes(schoolId).catch(() => []),
      getTransportRequests(schoolId).catch(() => []),
      getLibraryBooks(schoolId).catch(() => []),
      getLibraryTransactions(schoolId).catch(() => []),
      getSchoolEvents(schoolId).catch(() => []),
      getPaperRequisitions(schoolId).catch(() => []),
    ])
    updateStats()
    renderTabs()
    renderActiveTab()
  } catch (err) {
    console.error('Failed to load data:', err)
    toast('Failed to load school data', 'error')
  }
}

function updateStats() {
  document.getElementById('stat-users').textContent = users.length
  document.getElementById('stat-students').textContent = students.length
  document.getElementById('stat-sections').textContent = sections.length
  document.getElementById('stat-pending').textContent = outstandingFees.length + allReqs.filter(r => r.status === 'pending').length
}

// ── Dynamic Tabs based on sub-role + active modules ─────────────────────

const TAB_CONFIG = {
  receptionist: [
    { id: 'overview', label: 'Overview', icon: 'grid', always: true },
    { id: 'messages', label: 'Messages', icon: 'mail', module: MODULES.COMMUNICATION },
    { id: 'requests', label: 'Requests', icon: 'inbox', module: MODULES.REQUESTS },
    { id: 'transport', label: 'Transport', icon: 'truck', module: MODULES.TRANSPORT },
    { id: 'students', label: 'Students', icon: 'users', always: true },
  ],
  accountant: [
    { id: 'overview', label: 'Overview', icon: 'grid', always: true },
    { id: 'fees', label: 'Fees', icon: 'dollar', module: MODULES.FEES },
    { id: 'library', label: 'Library', icon: 'book', module: MODULES.LIBRARY },
    { id: 'students', label: 'Students', icon: 'users', always: true },
  ],
  coordinator: [
    { id: 'overview', label: 'Overview', icon: 'grid', always: true },
    { id: 'sections', label: 'Sections', icon: 'layout', always: true },
    { id: 'staff', label: 'Staff', icon: 'users', always: true },
    { id: 'messages', label: 'Messages', icon: 'mail', module: MODULES.COMMUNICATION },
    { id: 'requests', label: 'Requests', icon: 'inbox', module: MODULES.REQUESTS },
    { id: 'events', label: 'Events', icon: 'calendar', module: MODULES.EVENTS },
    { id: 'transport', label: 'Transport', icon: 'truck', module: MODULES.TRANSPORT },
    { id: 'library', label: 'Library', icon: 'book', module: MODULES.LIBRARY },
  ],
  requisition_incharge: [
    { id: 'overview', label: 'Overview', icon: 'grid', always: true },
    { id: 'requisitions', label: 'Requisitions', icon: 'clipboard', module: MODULES.REQUISITION },
    { id: 'catalogue', label: 'Catalogue', icon: 'list', module: MODULES.REQUISITION },
  ],
}

let activeTabs = []
let currentTab = 'overview'

function renderTabs() {
  const config = TAB_CONFIG[subRole] || TAB_CONFIG.receptionist
  activeTabs = config.filter(t => t.always || activeModules.includes(t.module))

  const container = document.getElementById('tab-buttons')
  container.innerHTML = activeTabs.map((t, i) =>
    `<button class="dash-tab${i === 0 ? ' active' : ''}" data-tab="${t.id}">
      ${t.label}
    </button>`
  ).join('')

  // Bind tab clicks
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
    case 'overview': return renderOverview(container)
    case 'students': return renderStudents(container)
    case 'sections': return renderSections(container)
    case 'staff': return renderStaff(container)
    case 'messages': return renderAllMessages(container)
    case 'requests': return renderAllRequests(container)
    case 'fees': return renderFeesTab(container)
    case 'requisitions': return renderRequisitionsTab(container)
    case 'catalogue': return renderCatalogueTab(container)
    case 'transport': return renderTransportTab(container)
    case 'library': return renderLibraryTab(container)
    case 'events': return loadMonthEvents().then(() => renderEventsTab(container))
    default: return renderOverview(container)
  }
}

function renderOverview(container) {
  const classCount = classes.length
  const sectionCount = sections.length
  const staffCount = users.filter(u => ['admin', 'teacher', 'line_manager', 'super_admin', 'school_admin'].includes(u.role)).length
  const parentCount = users.filter(u => u.role === 'parent').length

  container.innerHTML = `
    <div class="dash-section">
      <h2>School Overview</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-top:16px;">
        <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-sm);">
          <div style="font-size:24px;font-weight:700;color:var(--brand-primary);">${classCount}</div>
          <div style="font-size:13px;color:var(--text-muted);">Classes</div>
        </div>
        <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-sm);">
          <div style="font-size:24px;font-weight:700;color:var(--brand-primary);">${sectionCount}</div>
          <div style="font-size:13px;color:var(--text-muted);">Sections</div>
        </div>
        <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-sm);">
          <div style="font-size:24px;font-weight:700;color:var(--brand-primary);">${staffCount}</div>
          <div style="font-size:13px;color:var(--text-muted);">Staff Members</div>
        </div>
        <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-sm);">
          <div style="font-size:24px;font-weight:700;color:var(--brand-primary);">${parentCount}</div>
          <div style="font-size:13px;color:var(--text-muted);">Parents</div>
        </div>
        <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-sm);">
          <div style="font-size:24px;font-weight:700;color:var(--brand-primary);">${students.length}</div>
          <div style="font-size:13px;color:var(--text-muted);">Students</div>
        </div>
      </div>
    </div>
  `
}

function renderStudents(container) {
  if (students.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No students enrolled yet.</div></div>'
    return
  }

  const rows = students.map(s => {
    const sec = sections.find(sec => sec.id === s.sectionId)
    return `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${sec ? esc(sec.displayName) : '—'}</td>
        <td>${esc(s.rollNumber || '—')}</td>
        <td>${esc(s.gender || '—')}</td>
        <td style="font-size:13px;color:var(--text-muted);">${s.admissionDate ? formatDate(s.admissionDate) : '—'}</td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header">
        <h2>Students (${students.length})</h2>
        <button class="btn btn-sm btn-secondary" id="export-students-btn">Export CSV</button>
      </div>
      <table class="dash-table">
        <thead><tr><th>Name</th><th>Section</th><th>Roll #</th><th>Gender</th><th>Admitted</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `

  document.getElementById('export-students-btn')?.addEventListener('click', () => {
    const exportData = students.map(s => {
      const sec = sections.find(sec => sec.id === s.sectionId)
      const cls = classes.find(c => sec && c.id === sec.classId)
      return {
        name: s.name || '',
        rollNo: s.rollNumber || '',
        section: sec?.displayName || '',
        class: cls?.name || '',
        parentName: s.parentName || '',
        parentPhone: s.parentPhone || '',
        status: s.status || 'active',
      }
    })
    exportStudentsCSV(exportData)
    toast('Students CSV downloaded', 'success')
  })
}

function renderSections(container) {
  if (sections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections defined yet.</div></div>'
    return
  }

  const rows = sections.map(s => {
    const ht = s.homeTeacherId ? users.find(u => u.id === s.homeTeacherId) : null
    const lm = s.lineManagerId ? users.find(u => u.id === s.lineManagerId) : null
    const count = students.filter(st => st.sectionId === s.id).length
    return `
      <tr>
        <td><strong>${esc(s.displayName)}</strong></td>
        <td>${ht ? esc(ht.displayName) : '<span style="color:var(--text-muted);">unassigned</span>'}</td>
        <td>${lm ? esc(lm.displayName) : '<span style="color:var(--text-muted);">unassigned</span>'}</td>
        <td>${count}</td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>All Sections (${sections.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>Section</th><th>Home Teacher</th><th>Line Manager</th><th>Students</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderStaff(container) {
  const staffRoles = ['super_admin', 'school_admin', 'admin', 'line_manager', 'teacher']
  const staff = users.filter(u => staffRoles.includes(u.role)).sort((a, b) =>
    (a.displayName || '').localeCompare(b.displayName || '')
  )

  if (staff.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No staff members found.</div></div>'
    return
  }

  const rows = staff.map(u => `
    <tr>
      <td><strong>${esc(u.displayName || '—')}</strong></td>
      <td>${esc(u.role.replace(/_/g, ' '))}</td>
      <td style="font-size:13px;color:var(--text-muted);">${esc(u.email || '—')}</td>
    </tr>
  `).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Staff (${staff.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>Name</th><th>Role</th><th>Email</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════
//   FEES TAB (accountant + coordinator)
// ═══════════════════════════════════════════════════════════════════════════

function renderFeesTab(container) {
  const currentMonth = new Date().toISOString().slice(0, 7)

  const classOptions = classes.map(c =>
    `<option value="${esc(c.id)}">${esc(c.name)}</option>`
  ).join('')

  const outstandingRows = outstandingFees.slice(0, 50).map(f => {
    const sec = sections.find(s => s.id === f.sectionId)
    return `
      <tr>
        <td><strong>${esc(f.studentName)}</strong></td>
        <td>${sec ? esc(sec.displayName) : '—'}</td>
        <td>${esc(f.month)}</td>
        <td style="text-align:right;">Rs. ${f.amountDue?.toLocaleString() || 0}</td>
        <td style="text-align:right;">Rs. ${f.amountPaid?.toLocaleString() || 0}</td>
        <td>${statusBadge(f.status)}</td>
        <td>
          <button class="btn btn-sm btn-primary record-payment" data-fee-id="${esc(f.id)}" data-due="${f.amountDue - f.amountPaid}" style="padding:2px 8px;font-size:11px;">Record Payment</button>
        </td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Generate Monthly Fees</h2></div>
      <form id="fee-gen-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="fee-class">Class *</label>
            <select id="fee-class" required>${classOptions}</select>
          </div>
          <div class="form-group">
            <label for="fee-month">Month *</label>
            <input type="month" id="fee-month" required value="${currentMonth}" />
          </div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="fee-amount">Amount (Rs.) *</label>
            <input type="number" id="fee-amount" required min="1" placeholder="e.g. 5000" />
          </div>
          <div class="form-group">
            <label for="fee-due">Due Date *</label>
            <input type="date" id="fee-due" required />
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Generate Fees</button>
        <div class="dash-form-status" id="fee-form-status"></div>
      </form>

      <div class="dash-section-header">
        <h2>Outstanding Fees (${outstandingFees.length})</h2>
        ${outstandingFees.length > 0 ? '<button class="btn btn-sm btn-secondary" id="export-fees-btn">Export CSV</button>' : ''}
      </div>
      ${outstandingFees.length > 0 ? `
        <table class="dash-table">
          <thead><tr><th>Student</th><th>Section</th><th>Month</th><th>Due</th><th>Paid</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${outstandingRows}</tbody>
        </table>
      ` : '<div class="dash-empty">No outstanding fees.</div>'}
    </div>
  `

  // Export fees CSV
  document.getElementById('export-fees-btn')?.addEventListener('click', () => {
    const exportData = outstandingFees.map(f => ({
      studentName: f.studentName || '',
      month: f.month || '',
      feeType: f.feeType || 'monthly',
      amount: f.amountDue || 0,
      paid: f.amountPaid || 0,
      balance: (f.amountDue || 0) - (f.amountPaid || 0),
      status: f.status || '',
    }))
    exportFeesCSV(exportData)
    toast('Fees CSV downloaded', 'success')
  })

  // Generate fees
  document.getElementById('fee-gen-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const classId = document.getElementById('fee-class').value
    const month = document.getElementById('fee-month').value
    const amount = parseInt(document.getElementById('fee-amount').value)
    const dueDate = document.getElementById('fee-due').value

    if (!classId || !month || !amount) return

    // Get students for this class
    const classStudents = students.filter(s => s.classId === classId)
    if (classStudents.length === 0) {
      toast('No students in this class', 'error')
      return
    }

    try {
      await bulkCreateFees(schoolId, classStudents, { month, amount, feeType: 'monthly', dueDate })
      toast(`Fees generated for ${classStudents.length} students`, 'success')
      document.getElementById('fee-gen-form').reset()
      outstandingFees = await getOutstandingFees(schoolId)
      renderFeesTab(container)
    } catch (err) { toast('Failed: ' + err.message, 'error') }
  })

  // Record payment
  container.querySelectorAll('.record-payment').forEach(btn => {
    btn.addEventListener('click', async () => {
      const feeId = btn.dataset.feeId
      const remaining = parseInt(btn.dataset.due) || 0
      const amountStr = prompt(`Enter payment amount (remaining: Rs. ${remaining}):`)
      if (!amountStr) return
      const amount = parseInt(amountStr)
      if (isNaN(amount) || amount <= 0) { toast('Invalid amount', 'error'); return }

      try {
        await recordPayment(schoolId, feeId, {
          amount,
          method: 'cash',
          recordedBy: displayName,
        })
        toast('Payment recorded', 'success')
        outstandingFees = await getOutstandingFees(schoolId)
        renderFeesTab(container)
      } catch (err) { toast('Failed: ' + err.message, 'error') }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   MESSAGES (admin sees all school messages)
// ═══════════════════════════════════════════════════════════════════════════

function renderAllMessages(container) {
  if (allMessages.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No messages in the system yet.</div></div>'
    return
  }

  const items = allMessages.slice(0, 50).map(m => {
    const catLabel = MESSAGE_CATEGORIES.find(c => c.value === m.category)?.label || m.category
    const time = m.createdAt ? timeAgo(m.createdAt) : ''
    const replyCount = (m.replies || []).length

    return `
      <tr>
        <td><strong>${esc(m.senderName)}</strong></td>
        <td><span class="section-badge" style="font-size:11px;padding:2px 8px;">${esc(catLabel)}</span></td>
        <td style="font-size:13px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.body)}</td>
        <td>${replyCount > 0 ? `<span style="color:var(--green);">${replyCount} reply</span>` : '<span style="color:var(--text-muted);">none</span>'}</td>
        <td style="font-size:12px;color:var(--text-muted);">${time}</td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>All Messages (${allMessages.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>From</th><th>Category</th><th>Message</th><th>Replies</th><th>Time</th></tr></thead>
        <tbody>${items}</tbody>
      </table>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUESTS (admin sees all school requests)
// ═══════════════════════════════════════════════════════════════════════════

function renderAllRequests(container) {
  if (allReqs.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No requests in the system yet.</div></div>'
    return
  }

  const items = allReqs.slice(0, 50).map(r => {
    const typeLabel = REQUEST_TYPES.find(t => t.value === r.requestType)?.label || r.requestType
    const time = r.createdAt ? timeAgo(r.createdAt) : ''

    return `
      <tr>
        <td><strong>${esc(r.senderName)}</strong></td>
        <td><span class="section-badge" style="font-size:11px;padding:2px 8px;">${esc(typeLabel)}</span></td>
        <td style="font-size:13px;">${esc(r.subject)}</td>
        <td>${statusBadge(r.status)}</td>
        <td style="font-size:12px;color:var(--text-muted);">${time}</td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>All Requests (${allReqs.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>From</th><th>Type</th><th>Subject</th><th>Status</th><th>Time</th></tr></thead>
        <tbody>${items}</tbody>
      </table>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUISITIONS TAB (requisition_incharge view)
// ═══════════════════════════════════════════════════════════════════════════

function renderRequisitionsTab(container) {
  const hasReqs = allRequisitions.length > 0
  const hasPaper = paperRequisitions.length > 0

  if (!hasReqs && !hasPaper) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No requisitions submitted yet.</div></div>'
    return
  }

  const rows = allRequisitions.map(r => {
    const sec = sections.find(s => s.id === r.sectionId)
    const isPending = r.status === 'submitted' || r.status === 'reviewed'
    return `
      <tr>
        <td><strong>${esc(r.teacherName)}</strong></td>
        <td>${sec ? esc(sec.displayName) : '—'}</td>
        <td>${r.totalItems} item(s)</td>
        <td>${statusBadge(r.status)}</td>
        <td style="font-size:12px;color:var(--text-muted);">${r.createdAt ? timeAgo(r.createdAt) : '—'}</td>
        <td>
          ${isPending ? `
            <button class="btn btn-sm req-approve" data-id="${esc(r.id)}" data-action="approved" style="background:var(--green);color:#fff;padding:2px 8px;font-size:11px;">Approve</button>
            <button class="btn btn-sm req-approve" data-id="${esc(r.id)}" data-action="dispatched" style="padding:2px 8px;font-size:11px;">Dispatch</button>
          ` : ''}
        </td>
      </tr>
    `
  }).join('')

  const paperRows = paperRequisitions.map(r => {
    const isPending = r.status === 'submitted' || r.status === 'reviewed'
    const reams = ((r.adjustedSheets || r.totalSheets || 0) / 500).toFixed(1)
    return `
      <tr>
        <td><strong>${esc(r.teacherName)}</strong></td>
        <td>${esc(r.sectionName || '—')}</td>
        <td>${esc(r.examType || '—')}</td>
        <td>${(r.subjects || []).length} subject(s)</td>
        <td><strong>${r.adjustedSheets || r.totalSheets || 0}</strong> <span style="font-size:11px;color:var(--text-muted);">(${reams} reams)</span></td>
        <td>${statusBadge(r.status)}</td>
        <td style="font-size:12px;color:var(--text-muted);">${r.createdAt ? timeAgo(r.createdAt) : '—'}</td>
        <td>
          ${isPending ? `
            <button class="btn btn-sm paper-req-approve" data-id="${esc(r.id)}" data-action="approved" style="background:var(--green);color:#fff;padding:2px 8px;font-size:11px;">Approve</button>
            <button class="btn btn-sm paper-req-approve" data-id="${esc(r.id)}" data-action="dispatched" style="padding:2px 8px;font-size:11px;">Dispatch</button>
          ` : ''}
        </td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    ${hasReqs ? `
    <div class="dash-section">
      <div class="dash-section-header"><h2>All Requisitions (${allRequisitions.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>Teacher</th><th>Section</th><th>Items</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ` : ''}

    ${hasPaper ? `
    <div class="dash-section" style="margin-top:24px;">
      <div class="dash-section-header"><h2>Paper Requisitions (${paperRequisitions.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>Teacher</th><th>Section</th><th>Exam</th><th>Subjects</th><th>Sheets</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead>
        <tbody>${paperRows}</tbody>
      </table>
    </div>
    ` : ''}
  `

  container.querySelectorAll('.req-approve').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await approveRequisition(schoolId, btn.dataset.id, btn.dataset.action)
        toast(`Requisition ${btn.dataset.action}`, 'success')
        allRequisitions = await getAllRequisitions(schoolId)
        renderRequisitionsTab(container)
      } catch (err) { toast('Failed', 'error') }
    })
  })

  container.querySelectorAll('.paper-req-approve').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await approvePaperRequisition(schoolId, btn.dataset.id, btn.dataset.action)
        toast(`Paper requisition ${btn.dataset.action}`, 'success')
        paperRequisitions = await getPaperRequisitions(schoolId)
        renderRequisitionsTab(container)
      } catch (err) { toast('Failed', 'error') }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   CATALOGUE TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderCatalogueTab(container) {
  const rows = catalogue.map(item => `
    <tr>
      <td><strong>${esc(item.name)}</strong></td>
      <td>${esc(item.category)}</td>
      <td>${esc(item.unit)}</td>
      <td>${item.currentStock}</td>
    </tr>
  `).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Catalogue (${catalogue.length} items)</h2></div>
      <form id="cat-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="cat-name">Item Name *</label>
            <input type="text" id="cat-name" required placeholder="e.g. Whiteboard Marker" />
          </div>
          <div class="form-group">
            <label for="cat-category">Category</label>
            <input type="text" id="cat-category" placeholder="e.g. Stationery" />
          </div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="cat-unit">Unit</label>
            <input type="text" id="cat-unit" value="pcs" placeholder="pcs, box, ream" />
          </div>
          <div class="form-group">
            <label for="cat-stock">Current Stock</label>
            <input type="number" id="cat-stock" value="0" min="0" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Add Item</button>
      </form>
      ${catalogue.length > 0 ? `
        <table class="dash-table">
          <thead><tr><th>Name</th><th>Category</th><th>Unit</th><th>Stock</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      ` : '<div class="dash-empty">No catalogue items yet.</div>'}
    </div>
  `

  document.getElementById('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const name = document.getElementById('cat-name').value.trim()
    const category = document.getElementById('cat-category').value.trim() || 'general'
    const unit = document.getElementById('cat-unit').value.trim() || 'pcs'
    const currentStock = parseInt(document.getElementById('cat-stock').value) || 0

    if (!name) return
    try {
      await addCatalogueItem(schoolId, { name, category, unit, currentStock })
      toast('Item added', 'success')
      document.getElementById('cat-form').reset()
      catalogue = await getCatalogue(schoolId)
      renderCatalogueTab(container)
    } catch (err) { toast('Failed: ' + err.message, 'error') }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   TRANSPORT TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderTransportTab(container) {
  const routeRows = transportRoutes.map(r => `
    <tr>
      <td><strong>${esc(r.routeName)}</strong></td>
      <td>${esc(r.driverName || '—')}</td>
      <td>${esc(r.driverPhone || '—')}</td>
      <td>${esc(r.vehicleNumber || '—')}</td>
      <td>${(r.stops || []).length} stops</td>
    </tr>
  `).join('')

  const reqRows = transportRequests.slice(0, 30).map(r => `
    <tr>
      <td>${esc(r.parentName)}</td>
      <td>${esc(r.studentName)}</td>
      <td>${esc(r.requestType?.replace(/_/g, ' ') || '—')}</td>
      <td>${esc(r.pickupPerson?.name || '—')} (${esc(r.pickupPerson?.relation || '')})</td>
      <td>${statusBadge(r.status)}</td>
      <td style="font-size:12px;">${r.createdAt ? timeAgo(r.createdAt) : '—'}</td>
    </tr>
  `).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Add Route</h2></div>
      <form id="route-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group"><label>Route Name *</label><input type="text" id="route-name" required placeholder="e.g. Route A — North"></div>
          <div class="form-group"><label>Driver Name</label><input type="text" id="route-driver" placeholder="Driver name"></div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group"><label>Driver Phone</label><input type="text" id="route-phone" placeholder="Phone number"></div>
          <div class="form-group"><label>Vehicle Number</label><input type="text" id="route-vehicle" placeholder="e.g. ABC-1234"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Add Route</button>
      </form>

      <div class="dash-section-header"><h2>Routes (${transportRoutes.length})</h2></div>
      ${transportRoutes.length > 0 ? `
        <table class="dash-table"><thead><tr><th>Route</th><th>Driver</th><th>Phone</th><th>Vehicle</th><th>Stops</th></tr></thead>
        <tbody>${routeRows}</tbody></table>
      ` : '<div class="dash-empty">No routes defined.</div>'}

      ${transportRequests.length > 0 ? `
        <div class="dash-section-header" style="margin-top:24px;"><h2>Transport Requests (${transportRequests.length})</h2></div>
        <table class="dash-table"><thead><tr><th>Parent</th><th>Student</th><th>Type</th><th>Pickup Person</th><th>Status</th><th>Time</th></tr></thead>
        <tbody>${reqRows}</tbody></table>
      ` : ''}
    </div>
  `

  document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const routeName = document.getElementById('route-name').value.trim()
    if (!routeName) return
    try {
      await createTransportRoute(schoolId, {
        routeName,
        driverName: document.getElementById('route-driver').value.trim(),
        driverPhone: document.getElementById('route-phone').value.trim(),
        vehicleNumber: document.getElementById('route-vehicle').value.trim(),
      })
      toast('Route added', 'success')
      document.getElementById('route-form').reset()
      transportRoutes = await getTransportRoutes(schoolId)
      renderTransportTab(container)
    } catch (err) { toast('Failed: ' + err.message, 'error') }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   LIBRARY TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderLibraryTab(container) {
  const bookRows = libraryBooks.map(b => `
    <tr>
      <td><strong>${esc(b.title)}</strong></td>
      <td>${esc(b.author || '—')}</td>
      <td>${esc(b.category || '—')}</td>
      <td>${b.availableCopies || 0} / ${b.copies || 0}</td>
      <td>${esc(b.barcode || '—')}</td>
    </tr>
  `).join('')

  const txnRows = libraryTxns.slice(0, 30).map(t => `
    <tr>
      <td>${esc(t.bookTitle)}</td>
      <td>${esc(t.borrowerName)}</td>
      <td>${esc(t.borrowerType || '—')}</td>
      <td>${formatDate(t.issueDate)}</td>
      <td>${formatDate(t.dueDate)}</td>
      <td>${t.returnDate ? formatDate(t.returnDate) : '—'}</td>
      <td>${statusBadge(t.status === 'issued' ? 'pending' : 'approved')}</td>
      <td>${t.status === 'issued' ? `<button class="btn btn-sm btn-primary return-book" data-txn="${esc(t.id)}" data-book="${esc(t.bookId)}" style="padding:2px 8px;font-size:11px;">Return</button>` : ''}</td>
    </tr>
  `).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Add Book</h2></div>
      <form id="book-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group"><label>Title *</label><input type="text" id="book-title" required placeholder="Book title"></div>
          <div class="form-group"><label>Author</label><input type="text" id="book-author" placeholder="Author name"></div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group"><label>Category</label><input type="text" id="book-category" placeholder="e.g. Science"></div>
          <div class="form-group"><label>Copies</label><input type="number" id="book-copies" value="1" min="1"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Add Book</button>
      </form>

      <div class="dash-section-header"><h2>Books (${libraryBooks.length})</h2></div>
      ${libraryBooks.length > 0 ? `
        <table class="dash-table"><thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Available</th><th>Barcode</th></tr></thead>
        <tbody>${bookRows}</tbody></table>
      ` : '<div class="dash-empty">No books in library.</div>'}

      ${libraryTxns.length > 0 ? `
        <div class="dash-section-header" style="margin-top:24px;"><h2>Transactions (${libraryTxns.length})</h2></div>
        <table class="dash-table"><thead><tr><th>Book</th><th>Borrower</th><th>Type</th><th>Issued</th><th>Due</th><th>Returned</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${txnRows}</tbody></table>
      ` : ''}
    </div>
  `

  document.getElementById('book-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const title = document.getElementById('book-title').value.trim()
    if (!title) return
    try {
      await addLibraryBook(schoolId, {
        title,
        author: document.getElementById('book-author').value.trim(),
        category: document.getElementById('book-category').value.trim(),
        copies: parseInt(document.getElementById('book-copies').value) || 1,
      })
      toast('Book added', 'success')
      document.getElementById('book-form').reset()
      libraryBooks = await getLibraryBooks(schoolId)
      renderLibraryTab(container)
    } catch (err) { toast('Failed: ' + err.message, 'error') }
  })

  container.querySelectorAll('.return-book').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await returnBook(schoolId, btn.dataset.txn, btn.dataset.book)
        toast('Book returned', 'success')
        libraryTxns = await getLibraryTransactions(schoolId)
        libraryBooks = await getLibraryBooks(schoolId)
        renderLibraryTab(container)
      } catch (err) { toast('Failed', 'error') }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   EVENTS TAB — Full Calendar View
// ═══════════════════════════════════════════════════════════════════════════

const EVENT_CATEGORIES = [
  { value: 'academic', label: 'Academic' },
  { value: 'exam', label: 'Exam' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'sports', label: 'Sports' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'requisition', label: 'Requisition' },
  { value: 'general', label: 'General' },
]

let calendarMonth = new Date().getMonth()     // 0-indexed
let calendarYear = new Date().getFullYear()
let monthEvents = []
let selectedDay = null
let editingEventId = null

function yearMonthStr(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

async function loadMonthEvents() {
  try {
    monthEvents = await getEventsByMonth(schoolId, yearMonthStr(calendarYear, calendarMonth))
  } catch {
    monthEvents = events.filter(e => {
      if (!e.date) return false
      const [ey, em] = e.date.split('-').map(Number)
      return ey === calendarYear && em === calendarMonth + 1
    })
  }
}

function buildCalendarGrid() {
  const firstDay = new Date(calendarYear, calendarMonth, 1)
  // Monday=0 ... Sunday=6
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const prevMonthDays = new Date(calendarYear, calendarMonth, 0).getDate()

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const headers = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    .map(d => `<div class="event-cal-header">${d}</div>`).join('')

  const cells = []
  // Previous month trailing days
  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    cells.push(`<div class="event-cal-day other-month"><span class="day-num">${day}</span></div>`)
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayEvents = monthEvents.filter(e => e.date === dateStr)
    const isToday = dateStr === todayStr
    const isSelected = selectedDay === dateStr
    const dots = dayEvents.map(e => {
      const cat = e.category || e.eventType || 'general'
      return `<span class="event-cal-dot ${esc(cat)}" title="${esc(e.title)}"></span>`
    }).join('')
    cells.push(`<div class="event-cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-date="${dateStr}"><span class="day-num">${d}</span><div>${dots}</div></div>`)
  }
  // Next month leading days
  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      cells.push(`<div class="event-cal-day other-month"><span class="day-num">${i}</span></div>`)
    }
  }

  return `<div class="event-calendar">${headers}${cells.join('')}</div>`
}

function renderEventsTab(container) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const categoryOpts = EVENT_CATEGORIES.map(c =>
    `<option value="${esc(c.value)}"${editingEventId ? '' : ''}>${esc(c.label)}</option>`
  ).join('')

  const calendarGrid = buildCalendarGrid()

  // Events list for selected day or full month
  const displayEvents = selectedDay
    ? monthEvents.filter(e => e.date === selectedDay)
    : monthEvents

  const rows = displayEvents.map(e => {
    const cat = e.category || e.eventType || 'general'
    return `
    <tr>
      <td><span class="event-cal-dot ${esc(cat)}" style="vertical-align:middle;"></span> <strong>${esc(e.title)}</strong></td>
      <td>${formatDate(e.date)}</td>
      <td>${esc(e.time || '—')}</td>
      <td>${esc(cat)}</td>
      <td>${esc(e.targetAudience || 'all')}</td>
      <td>${e.requiresRequisition ? '<span style="color:var(--brand-primary);">Yes</span>' : '—'}</td>
      <td>${e.approvalRequired ? statusBadge(e.approvalStatus || 'pending') : '—'}</td>
      <td>
        <button class="btn btn-sm edit-event" data-id="${esc(e.id)}" style="margin-right:4px;">Edit</button>
        <button class="btn btn-sm btn-danger delete-event" data-id="${esc(e.id)}">Delete</button>
      </td>
    </tr>`
  }).join('')

  // Pre-fill form if editing
  const editEvt = editingEventId ? monthEvents.find(e => e.id === editingEventId) : null

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header">
        <h2>${editEvt ? 'Edit Event' : 'Add Event'}</h2>
        ${editEvt ? '<button class="btn btn-sm" id="cancel-edit-event">Cancel Edit</button>' : ''}
      </div>
      <form id="event-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group"><label>Title *</label><input type="text" id="event-title" required placeholder="Event title" value="${editEvt ? esc(editEvt.title) : ''}"></div>
          <div class="form-group"><label>Date *</label><input type="date" id="event-date" required value="${editEvt ? esc(editEvt.date) : (selectedDay || '')}"></div>
        </div>
        <div class="form-group"><label>Description</label><textarea id="event-desc" rows="2" placeholder="Optional description">${editEvt ? esc(editEvt.description || '') : ''}</textarea></div>
        <div class="dash-form-row-2">
          <div class="form-group"><label>Time</label><input type="time" id="event-time" value="${editEvt ? esc(editEvt.time || '') : ''}"></div>
          <div class="form-group"><label>Location</label><input type="text" id="event-location" placeholder="e.g. Main Hall" value="${editEvt ? esc(editEvt.location || '') : ''}"></div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group">
            <label>Category</label>
            <select id="event-category">${categoryOpts}</select>
          </div>
          <div class="form-group">
            <label>Target Audience</label>
            <select id="event-audience">
              <option value="all">All</option>
              <option value="staff">Staff Only</option>
              <option value="parents">Parents Only</option>
              <option value="students">Students Only</option>
            </select>
          </div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group"><label>Reminder (days before)</label><input type="number" id="event-reminder" min="0" max="90" value="${editEvt ? (editEvt.reminderDays ?? 7) : 7}"></div>
          <div class="form-group" style="display:flex;align-items:center;gap:16px;padding-top:20px;">
            <label style="margin:0;display:flex;align-items:center;gap:4px;">
              <input type="checkbox" id="event-req"${editEvt && editEvt.requiresRequisition ? ' checked' : ''}> Requires Requisition
            </label>
            <label style="margin:0;display:flex;align-items:center;gap:4px;">
              <input type="checkbox" id="event-approval"${editEvt && editEvt.approvalRequired ? ' checked' : ''}> Requires Approval
            </label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">${editEvt ? 'Update Event' : 'Add Event'}</button>
      </form>
    </div>

    <div class="dash-section">
      <div class="dash-section-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h2>${monthNames[calendarMonth]} ${calendarYear}</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" id="cal-prev">&larr; Prev</button>
          <button class="btn btn-sm" id="cal-today">Today</button>
          <button class="btn btn-sm" id="cal-next">Next &rarr;</button>
        </div>
      </div>
      ${calendarGrid}
    </div>

    <div class="dash-section" style="margin-top:16px;">
      <div class="dash-section-header">
        <h2>${selectedDay ? 'Events on ' + formatDate(selectedDay) : 'All Events This Month'} (${displayEvents.length})</h2>
        ${selectedDay ? '<button class="btn btn-sm" id="clear-day-filter">Show All</button>' : ''}
      </div>
      ${displayEvents.length > 0 ? `
        <table class="dash-table"><thead><tr><th>Title</th><th>Date</th><th>Time</th><th>Category</th><th>Audience</th><th>Requisition</th><th>Approval</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody></table>
      ` : '<div class="dash-empty">No events' + (selectedDay ? ' on this day' : ' this month') + '.</div>'}
    </div>
  `

  // Set select values after rendering
  if (editEvt) {
    const catSel = document.getElementById('event-category')
    if (catSel) catSel.value = editEvt.category || editEvt.eventType || 'general'
    const audSel = document.getElementById('event-audience')
    if (audSel) audSel.value = editEvt.targetAudience || 'all'
  }

  // Calendar navigation
  document.getElementById('cal-prev').addEventListener('click', async () => {
    calendarMonth--
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear-- }
    selectedDay = null
    await loadMonthEvents()
    renderEventsTab(container)
  })
  document.getElementById('cal-next').addEventListener('click', async () => {
    calendarMonth++
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++ }
    selectedDay = null
    await loadMonthEvents()
    renderEventsTab(container)
  })
  document.getElementById('cal-today').addEventListener('click', async () => {
    const now = new Date()
    calendarMonth = now.getMonth()
    calendarYear = now.getFullYear()
    selectedDay = null
    await loadMonthEvents()
    renderEventsTab(container)
  })

  // Day click
  container.querySelectorAll('.event-cal-day:not(.other-month)').forEach(cell => {
    cell.addEventListener('click', () => {
      selectedDay = cell.dataset.date || null
      renderEventsTab(container)
    })
  })

  // Clear day filter
  const clearBtn = document.getElementById('clear-day-filter')
  if (clearBtn) clearBtn.addEventListener('click', () => { selectedDay = null; renderEventsTab(container) })

  // Cancel edit
  const cancelBtn = document.getElementById('cancel-edit-event')
  if (cancelBtn) cancelBtn.addEventListener('click', () => { editingEventId = null; renderEventsTab(container) })

  // Form submit (add or update)
  document.getElementById('event-form').addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const title = document.getElementById('event-title').value.trim()
    const date = document.getElementById('event-date').value
    if (!title || !date) return
    const payload = {
      title, date,
      description: document.getElementById('event-desc').value.trim(),
      time: document.getElementById('event-time').value,
      location: document.getElementById('event-location').value.trim(),
      eventType: document.getElementById('event-category').value,
      category: document.getElementById('event-category').value,
      targetAudience: document.getElementById('event-audience').value,
      reminderDays: parseInt(document.getElementById('event-reminder').value) || 7,
      requiresRequisition: document.getElementById('event-req').checked,
      requiresApproval: document.getElementById('event-approval').checked,
      approvalRequired: document.getElementById('event-approval').checked,
    }
    try {
      if (editingEventId) {
        await updateSchoolEvent(schoolId, editingEventId, payload)
        toast('Event updated', 'success')
        editingEventId = null
      } else {
        await createSchoolEvent(schoolId, payload)
        toast('Event added', 'success')
      }
      events = await getSchoolEvents(schoolId)
      await loadMonthEvents()
      renderEventsTab(container)
    } catch (err) { toast('Failed: ' + err.message, 'error') }
  })

  // Edit buttons
  container.querySelectorAll('.edit-event').forEach(btn => {
    btn.addEventListener('click', () => {
      editingEventId = btn.dataset.id
      renderEventsTab(container)
    })
  })

  // Delete buttons
  container.querySelectorAll('.delete-event').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return
      try {
        await deleteSchoolEvent(schoolId, btn.dataset.id)
        toast('Event deleted', 'success')
        events = await getSchoolEvents(schoolId)
        await loadMonthEvents()
        renderEventsTab(container)
      } catch (err) { toast('Failed: ' + err.message, 'error') }
    })
  })
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
