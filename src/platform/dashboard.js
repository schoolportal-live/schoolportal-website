/**
 * SchoolOS — Platform Admin Dashboard
 * Protected page: requires auth + platform_admin role
 *
 * Features:
 *   1. View all registered schools with stats
 *   2. Onboard new school (create org unit + super admin account)
 *   3. Toggle modules per school
 *   4. View package definitions
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import { createUserDoc } from '../firebase/firestore.js'
import {
  getAllSchools, createSchool, updateSchool, toggleSchoolModule,
  getSchoolUsers, getBranches,
} from '../firebase/schools.js'
import { ROLES, MODULES, PACKAGES } from '../shared/constants.js'
import { esc, formatDate, initTabs, toast, renderList, statusBadge, formStatus, clearFormStatus } from '../shared/components.js'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user } = await initGuard({
  requireAuth: true,
  allowedRoles: ['platform_admin', 'school_admin'], // school_admin for migration
  loadSchool: false, // Platform admin isn't tied to a school
})

const displayName = user.displayName || user.email.split('@')[0]

// ── Header ──────────────────────────────────────────────────────────────
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName
document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── Tabs ────────────────────────────────────────────────────────────────
initTabs()

// ── State ───────────────────────────────────────────────────────────────
let schools = []

// ═══════════════════════════════════════════════════════════════════════════
//   SCHOOLS LIST
// ═══════════════════════════════════════════════════════════════════════════

async function loadSchools() {
  try {
    schools = await getAllSchools()
    renderSchoolsList()
    updateStats()
    populateHeadOfficeDropdown()
  } catch (err) {
    console.error('Failed to load schools:', err)
    toast('Failed to load schools', 'error')
  }
}

function renderSchoolsList() {
  renderList('schools-list', schools, school => {
    const moduleCount = (school.activeModules || []).length
    const statusClass = school.status === 'active' ? 'status-approved' : 'status-denied'
    const statusLabel = school.status === 'active' ? 'Active' : school.status
    const branding = school.branding || {}

    return `
      <div class="dash-list-item school-card" data-school-id="${esc(school.id)}">
        <div class="dash-list-header">
          <div style="display:flex;align-items:center;gap:12px;">
            ${branding.logo
              ? `<img src="${esc(branding.logo)}" alt="Logo" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" />`
              : `<div style="width:40px;height:40px;border-radius:8px;background:${esc(branding.primaryColor || '#2563eb')};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;">${esc((school.name || '?')[0])}</div>`
            }
            <div>
              <strong style="font-size:16px;">${esc(school.name)}</strong>
              <div style="font-size:12px;color:var(--text-muted);">${esc(school.slug || school.id)}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="dash-status-badge ${statusClass}">${esc(statusLabel)}</span>
            <span class="dash-status-badge status-pending">${esc(school.package || 'basic')}</span>
          </div>
        </div>
        <div class="dash-list-body" style="display:flex;gap:24px;flex-wrap:wrap;">
          <div><strong>${moduleCount}</strong> modules</div>
          <div>${esc(school.contactEmail || '—')}</div>
          <div>${esc(school.academicYear || '—')}</div>
          ${school.headOfficeId ? `<div style="color:var(--text-muted);">Branch of: ${esc(school.headOfficeId)}</div>` : ''}
        </div>
        <div class="dash-list-meta" style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn btn-ghost btn-sm btn-toggle-modules" data-id="${esc(school.id)}">Manage Modules</button>
          ${school.status === 'active'
            ? `<button class="btn btn-ghost btn-sm btn-suspend" data-id="${esc(school.id)}">Suspend</button>`
            : `<button class="btn btn-ghost btn-sm btn-activate" data-id="${esc(school.id)}">Activate</button>`
          }
        </div>
      </div>
    `
  }, 'No schools registered yet. Use the "Add School" tab to onboard your first school.')

  // Attach event listeners
  document.querySelectorAll('.btn-toggle-modules').forEach(btn => {
    btn.addEventListener('click', () => showModuleManager(btn.dataset.id))
  })
  document.querySelectorAll('.btn-suspend').forEach(btn => {
    btn.addEventListener('click', () => toggleSchoolStatus(btn.dataset.id, 'suspended'))
  })
  document.querySelectorAll('.btn-activate').forEach(btn => {
    btn.addEventListener('click', () => toggleSchoolStatus(btn.dataset.id, 'active'))
  })
}

async function toggleSchoolStatus(schoolId, status) {
  try {
    await updateSchool(schoolId, { status })
    toast(`School ${status === 'active' ? 'activated' : 'suspended'}`, 'success')
    await loadSchools()
  } catch (err) {
    toast('Failed to update school status', 'error')
  }
}

function updateStats() {
  document.getElementById('stat-schools').textContent = schools.length
  document.getElementById('stat-active').textContent = schools.filter(s => s.status === 'active').length
  // Total users calculated async below
  loadTotalUsers()
}

async function loadTotalUsers() {
  let total = 0
  for (const school of schools) {
    try {
      const users = await getSchoolUsers(school.id)
      total += users.length
    } catch (e) { /* ignore */ }
  }
  document.getElementById('stat-users').textContent = total
}

// ═══════════════════════════════════════════════════════════════════════════
//   MODULE MANAGER (inline toggle for each school)
// ═══════════════════════════════════════════════════════════════════════════

function showModuleManager(schoolId) {
  const school = schools.find(s => s.id === schoolId)
  if (!school) return

  const activeModules = school.activeModules || []
  const allModules = Object.values(MODULES)

  // Create modal
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay modal-visible'
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:520px;">
      <h3 class="modal-title">Manage Modules — ${esc(school.name)}</h3>
      <p class="modal-message">Toggle modules on/off for this school. Current package: <strong>${esc(school.package)}</strong></p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
        ${allModules.map(mod => `
          <label style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border);cursor:pointer;">
            <input type="checkbox" class="module-check" data-module="${esc(mod)}"
              ${activeModules.includes(mod) ? 'checked' : ''} />
            <span style="font-size:13px;text-transform:capitalize;">${esc(mod)}</span>
          </label>
        `).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary modal-cancel">Close</button>
        <button class="btn btn-primary modal-save">Save Changes</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })

  overlay.querySelector('.modal-save').addEventListener('click', async () => {
    const checks = overlay.querySelectorAll('.module-check')
    const newModules = []
    checks.forEach(cb => { if (cb.checked) newModules.push(cb.dataset.module) })

    try {
      await updateSchool(schoolId, { activeModules: newModules })
      toast('Modules updated', 'success')
      overlay.remove()
      await loadSchools()
    } catch (err) {
      toast('Failed to update modules', 'error')
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   ADD SCHOOL
// ═══════════════════════════════════════════════════════════════════════════

// Auto-generate slug from school name
const nameInput = document.getElementById('school-name')
const slugInput = document.getElementById('school-slug')
nameInput.addEventListener('input', () => {
  slugInput.value = nameInput.value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
})

// Show/hide custom modules based on package selection
const packageSelect = document.getElementById('school-package')
const customModulesDiv = document.getElementById('custom-modules')
const moduleTogglesDiv = document.getElementById('module-toggles')

packageSelect.addEventListener('change', () => {
  if (packageSelect.value === 'custom') {
    customModulesDiv.style.display = 'block'
    renderModuleToggles([])
  } else {
    customModulesDiv.style.display = 'none'
  }
})

function renderModuleToggles(selected) {
  moduleTogglesDiv.innerHTML = Object.values(MODULES).map(mod => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;">
      <input type="checkbox" class="custom-module-check" value="${esc(mod)}"
        ${selected.includes(mod) ? 'checked' : ''} />
      <span style="text-transform:capitalize;">${esc(mod)}</span>
    </label>
  `).join('')
}

// Sync color pickers with hex inputs
;['primary', 'secondary', 'accent'].forEach(name => {
  const picker = document.getElementById(`brand-${name}`)
  const hex = document.getElementById(`brand-${name}-hex`)
  picker.addEventListener('input', () => { hex.value = picker.value })
  hex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value
  })
})

// Populate head office dropdown
function populateHeadOfficeDropdown() {
  const select = document.getElementById('school-ho')
  const current = select.value
  select.innerHTML = '<option value="">None — standalone school</option>'
  schools.forEach(s => {
    select.innerHTML += `<option value="${esc(s.id)}">${esc(s.name)}</option>`
  })
  select.value = current
}

// Firebase REST API key for creating user accounts
const apiKey = 'AIzaSyA20MPMaSjsJt8qB-FsEXXP07d2Vn9d7BM'

document.getElementById('add-school-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const statusEl = 'add-school-status'

  const slug = slugInput.value.trim()
  const name = nameInput.value.trim()

  if (!slug || !name) {
    formStatus(statusEl, 'School name and ID are required.', 'error')
    return
  }

  // Check if school already exists
  if (schools.find(s => s.id === slug)) {
    formStatus(statusEl, 'A school with this ID already exists.', 'error')
    return
  }

  formStatus(statusEl, 'Creating school...', 'sending')

  try {
    // 1. Determine active modules from package
    const pkg = packageSelect.value
    let activeModules = []
    if (pkg === 'custom') {
      document.querySelectorAll('.custom-module-check:checked').forEach(cb => {
        activeModules.push(cb.value)
      })
    } else {
      activeModules = [...(PACKAGES[pkg]?.modules || [])]
    }

    // 2. Create school document
    await createSchool(slug, {
      name,
      package: pkg,
      activeModules,
      headOfficeId: document.getElementById('school-ho').value || null,
      contactEmail: document.getElementById('school-email').value.trim(),
      phone: document.getElementById('school-phone').value.trim(),
      address: document.getElementById('school-address').value.trim(),
      academicYear: document.getElementById('school-year').value.trim(),
      logo: document.getElementById('school-logo').value.trim(),
      primaryColor: document.getElementById('brand-primary').value,
      secondaryColor: document.getElementById('brand-secondary').value,
      accentColor: document.getElementById('brand-accent').value,
      createdBy: user.uid,
    })

    formStatus(statusEl, 'School created. Creating admin account...', 'sending')

    // 3. Create super admin account via REST API (doesn't sign out current user)
    const adminEmail = document.getElementById('admin-email').value.trim()
    const adminPassword = document.getElementById('admin-password').value
    const adminName = document.getElementById('admin-name').value.trim()

    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword, returnSecureToken: false }),
      }
    )
    const data = await res.json()

    if (data.error) {
      // School created but admin failed — show partial success
      formStatus(statusEl, `School created but admin account failed: ${data.error.message}. Create the admin manually.`, 'error')
      await loadSchools()
      return
    }

    // 4. Create user document for the super admin
    await createUserDoc(data.localId, {
      role: 'super_admin',
      email: adminEmail,
      displayName: adminName,
      schoolId: slug,
    })

    formStatus(statusEl, `School "${name}" created with admin ${adminEmail}!`, 'success')
    document.getElementById('add-school-form').reset()

    // Reset color pickers to defaults
    document.getElementById('brand-primary').value = '#2563eb'
    document.getElementById('brand-primary-hex').value = '#2563eb'
    document.getElementById('brand-secondary').value = '#16a34a'
    document.getElementById('brand-secondary-hex').value = '#16a34a'
    document.getElementById('brand-accent').value = '#f59e0b'
    document.getElementById('brand-accent-hex').value = '#f59e0b'
    customModulesDiv.style.display = 'none'

    await loadSchools()
    setTimeout(() => clearFormStatus(statusEl), 5000)

  } catch (err) {
    console.error('Failed to create school:', err)
    formStatus(statusEl, `Error: ${err.message}`, 'error')
  }
})

// ═══════════════════════════════════════════════════════════════════════════
//   PACKAGES VIEW
// ═══════════════════════════════════════════════════════════════════════════

function renderPackages() {
  const container = document.getElementById('packages-list')
  container.innerHTML = Object.entries(PACKAGES).map(([key, pkg]) => `
    <div class="dash-list-item" style="margin-bottom:12px;">
      <div class="dash-list-header">
        <strong style="font-size:16px;text-transform:capitalize;">${esc(pkg.name)}</strong>
        <span class="dash-status-badge status-pending">${pkg.modules.length} modules</span>
      </div>
      <div class="dash-list-body" style="display:flex;flex-wrap:wrap;gap:6px;">
        ${pkg.modules.length > 0
          ? pkg.modules.map(m => `<span style="background:var(--gray-100);padding:4px 10px;border-radius:var(--radius-full);font-size:12px;text-transform:capitalize;">${esc(m)}</span>`).join('')
          : '<span style="color:var(--text-light);font-size:13px;">Customized per school by Shumyle</span>'
        }
      </div>
    </div>
  `).join('')
}

// ═══════════════════════════════════════════════════════════════════════════
//   INIT
// ═══════════════════════════════════════════════════════════════════════════

renderPackages()
loadSchools()
