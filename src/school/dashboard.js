/**
 * SchoolOS — School Super Admin Dashboard
 * Protected page: requires auth + super_admin role
 *
 * Tabs:
 *   1. Classes & Sections — CRUD for class/section structure
 *   2. Users & Roles — Create users with role-specific fields
 *   3. Hierarchy — Visual tree of reporting lines
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import { createUserDoc } from '../firebase/firestore.js'
import {
  createClass, getClasses, createSection, getSections,
  getSchoolUsers, getPositions, createPosition,
  getAllStudents,
} from '../firebase/schools.js'
import { ROLES, ADMIN_SUB_ROLES, HIERARCHY_LEVELS } from '../shared/constants.js'
import {
  esc, formatDate, initTabs, toast, renderList, renderTable,
  formStatus, clearFormStatus, setupHeader,
} from '../shared/components.js'

// ── Firebase REST API key (for creating users without signing out) ──────
const apiKey = 'AIzaSyA20MPMaSjsJt8qB-FsEXXP07d2Vn9d7BM'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user, role, userDoc, school } = await initGuard({
  requireAuth: true,
  allowedRoles: ['super_admin', 'school_admin'], // school_admin for migration
  loadSchool: true,
})

const schoolId = userDoc.schoolId
if (!schoolId) {
  toast('No school assigned to your account', 'error')
  throw new Error('No schoolId on user doc')
}

// ── Header ──────────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName
document.getElementById('role-badge').textContent = role === 'school_admin' ? 'Admin' : 'Super Admin'
document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── Tabs ────────────────────────────────────────────────────────────────
initTabs()

// ── State ───────────────────────────────────────────────────────────────
let classes = []
let sections = []
let users = []
let students = []

// ═══════════════════════════════════════════════════════════════════════════
//   LOAD DATA
// ═══════════════════════════════════════════════════════════════════════════

async function loadAll() {
  try {
    ;[classes, sections, users, students] = await Promise.all([
      getClasses(schoolId),
      getSections(schoolId),
      getSchoolUsers(schoolId),
      getAllStudents(schoolId),
    ])
    updateStats()
    renderClassesList()
    renderUsersList()
    renderHierarchyTree()
    populateSectionDropdowns()
    populateReportsToDropdown()
  } catch (err) {
    console.error('Failed to load data:', err)
    toast('Failed to load school data', 'error')
  }
}

function updateStats() {
  document.getElementById('stat-classes').textContent = classes.length
  document.getElementById('stat-sections').textContent = sections.length
  const staffRoles = ['super_admin', 'school_admin', 'admin', 'line_manager', 'teacher']
  document.getElementById('stat-staff').textContent =
    users.filter(u => staffRoles.includes(u.role)).length
  document.getElementById('stat-students').textContent = students.length
}

// ═══════════════════════════════════════════════════════════════════════════
//   CLASSES & SECTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════

const addClassBtn = document.getElementById('btn-add-class')
const addClassWrap = document.getElementById('add-class-form-wrap')
const addClassForm = document.getElementById('add-class-form')
const cancelClassBtn = document.getElementById('btn-cancel-class')

addClassBtn.addEventListener('click', () => {
  addClassWrap.style.display = addClassWrap.style.display === 'none' ? 'block' : 'none'
})
cancelClassBtn.addEventListener('click', () => {
  addClassWrap.style.display = 'none'
  addClassForm.reset()
  clearFormStatus('class-form-status')
})

addClassForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const statusEl = 'class-form-status'
  formStatus(statusEl, 'Creating class...', 'sending')

  const name = document.getElementById('class-name').value.trim()
  const sectionsInput = document.getElementById('class-sections').value.trim()
  const sortOrder = parseInt(document.getElementById('class-sort').value) || 0

  if (!name || !sectionsInput) {
    formStatus(statusEl, 'Class name and sections are required', 'error')
    return
  }

  const sectionLetters = sectionsInput.split(',').map(s => s.trim()).filter(Boolean)
  if (sectionLetters.length === 0) {
    formStatus(statusEl, 'Enter at least one section', 'error')
    return
  }

  try {
    // 1. Create the class document
    const classId = await createClass(schoolId, {
      name,
      sortOrder,
      sections: sectionLetters,
    })

    // 2. Create a section document for each section letter
    for (const letter of sectionLetters) {
      const sectionId = `${name.toLowerCase().replace(/\s+/g, '-')}-${letter.toLowerCase()}`
      await createSection(schoolId, {
        sectionId,
        classId,
        sectionLetter: letter,
        displayName: `${name} - ${letter}`,
      })
    }

    formStatus(statusEl, `Created ${name} with ${sectionLetters.length} section(s)`, 'success')
    addClassForm.reset()
    setTimeout(() => { addClassWrap.style.display = 'none'; clearFormStatus(statusEl) }, 1500)

    // Reload data
    await loadAll()
  } catch (err) {
    console.error('Failed to create class:', err)
    formStatus(statusEl, `Error: ${err.message}`, 'error')
  }
})

function renderClassesList() {
  const container = document.getElementById('classes-list')

  if (classes.length === 0) {
    container.innerHTML = '<div class="dash-empty">No classes defined yet. Click "+ Add Class" to create your first class.</div>'
    return
  }

  // Group sections by classId
  const sectionsByClass = {}
  for (const sec of sections) {
    if (!sectionsByClass[sec.classId]) sectionsByClass[sec.classId] = []
    sectionsByClass[sec.classId].push(sec)
  }

  container.innerHTML = classes.map(cls => {
    const clsSections = sectionsByClass[cls.id] || []
    const sectionBadges = clsSections.map(s => {
      const ht = s.homeTeacherId ? users.find(u => u.id === s.homeTeacherId) : null
      const htLabel = ht ? ` — HT: ${esc(ht.displayName)}` : ''
      const studentCount = students.filter(st => st.sectionId === s.id).length
      return `<span class="section-badge" title="${esc(s.displayName)}${htLabel}">
        ${esc(s.sectionLetter)}
        <small style="color:var(--text-muted);margin-left:4px;">(${studentCount})</small>
      </span>`
    }).join('')

    return `
      <div class="dash-list-item" style="margin-bottom:12px;">
        <div class="dash-list-header">
          <div>
            <strong style="font-size:15px;">${esc(cls.name)}</strong>
            <span style="color:var(--text-muted);font-size:13px;margin-left:8px;">
              ${clsSections.length} section(s)
            </span>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          ${sectionBadges || '<span style="color:var(--text-muted);font-size:13px;">No sections</span>'}
        </div>
      </div>
    `
  }).join('')
}

// ═══════════════════════════════════════════════════════════════════════════
//   USERS & ROLES TAB
// ═══════════════════════════════════════════════════════════════════════════

const addUserBtn = document.getElementById('btn-add-user')
const addUserWrap = document.getElementById('add-user-form-wrap')
const addUserForm = document.getElementById('add-user-form')
const cancelUserBtn = document.getElementById('btn-cancel-user')
const roleSelect = document.getElementById('new-user-role')

addUserBtn.addEventListener('click', () => {
  addUserWrap.style.display = addUserWrap.style.display === 'none' ? 'block' : 'none'
})
cancelUserBtn.addEventListener('click', () => {
  addUserWrap.style.display = 'none'
  addUserForm.reset()
  clearFormStatus('user-form-status')
  hideAllRoleFields()
})

// Show/hide role-specific fields
roleSelect.addEventListener('change', () => {
  hideAllRoleFields()
  const r = roleSelect.value
  if (r === 'admin') document.getElementById('admin-subrole-wrap').style.display = 'block'
  if (r === 'teacher') document.getElementById('teacher-fields-wrap').style.display = 'block'
  if (r === 'line_manager') document.getElementById('lm-fields-wrap').style.display = 'block'
  if (r === 'parent') document.getElementById('parent-fields-wrap').style.display = 'block'
  // Reports-to for teacher, line_manager, admin
  if (['teacher', 'line_manager', 'admin'].includes(r)) {
    document.getElementById('reports-to-wrap').style.display = 'block'
  }
})

function hideAllRoleFields() {
  document.getElementById('admin-subrole-wrap').style.display = 'none'
  document.getElementById('teacher-fields-wrap').style.display = 'none'
  document.getElementById('lm-fields-wrap').style.display = 'none'
  document.getElementById('parent-fields-wrap').style.display = 'none'
  document.getElementById('reports-to-wrap').style.display = 'none'
}

function populateSectionDropdowns() {
  const sectionOptions = sections.map(s =>
    `<option value="${esc(s.id)}">${esc(s.displayName)}</option>`
  ).join('')

  // Home section dropdown (teacher)
  const homeSelect = document.getElementById('new-user-home-section')
  homeSelect.innerHTML = `<option value="">None — subject teacher only</option>${sectionOptions}`

  // Child section dropdown (parent)
  const childSelect = document.getElementById('new-user-child-section')
  childSelect.innerHTML = `<option value="">Select section...</option>${sectionOptions}`

  // Teacher assigned sections checkboxes
  const teacherCbContainer = document.getElementById('teacher-section-checkboxes')
  teacherCbContainer.innerHTML = sections.map(s =>
    `<label class="module-toggle">
      <input type="checkbox" value="${esc(s.id)}" data-teacher-section />
      ${esc(s.displayName)}
    </label>`
  ).join('')

  // Line manager managed sections checkboxes
  const lmCbContainer = document.getElementById('lm-section-checkboxes')
  lmCbContainer.innerHTML = sections.map(s =>
    `<label class="module-toggle">
      <input type="checkbox" value="${esc(s.id)}" data-lm-section />
      ${esc(s.displayName)}
    </label>`
  ).join('')
}

function populateReportsToDropdown() {
  const reportsToSelect = document.getElementById('new-user-reports-to')
  // Show staff users who could be a manager
  const staffRoles = ['super_admin', 'school_admin', 'admin', 'line_manager']
  const managers = users.filter(u => staffRoles.includes(u.role))
  reportsToSelect.innerHTML = `<option value="">None</option>` +
    managers.map(u =>
      `<option value="${esc(u.id)}">${esc(u.displayName)} (${esc(u.role.replace('_', ' '))})</option>`
    ).join('')
}

// Submit new user
addUserForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const statusEl = 'user-form-status'
  formStatus(statusEl, 'Creating user...', 'sending')

  const name = document.getElementById('new-user-name').value.trim()
  const email = document.getElementById('new-user-email').value.trim()
  const password = document.getElementById('new-user-password').value
  const selectedRole = roleSelect.value

  if (!name || !email || !password || !selectedRole) {
    formStatus(statusEl, 'All required fields must be filled', 'error')
    return
  }
  if (password.length < 6) {
    formStatus(statusEl, 'Password must be at least 6 characters', 'error')
    return
  }

  try {
    // 1. Create Firebase Auth account via REST API (doesn't sign out current user)
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      }
    )
    const data = await res.json()

    if (data.error) {
      formStatus(statusEl, `Auth error: ${data.error.message}`, 'error')
      return
    }

    const uid = data.localId

    // 2. Build the user document based on role
    const userDocData = {
      role: selectedRole,
      email,
      displayName: name,
      schoolId,
    }

    // Role-specific fields
    if (selectedRole === 'admin') {
      userDocData.adminSubRole = document.getElementById('new-user-subrole').value
    }

    if (selectedRole === 'teacher') {
      const homeSection = document.getElementById('new-user-home-section').value
      const subjectsRaw = document.getElementById('new-user-subjects').value.trim()
      const assignedSections = Array.from(
        document.querySelectorAll('[data-teacher-section]:checked')
      ).map(cb => cb.value)

      userDocData.homeSection = homeSection || null
      userDocData.subjects = subjectsRaw ? subjectsRaw.split(',').map(s => s.trim()).filter(Boolean) : []
      userDocData.assignedSections = assignedSections
    }

    if (selectedRole === 'line_manager') {
      const managedSections = Array.from(
        document.querySelectorAll('[data-lm-section]:checked')
      ).map(cb => cb.value)
      userDocData.managedSections = managedSections
    }

    if (selectedRole === 'parent') {
      const childName = document.getElementById('new-user-child-name').value.trim()
      const childSection = document.getElementById('new-user-child-section').value
      userDocData.childName = childName || ''
      userDocData.childSection = childSection || ''
    }

    // Reports-to
    const reportsTo = document.getElementById('new-user-reports-to').value
    if (reportsTo) userDocData.reportsTo = reportsTo

    // 3. Create the Firestore user document
    await createUserDoc(uid, userDocData)

    formStatus(statusEl, `Created ${name} (${selectedRole.replace('_', ' ')})`, 'success')
    addUserForm.reset()
    hideAllRoleFields()
    setTimeout(() => { addUserWrap.style.display = 'none'; clearFormStatus(statusEl) }, 1500)

    // Reload
    await loadAll()
  } catch (err) {
    console.error('Failed to create user:', err)
    formStatus(statusEl, `Error: ${err.message}`, 'error')
  }
})

// ── Role filter buttons ─────────────────────────────────────────────────

document.querySelectorAll('[data-role-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-role-filter]').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    renderUsersList(btn.dataset.roleFilter)
  })
})

function renderUsersList(filterRole = 'all') {
  const filtered = filterRole === 'all'
    ? users
    : users.filter(u => u.role === filterRole)

  const container = document.getElementById('users-list')

  if (filtered.length === 0) {
    container.innerHTML = '<div class="dash-empty">No users found. Click "+ Add User" to create one.</div>'
    return
  }

  // Sort: super_admin first, then by role level, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const la = HIERARCHY_LEVELS[a.role] ?? 9
    const lb = HIERARCHY_LEVELS[b.role] ?? 9
    if (la !== lb) return la - lb
    return (a.displayName || '').localeCompare(b.displayName || '')
  })

  container.innerHTML = `
    <table class="dash-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>Email</th>
          <th>Details</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(u => {
          const roleBadge = getRoleBadge(u)
          const details = getUserDetails(u)
          const created = u.createdAt ? formatDate(u.createdAt) : '—'
          return `
            <tr>
              <td><strong>${esc(u.displayName || '—')}</strong></td>
              <td>${roleBadge}</td>
              <td style="font-size:13px;color:var(--text-muted);">${esc(u.email || '—')}</td>
              <td style="font-size:13px;">${details}</td>
              <td style="font-size:13px;color:var(--text-muted);">${created}</td>
            </tr>
          `
        }).join('')}
      </tbody>
    </table>
  `
}

function getRoleBadge(u) {
  const badges = {
    super_admin: '<span class="dash-nav-badge admin" style="font-size:11px;">Super Admin</span>',
    school_admin: '<span class="dash-nav-badge admin" style="font-size:11px;">Admin</span>',
    admin: `<span class="dash-nav-badge" style="font-size:11px;background:var(--brand-secondary);color:#fff;">${esc((u.adminSubRole || 'admin').replace('_', ' '))}</span>`,
    line_manager: '<span class="dash-nav-badge" style="font-size:11px;background:#7c3aed;color:#fff;">Line Manager</span>',
    teacher: '<span class="dash-nav-badge" style="font-size:11px;background:#0891b2;color:#fff;">Teacher</span>',
    parent: '<span class="dash-nav-badge" style="font-size:11px;background:#ea580c;color:#fff;">Parent</span>',
    student: '<span class="dash-nav-badge" style="font-size:11px;background:#64748b;color:#fff;">Student</span>',
  }
  return badges[u.role] || `<span class="dash-nav-badge" style="font-size:11px;">${esc(u.role)}</span>`
}

function getUserDetails(u) {
  const parts = []

  if (u.role === 'teacher') {
    if (u.homeSection) {
      const sec = sections.find(s => s.id === u.homeSection)
      parts.push(`HT: ${sec ? esc(sec.displayName) : esc(u.homeSection)}`)
    }
    if (u.subjects && u.subjects.length > 0) {
      parts.push(u.subjects.map(s => esc(s)).join(', '))
    }
    if (u.assignedSections && u.assignedSections.length > 0) {
      parts.push(`${u.assignedSections.length} section(s)`)
    }
  }

  if (u.role === 'line_manager' && u.managedSections) {
    parts.push(`${u.managedSections.length} section(s)`)
  }

  if (u.role === 'parent') {
    if (u.childName) parts.push(`Child: ${esc(u.childName)}`)
    if (u.childSection) {
      const sec = sections.find(s => s.id === u.childSection)
      parts.push(sec ? esc(sec.displayName) : esc(u.childSection))
    }
  }

  if (u.reportsTo) {
    const mgr = users.find(m => m.id === u.reportsTo)
    parts.push(`→ ${mgr ? esc(mgr.displayName) : 'Unknown'}`)
  }

  return parts.join(' · ') || '—'
}

// ═══════════════════════════════════════════════════════════════════════════
//   HIERARCHY TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderHierarchyTree() {
  const container = document.getElementById('hierarchy-tree')

  // Build tree from reportsTo relationships
  const staffRoles = ['super_admin', 'school_admin', 'admin', 'line_manager', 'teacher']
  const staff = users.filter(u => staffRoles.includes(u.role))

  if (staff.length === 0) {
    container.innerHTML = '<div class="dash-empty">No staff members yet. Add users in the "Users & Roles" tab to see the hierarchy.</div>'
    return
  }

  // Build adjacency map: parentId → children
  const childrenMap = {}
  const roots = []

  for (const u of staff) {
    if (u.reportsTo && staff.find(s => s.id === u.reportsTo)) {
      if (!childrenMap[u.reportsTo]) childrenMap[u.reportsTo] = []
      childrenMap[u.reportsTo].push(u)
    } else {
      roots.push(u)
    }
  }

  // Sort roots by hierarchy level
  roots.sort((a, b) => (HIERARCHY_LEVELS[a.role] ?? 9) - (HIERARCHY_LEVELS[b.role] ?? 9))

  function renderNode(u, depth = 0) {
    const children = childrenMap[u.id] || []
    children.sort((a, b) => (HIERARCHY_LEVELS[a.role] ?? 9) - (HIERARCHY_LEVELS[b.role] ?? 9))

    const roleBadge = getRoleBadge(u)
    const indent = depth * 28

    let html = `
      <div class="hierarchy-node" style="margin-left:${indent}px;padding:10px 14px;border-left:${depth > 0 ? '2px solid var(--brand-primary-light, #93c5fd)' : 'none'};margin-bottom:4px;border-radius:var(--radius-sm);background:${depth === 0 ? 'var(--gray-50, #f8fafc)' : 'transparent'};">
        <div style="display:flex;align-items:center;gap:8px;">
          <strong>${esc(u.displayName || u.email)}</strong>
          ${roleBadge}
        </div>
      </div>
    `

    for (const child of children) {
      html += renderNode(child, depth + 1)
    }

    return html
  }

  container.innerHTML = roots.map(r => renderNode(r)).join('')
}

// ═══════════════════════════════════════════════════════════════════════════
//   INIT
// ═══════════════════════════════════════════════════════════════════════════

await loadAll()
