/**
 * SchoolOS — Teacher Dashboard
 * Protected page: requires auth + teacher role
 *
 * Shows:
 *   - Home section info (if home teacher)
 *   - Assigned sections overview
 *   - Module tabs based on school's active modules
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import {
  getSections, getSchoolUsers, getStudentsBySection, getAllStudents,
  getMessagesForUser, markMessageRead, addMessageReply,
  getRequestsForUser, updateRequestStatus, markRequestRead,
  getNotifications, getUnreadNotificationCount, markNotificationRead,
  saveAttendance, getAttendance,
  createHomework, getHomeworkByTeacher, verifyHomework,
  createExam, getExamsByClass, saveExamResults, publishExamResults, getClasses,
  getCatalogue, createRequisition, getRequisitionsByTeacher,
  getTimetable, updateStudentDocuments,
} from '../firebase/schools.js'
import { MODULES, MESSAGE_CATEGORIES, REQUEST_TYPES, ATTENDANCE_STATUSES, HOMEWORK_STATUSES } from '../shared/constants.js'
import { esc, formatDate, timeAgo, toast, statusBadge } from '../shared/components.js'
import { exportAttendanceCSV } from '../shared/csv-export.js'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user, role, userDoc, school } = await initGuard({
  requireAuth: true,
  allowedRoles: ['teacher'],
  loadSchool: true,
})

const schoolId = userDoc.schoolId
const activeModules = school?.activeModules || []
const homeSection = userDoc.homeSection || null
const assignedSections = userDoc.assignedSections || []
const subjects = userDoc.subjects || []

// ── Header ──────────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName

const isHomeTeacher = !!homeSection
document.getElementById('role-description').textContent = isHomeTeacher
  ? 'Home teacher — manage your section and classes.'
  : 'Subject teacher — manage your assigned sections.'

document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── State ───────────────────────────────────────────────────────────────
let allSections = []
let mySections = []
let allUsers = []
let myStudents = []
let messages = []
let myRequests = []
let myHomework = []
let allClasses = []
let myRequisitions = []

// ── Load Data ───────────────────────────────────────────────────────────
async function loadAll() {
  try {
    ;[allSections, allUsers, messages, myRequests, myHomework, allClasses, myRequisitions] = await Promise.all([
      getSections(schoolId),
      getSchoolUsers(schoolId),
      getMessagesForUser(schoolId, user.uid),
      getRequestsForUser(schoolId, user.uid),
      getHomeworkByTeacher(schoolId, user.uid).catch(() => []),
      getClasses(schoolId).catch(() => []),
      getRequisitionsByTeacher(schoolId, user.uid).catch(() => []),
    ])

    // Get sections this teacher is assigned to
    const sectionIds = new Set(assignedSections)
    if (homeSection) sectionIds.add(homeSection)
    mySections = allSections.filter(s => sectionIds.has(s.id))

    // Load students for assigned sections
    const studentResults = await Promise.all(
      mySections.map(s => getStudentsBySection(schoolId, s.id))
    )
    myStudents = studentResults.flat()

    updateStats()
    renderTabs()
    renderActiveTab()
  } catch (err) {
    console.error('Failed to load data:', err)
    toast('Failed to load data', 'error')
  }
}

function updateStats() {
  // Home section
  if (homeSection) {
    const sec = allSections.find(s => s.id === homeSection)
    document.getElementById('stat-home-section').textContent = sec ? sec.displayName : homeSection
    document.getElementById('stat-home-label').textContent = 'home teacher'
  }

  document.getElementById('stat-sections').textContent = mySections.length
  document.getElementById('stat-students').textContent = myStudents.length
  document.getElementById('stat-subjects').textContent = subjects.length
}

// ── Tabs ────────────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: 'sections', label: 'My Sections', always: true },
  { id: 'students', label: 'Students', always: true },
  { id: 'attendance', label: 'Attendance', module: MODULES.ATTENDANCE },
  { id: 'homework', label: 'Homework', module: MODULES.HOMEWORK },
  { id: 'results', label: 'Results', module: MODULES.RESULTS },
  { id: 'messages', label: 'Messages', module: MODULES.COMMUNICATION },
  { id: 'requisitions', label: 'Requisitions', module: MODULES.REQUISITION },
  { id: 'timetable', label: 'Timetable', module: MODULES.TIMETABLE },
  { id: 'documents', label: 'Documents', module: MODULES.DOCUMENTS },
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
    case 'students': return renderMyStudents(container)
    case 'attendance': return renderAttendanceTab(container)
    case 'homework': return renderHomeworkTab(container)
    case 'results': return renderResultsTab(container)
    case 'messages': return renderMessagesTab(container)
    case 'requisitions': return renderRequisitionsTab(container)
    case 'timetable': return renderTimetableTab(container)
    case 'documents': return renderDocumentsTab(container)
    default: return renderMySections(container)
  }
}

function renderMySections(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned to you yet. Ask your Super Admin to assign sections.</div></div>'
    return
  }

  const cards = mySections.map(s => {
    const isHome = s.id === homeSection
    const studentCount = myStudents.filter(st => st.sectionId === s.id).length
    const lm = s.lineManagerId ? allUsers.find(u => u.id === s.lineManagerId) : null

    return `
      <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-sm);border-left:3px solid ${isHome ? 'var(--brand-primary)' : 'var(--gray-300)'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:15px;">${esc(s.displayName)}</strong>
          ${isHome ? '<span class="dash-nav-badge admin" style="font-size:11px;">Home Section</span>' : ''}
        </div>
        <div style="font-size:13px;color:var(--text-muted);">
          ${studentCount} student(s)
          ${lm ? ` · LM: ${esc(lm.displayName)}` : ''}
        </div>
      </div>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>My Sections (${mySections.length})</h2></div>
      ${subjects.length > 0 ? `<p style="color:var(--text-muted);margin-bottom:16px;">Subjects: ${subjects.map(s => esc(s)).join(', ')}</p>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
        ${cards}
      </div>
    </div>
  `
}

function renderMyStudents(container) {
  if (myStudents.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No students in your sections yet.</div></div>'
    return
  }

  const sorted = [...myStudents].sort((a, b) => {
    const sa = allSections.find(s => s.id === a.sectionId)
    const sb = allSections.find(s => s.id === b.sectionId)
    const secCmp = (sa?.displayName || '').localeCompare(sb?.displayName || '')
    if (secCmp !== 0) return secCmp
    return (a.name || '').localeCompare(b.name || '')
  })

  const rows = sorted.map(s => {
    const sec = allSections.find(sec => sec.id === s.sectionId)
    return `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${sec ? esc(sec.displayName) : '—'}</td>
        <td>${esc(s.rollNumber || '—')}</td>
        <td>${esc(s.gender || '—')}</td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Students (${myStudents.length})</h2></div>
      <table class="dash-table">
        <thead><tr><th>Name</th><th>Section</th><th>Roll #</th><th>Gender</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════
//   ATTENDANCE TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderAttendanceTab(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned. Cannot mark attendance.</div></div>'
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const sectionOptions = mySections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Mark Attendance</h2></div>
      <div style="display:flex;gap:12px;margin-bottom:16px;align-items:end;">
        <div class="form-group" style="margin:0;">
          <label for="att-section">Section</label>
          <select id="att-section">${sectionOptions}</select>
        </div>
        <div class="form-group" style="margin:0;">
          <label for="att-date">Date</label>
          <input type="date" id="att-date" value="${today}" />
        </div>
        <button class="btn btn-primary btn-sm" id="att-load">Load Students</button>
      </div>
      <div id="attendance-grid"></div>
    </div>
  `

  document.getElementById('att-load').addEventListener('click', loadAttendanceGrid)
  // Auto-load for first section
  loadAttendanceGrid()
}

async function loadAttendanceGrid() {
  const sectionId = document.getElementById('att-section').value
  const date = document.getElementById('att-date').value
  const gridContainer = document.getElementById('attendance-grid')

  if (!sectionId || !date) return

  gridContainer.innerHTML = '<p style="color:var(--text-muted);">Loading...</p>'

  try {
    const sectionStudents = await getStudentsBySection(schoolId, sectionId)
    const existing = await getAttendance(schoolId, date, sectionId)

    if (sectionStudents.length === 0) {
      gridContainer.innerHTML = '<div class="dash-empty">No students in this section.</div>'
      return
    }

    // Build lookup of existing records
    const existingMap = {}
    if (existing?.records) {
      for (const r of existing.records) existingMap[r.studentId] = r
    }

    const rows = sectionStudents.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(s => {
      const prev = existingMap[s.id]
      const status = prev?.status || 'present'
      const discrepancy = prev?.discrepancy ? '<span style="color:var(--red);font-size:11px;" title="RFID mismatch">&#9888;</span>' : ''

      return `
        <tr>
          <td>${esc(s.rollNumber || '—')}</td>
          <td><strong>${esc(s.name)}</strong> ${discrepancy}</td>
          <td>
            <select data-student-id="${esc(s.id)}" data-student-name="${esc(s.name)}" class="att-status">
              <option value="present" ${status === 'present' ? 'selected' : ''}>Present</option>
              <option value="absent" ${status === 'absent' ? 'selected' : ''}>Absent</option>
              <option value="late" ${status === 'late' ? 'selected' : ''}>Late</option>
              <option value="excused" ${status === 'excused' ? 'selected' : ''}>Excused</option>
            </select>
          </td>
        </tr>
      `
    }).join('')

    gridContainer.innerHTML = `
      <table class="attendance-grid">
        <thead><tr><th>Roll #</th><th>Student</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
        <button class="btn btn-primary btn-sm" id="att-save">Save Attendance</button>
        <button class="btn btn-sm btn-secondary" id="att-export">Export CSV</button>
        <label class="module-toggle" style="cursor:pointer;">
          <input type="file" id="att-rfid-upload" accept=".csv" style="display:none;" />
          Upload RFID CSV
        </label>
        <span id="att-save-status" style="font-size:13px;color:var(--text-muted);"></span>
      </div>
    `

    document.getElementById('att-save').addEventListener('click', async () => {
      const records = Array.from(gridContainer.querySelectorAll('.att-status')).map(sel => ({
        studentId: sel.dataset.studentId,
        studentName: sel.dataset.studentName,
        status: sel.value,
      }))

      try {
        await saveAttendance(schoolId, {
          date,
          sectionId,
          teacherId: user.uid,
          teacherName: displayName,
          records,
        })
        document.getElementById('att-save-status').textContent = 'Saved!'
        document.getElementById('att-save-status').style.color = 'var(--green)'
        toast('Attendance saved', 'success')
      } catch (err) {
        toast('Failed to save: ' + err.message, 'error')
      }
    })

    // Export attendance CSV
    document.getElementById('att-export')?.addEventListener('click', () => {
      const records = Array.from(gridContainer.querySelectorAll('.att-status')).map(sel => ({
        studentName: sel.dataset.studentName,
        studentId: sel.dataset.studentId,
        status: sel.value,
      }))
      const sec = mySections.find(s => s.id === sectionId)
      exportAttendanceCSV(records, sec?.displayName || sectionId, date)
      toast('Attendance CSV downloaded', 'success')
    })

    // RFID CSV upload
    document.getElementById('att-rfid-upload').addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (!file) return
      try {
        const text = await file.text()
        const lines = text.trim().split('\n').slice(1) // Skip header
        const rfidRecords = lines.map(line => {
          const [studentId, studentName, status] = line.split(',').map(s => s.trim())
          return { studentId, studentName, status: status || 'present' }
        }).filter(r => r.studentId)

        const { uploadRfidAttendance } = await import('../firebase/schools.js')
        const result = await uploadRfidAttendance(schoolId, { date, sectionId, rfidRecords })

        if (result.discrepancies.length > 0) {
          toast(`${result.discrepancies.length} discrepancies found!`, 'warning')
        } else {
          toast('RFID data uploaded — no discrepancies', 'success')
        }
        loadAttendanceGrid() // Reload to show discrepancy flags
      } catch (err) {
        toast('Failed to process CSV: ' + err.message, 'error')
      }
    })
  } catch (err) {
    gridContainer.innerHTML = `<div class="dash-empty">Error loading attendance: ${esc(err.message)}</div>`
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//   HOMEWORK TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderHomeworkTab(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned.</div></div>'
    return
  }

  const sectionOptions = mySections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  const subjectOptions = subjects.length > 0
    ? subjects.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')
    : '<option value="General">General</option>'

  const today = new Date().toISOString().split('T')[0]

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Assign Homework</h2></div>
      <form id="hw-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="hw-section">Section *</label>
            <select id="hw-section" required>${sectionOptions}</select>
          </div>
          <div class="form-group">
            <label for="hw-subject">Subject *</label>
            <select id="hw-subject" required>${subjectOptions}</select>
          </div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="hw-title">Title *</label>
            <input type="text" id="hw-title" required placeholder="e.g. Chapter 5 exercises" />
          </div>
          <div class="form-group">
            <label for="hw-deadline">Deadline *</label>
            <input type="date" id="hw-deadline" required min="${today}" />
          </div>
        </div>
        <div class="form-group">
          <label for="hw-desc">Description</label>
          <textarea id="hw-desc" rows="2" placeholder="Additional details (optional)"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Assign Homework</button>
        <div class="dash-form-status" id="hw-form-status"></div>
      </form>

      <h3 style="margin-bottom:12px;">Assigned Homework</h3>
      <div id="homework-list"></div>
    </div>
  `

  document.getElementById('hw-form').addEventListener('submit', handleAssignHomework)
  renderHomeworkList()
}

async function handleAssignHomework(e) {
  e.preventDefault()
  const sectionId = document.getElementById('hw-section').value
  const subject = document.getElementById('hw-subject').value
  const title = document.getElementById('hw-title').value.trim()
  const deadline = document.getElementById('hw-deadline').value
  const description = document.getElementById('hw-desc').value.trim()

  if (!sectionId || !title || !deadline) {
    toast('Fill all required fields', 'error')
    return
  }

  try {
    await createHomework(schoolId, {
      sectionId, subject, title, description, deadline,
      teacherId: user.uid, teacherName: displayName,
    })
    toast('Homework assigned!', 'success')
    document.getElementById('hw-form').reset()
    myHomework = await getHomeworkByTeacher(schoolId, user.uid)
    renderHomeworkList()
  } catch (err) {
    toast('Failed: ' + err.message, 'error')
  }
}

function renderHomeworkList() {
  const container = document.getElementById('homework-list')
  if (!container) return

  if (myHomework.length === 0) {
    container.innerHTML = '<div class="dash-empty">No homework assigned yet.</div>'
    return
  }

  container.innerHTML = myHomework.map(hw => {
    const sec = allSections.find(s => s.id === hw.sectionId)
    const completions = hw.completions || {}
    const completionEntries = Object.entries(completions)
    const parentMarked = completionEntries.filter(([, c]) => c.parentMarked).length
    const teacherVerified = completionEntries.filter(([, c]) => c.teacherVerified).length
    const isOverdue = hw.deadline < new Date().toISOString().split('T')[0]

    return `
      <div class="dash-list-item" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <strong>${esc(hw.title)}</strong>
            <span class="section-badge" style="font-size:11px;padding:2px 8px;margin-left:6px;">${esc(hw.subject)}</span>
            ${sec ? `<span style="font-size:12px;color:var(--text-muted);margin-left:6px;">${esc(sec.displayName)}</span>` : ''}
          </div>
          <span style="font-size:12px;${isOverdue ? 'color:var(--red);font-weight:600;' : 'color:var(--text-muted);'}">${isOverdue ? 'Overdue' : `Due: ${hw.deadline}`}</span>
        </div>
        ${hw.description ? `<p style="margin-top:6px;font-size:13px;color:var(--text-secondary);">${esc(hw.description)}</p>` : ''}
        <div style="margin-top:8px;font-size:13px;color:var(--text-muted);">
          ${parentMarked} parent-marked · ${teacherVerified} verified
        </div>
        ${parentMarked > 0 ? `
          <div style="margin-top:8px;">
            ${completionEntries.filter(([, c]) => c.parentMarked && !c.teacherVerified).map(([studentId]) => {
              const student = myStudents.find(s => s.id === studentId)
              return `
                <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
                  <span style="font-size:13px;">${student ? esc(student.name) : studentId}</span>
                  <button class="btn btn-sm hw-verify" data-hw-id="${esc(hw.id)}" data-student-id="${esc(studentId)}" data-status="approved" style="background:var(--green);color:#fff;padding:2px 8px;font-size:11px;">Approve</button>
                  <button class="btn btn-sm hw-verify" data-hw-id="${esc(hw.id)}" data-student-id="${esc(studentId)}" data-status="incomplete" style="padding:2px 8px;font-size:11px;">Incomplete</button>
                </div>
              `
            }).join('')}
          </div>
        ` : ''}
      </div>
    `
  }).join('')

  // Verify handlers
  container.querySelectorAll('.hw-verify').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await verifyHomework(schoolId, btn.dataset.hwId, btn.dataset.studentId, btn.dataset.status)
        toast(`Homework ${btn.dataset.status}`, 'success')
        myHomework = await getHomeworkByTeacher(schoolId, user.uid)
        renderHomeworkList()
      } catch (err) { toast('Failed to verify', 'error') }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   RESULTS TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderResultsTab(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned.</div></div>'
    return
  }

  const sectionOptions = mySections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  const subjectOptions = subjects.length > 0
    ? subjects.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')
    : '<option value="General">General</option>'

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Create Exam</h2></div>
      <form id="exam-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="exam-name">Exam Name *</label>
            <input type="text" id="exam-name" required placeholder="e.g. Mid-Term 2026" />
          </div>
          <div class="form-group">
            <label for="exam-type">Type *</label>
            <select id="exam-type" required>
              <option value="unit_test">Unit Test</option>
              <option value="midterm">Mid-Term</option>
              <option value="final">Final</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>
        <div class="dash-form-row-2">
          <div class="form-group">
            <label for="exam-section">Section *</label>
            <select id="exam-section" required>${sectionOptions}</select>
          </div>
          <div class="form-group">
            <label for="exam-subjects">Subjects (comma-separated) *</label>
            <input type="text" id="exam-subjects" required value="${subjects.join(', ')}" />
          </div>
        </div>
        <div class="form-group">
          <label for="exam-maxmarks">Max Marks per Subject</label>
          <input type="number" id="exam-maxmarks" value="100" min="1" />
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Create Exam</button>
        <div class="dash-form-status" id="exam-form-status"></div>
      </form>
      <h3 style="margin-bottom:12px;">Enter Marks</h3>
      <div id="exam-marks-area"></div>
    </div>
  `

  document.getElementById('exam-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const name = document.getElementById('exam-name').value.trim()
    const examType = document.getElementById('exam-type').value
    const sectionId = document.getElementById('exam-section').value
    const subjectsInput = document.getElementById('exam-subjects').value.trim()
    const maxMarks = parseInt(document.getElementById('exam-maxmarks').value) || 100

    const sec = allSections.find(s => s.id === sectionId)
    const classId = sec?.classId || ''
    const examSubjects = subjectsInput.split(',').map(s => s.trim()).filter(Boolean)

    const maxMarksMap = {}
    examSubjects.forEach(s => maxMarksMap[s] = maxMarks)

    try {
      const examId = await createExam(schoolId, {
        name, examType, classId, sectionId,
        subjects: examSubjects, maxMarks: maxMarksMap,
      })
      toast('Exam created! Load marks entry below.', 'success')
      document.getElementById('exam-form').reset()
      loadMarksEntry(examId, sectionId, examSubjects, maxMarks)
    } catch (err) { toast('Failed: ' + err.message, 'error') }
  })
}

async function loadMarksEntry(examId, sectionId, examSubjects, maxMarks) {
  const area = document.getElementById('exam-marks-area')
  if (!area) return

  const sectionStudents = await getStudentsBySection(schoolId, sectionId)
  if (sectionStudents.length === 0) {
    area.innerHTML = '<div class="dash-empty">No students in this section.</div>'
    return
  }

  const sorted = sectionStudents.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const subjectHeaders = examSubjects.map(s => `<th>${esc(s)} (/${maxMarks})</th>`).join('')
  const rows = sorted.map(s => {
    const inputs = examSubjects.map(sub =>
      `<td><input type="number" class="marks-input" data-student="${esc(s.id)}" data-subject="${esc(sub)}" min="0" max="${maxMarks}" style="width:60px;padding:4px;border:1px solid var(--gray-300);border-radius:var(--radius-sm);font-size:13px;" /></td>`
    ).join('')
    return `<tr><td>${esc(s.rollNumber || '—')}</td><td><strong>${esc(s.name)}</strong></td>${inputs}</tr>`
  }).join('')

  area.innerHTML = `
    <table class="attendance-grid">
      <thead><tr><th>Roll #</th><th>Name</th>${subjectHeaders}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:12px;display:flex;gap:8px;">
      <button class="btn btn-primary btn-sm" id="save-marks">Save Marks</button>
      <button class="btn btn-sm" id="publish-marks" style="background:var(--green);color:#fff;">Save & Publish</button>
    </div>
  `

  async function saveMarks(publish) {
    const results = {}
    area.querySelectorAll('.marks-input').forEach(input => {
      const studentId = input.dataset.student
      const subject = input.dataset.subject
      const marks = parseInt(input.value)
      if (isNaN(marks)) return
      if (!results[studentId]) results[studentId] = {}
      results[studentId][subject] = { marks }
    })

    try {
      await saveExamResults(schoolId, examId, results)
      if (publish) await publishExamResults(schoolId, examId)
      toast(publish ? 'Results published!' : 'Marks saved!', 'success')
    } catch (err) { toast('Failed: ' + err.message, 'error') }
  }

  document.getElementById('save-marks').addEventListener('click', () => saveMarks(false))
  document.getElementById('publish-marks').addEventListener('click', () => saveMarks(true))
}

// ═══════════════════════════════════════════════════════════════════════════
//   MESSAGES TAB (inbox + reply)
// ═══════════════════════════════════════════════════════════════════════════

function renderMessagesTab(container) {
  // Received messages (where teacher is in recipientUids)
  const received = messages.filter(m => m.recipientUids?.includes(user.uid) && m.senderId !== user.uid)

  if (received.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No messages received yet.</div></div>'
    return
  }

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Inbox (${received.length})</h2></div>
      <div id="teacher-messages-list"></div>
    </div>
  `

  const list = document.getElementById('teacher-messages-list')
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
          <strong>${esc(r.senderName)}</strong>
          <span style="color:var(--text-muted);font-size:11px;">(${esc(r.senderRole.replace(/_/g, ' '))})</span>
          <div style="margin-top:4px;">${esc(r.body)}</div>
        </div>
      `).join('')
    }

    return `
      <div class="dash-list-item${!isRead ? ' notification-unread' : ''}" style="margin-bottom:10px;" data-msg-id="${esc(m.id)}">
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

  // Mark as read on view
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
          senderId: user.uid,
          senderName: displayName,
          senderRole: 'teacher',
          body,
        })
        toast('Reply sent', 'success')
        messages = await getMessagesForUser(schoolId, user.uid)
        renderMessagesTab(container)
      } catch (err) {
        toast('Failed to send reply', 'error')
      }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUISITIONS TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderRequisitionsTab(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned.</div></div>'
    return
  }

  const sectionOptions = mySections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  const existingRows = myRequisitions.map(r => {
    const sec = allSections.find(s => s.id === r.sectionId)
    return `
      <tr>
        <td>${sec ? esc(sec.displayName) : '—'}</td>
        <td>${r.totalItems} item(s)</td>
        <td>${statusBadge(r.status)}</td>
        <td style="font-size:12px;color:var(--text-muted);">${r.createdAt ? timeAgo(r.createdAt) : '—'}</td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Submit Requisition</h2></div>
      <form id="req-form" class="dash-form" style="background:var(--gray-50);padding:16px;border-radius:var(--radius-sm);margin-bottom:24px;">
        <div class="form-group">
          <label for="req-section">Section *</label>
          <select id="req-section" required>${sectionOptions}</select>
        </div>
        <div id="req-items-list">
          <div class="req-item-row" style="display:flex;gap:8px;margin-bottom:8px;">
            <input type="text" class="req-item-name" placeholder="Item name" required style="flex:2;" />
            <input type="number" class="req-item-qty" placeholder="Qty" required min="1" value="1" style="flex:1;max-width:80px;" />
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-req-item" style="margin-bottom:12px;">+ Add Item</button>
        <br/>
        <button type="submit" class="btn btn-primary btn-sm">Submit Requisition</button>
      </form>

      ${myRequisitions.length > 0 ? `
        <h3 style="margin-bottom:12px;">My Requisitions</h3>
        <table class="dash-table">
          <thead><tr><th>Section</th><th>Items</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>${existingRows}</tbody>
        </table>
      ` : ''}
    </div>
  `

  document.getElementById('add-req-item').addEventListener('click', () => {
    const list = document.getElementById('req-items-list')
    const row = document.createElement('div')
    row.className = 'req-item-row'
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;'
    row.innerHTML = `
      <input type="text" class="req-item-name" placeholder="Item name" required style="flex:2;" />
      <input type="number" class="req-item-qty" placeholder="Qty" required min="1" value="1" style="flex:1;max-width:80px;" />
    `
    list.appendChild(row)
  })

  document.getElementById('req-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const sectionId = document.getElementById('req-section').value
    const items = Array.from(document.querySelectorAll('.req-item-row')).map(row => ({
      name: row.querySelector('.req-item-name').value.trim(),
      requestedQty: parseInt(row.querySelector('.req-item-qty').value) || 1,
    })).filter(i => i.name)

    if (items.length === 0) { toast('Add at least one item', 'error'); return }

    try {
      await createRequisition(schoolId, {
        teacherId: user.uid, teacherName: displayName, sectionId, items,
      })
      toast('Requisition submitted!', 'success')
      myRequisitions = await getRequisitionsByTeacher(schoolId, user.uid)
      renderRequisitionsTab(container)
    } catch (err) { toast('Failed: ' + err.message, 'error') }
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

// ═══════════════════════════════════════════════════════════════════════════
//   TIMETABLE TAB (teacher view — read only)
// ═══════════════════════════════════════════════════════════════════════════

function renderTimetableTab(container) {
  if (mySections.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No sections assigned.</div></div>'
    return
  }

  // Section selector + timetable grid
  const sectionOptions = mySections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Section Timetable</h2></div>
      <div style="margin-bottom:16px;">
        <select id="tt-section-select" class="dash-input" style="max-width:300px;">
          ${sectionOptions}
        </select>
      </div>
      <div id="tt-grid"><p class="dash-empty">Select a section to view timetable.</p></div>
    </div>
  `

  const select = document.getElementById('tt-section-select')
  select.addEventListener('change', () => loadSectionTimetable(select.value))
  if (mySections.length > 0) loadSectionTimetable(mySections[0].id)
}

async function loadSectionTimetable(sectionId) {
  const gridEl = document.getElementById('tt-grid')
  gridEl.innerHTML = '<p>Loading...</p>'

  try {
    const tt = await getTimetable(schoolId, sectionId)
    if (!tt || !tt.schedule) {
      gridEl.innerHTML = '<p class="dash-empty">No timetable set for this section.</p>'
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
        const highlight = slot?.teacherId === user.uid ? 'background:#dbeafe;' : ''
        html += `<td style="${highlight}">${slot?.subject ? esc(slot.subject) : '—'}${teacher ? `<br><span style="font-size:11px;color:#6b7280;">${esc(teacher.displayName || '')}</span>` : ''}</td>`
      })
      html += '</tr>'
    }
    html += '</tbody></table></div>'
    gridEl.innerHTML = html
  } catch (err) {
    gridEl.innerHTML = '<p class="dash-empty">Failed to load timetable.</p>'
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//   DOCUMENTS TAB (teacher view — manage student documents for home section)
// ═══════════════════════════════════════════════════════════════════════════

function renderDocumentsTab(container) {
  if (!homeSection) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">Document management is available for home teachers only.</div></div>'
    return
  }

  const sectionStudents = myStudents.filter(s => s.sectionId === homeSection)

  if (sectionStudents.length === 0) {
    container.innerHTML = '<div class="dash-section"><div class="dash-empty">No students in your home section.</div></div>'
    return
  }

  const requiredDocs = ['birth_certificate', 'school_leaving', 'medical_report', 'photo', 'guardian_id']

  const rows = sectionStudents.map(s => {
    const docs = s.documents || {}
    const docCells = requiredDocs.map(d => {
      const status = docs[d]
      return `<td style="text-align:center;">${status === 'submitted' ? '<span style="color:var(--green);">&#10003;</span>' : status === 'missing' ? '<span style="color:#ef4444;">&#10007;</span>' : '<span style="color:#9ca3af;">—</span>'}</td>`
    }).join('')
    return `<tr><td><strong>${esc(s.name)}</strong></td>${docCells}</tr>`
  }).join('')

  const headers = requiredDocs.map(d =>
    `<th style="font-size:11px;text-transform:capitalize;">${esc(d.replace(/_/g, ' '))}</th>`
  ).join('')

  container.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header"><h2>Student Documents — Home Section</h2></div>
      <table class="dash-table">
        <thead><tr><th>Student</th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:12px;font-size:13px;color:var(--text-muted);">&#10003; = Submitted, &#10007; = Missing, — = Not checked. Document uploads are managed by the Super Admin.</p>
    </div>
  `
}

// ── Init ────────────────────────────────────────────────────────────────
await loadAll()
