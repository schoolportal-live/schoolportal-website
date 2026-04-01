/**
 * SchoolOS — Organization Hierarchy Builder
 * Protected page: requires auth + super_admin role
 *
 * Visual hierarchy builder for defining reporting chains.
 * Positions flow into the hierarchy engine for message/request routing.
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import {
  getPositions, createPosition, updatePosition, deletePosition,
  getSchoolUsers,
} from '../firebase/schools.js'
import { esc, toast, renderTable } from '../shared/components.js'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user, role, userDoc, school } = await initGuard({
  requireAuth: true,
  allowedRoles: ['super_admin'],
  loadSchool: true,
})

const schoolId = userDoc.schoolId

// ── Header ──────────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName
document.getElementById('school-name').textContent = school?.name || schoolId

document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── State ───────────────────────────────────────────────────────────────
let positions = []
let users = []

// ── Load Data ───────────────────────────────────────────────────────────
async function loadAll() {
  try {
    ;[positions, users] = await Promise.all([
      getPositions(schoolId),
      getSchoolUsers(schoolId),
    ])
    populateDropdowns()
    renderHierarchyTree()
    renderPositionsTable()
  } catch (err) {
    console.error('Failed to load hierarchy:', err)
    toast('Failed to load data', 'error')
  }
}

function populateDropdowns() {
  // User dropdown — show staff only (admin, teacher, line_manager)
  const userSelect = document.getElementById('position-user')
  const staffRoles = ['super_admin', 'admin', 'line_manager', 'teacher']
  const staff = users.filter(u => staffRoles.includes(u.role))
  userSelect.innerHTML = '<option value="">— Select user —</option>' +
    staff.map(u => `<option value="${esc(u.id)}">${esc(u.displayName || u.email)} (${esc(u.role)})</option>`).join('')

  // Reports To dropdown — existing positions
  const reportsSelect = document.getElementById('position-reports-to')
  reportsSelect.innerHTML = '<option value="">— None (Top Level) —</option>' +
    positions.map(p => `<option value="${esc(p.id)}">${esc(p.positionTitle)} ${p.assignedUserId ? '— ' + esc(getUserName(p.assignedUserId)) : ''}</option>`).join('')
}

function getUserName(uid) {
  const u = users.find(u => u.id === uid)
  return u?.displayName || u?.email || uid
}

// ── Add Position ────────────────────────────────────────────────────────
document.getElementById('add-position-btn').addEventListener('click', async () => {
  const title = document.getElementById('position-title').value.trim()
  const userId = document.getElementById('position-user').value
  const reportsTo = document.getElementById('position-reports-to').value || null
  const level = parseInt(document.getElementById('position-level').value) || 2

  if (!title) {
    toast('Position title is required', 'error')
    return
  }

  const statusEl = document.getElementById('add-status')
  statusEl.textContent = 'Adding...'
  statusEl.className = 'dash-form-status status-sending'

  try {
    // Determine roleType from assigned user
    const assignedUser = userId ? users.find(u => u.id === userId) : null
    await createPosition(schoolId, {
      positionTitle: title,
      roleType: assignedUser?.role || 'staff',
      assignedUserId: userId || null,
      reportsTo,
      notificationPriority: level,
    })

    // Clear form
    document.getElementById('position-title').value = ''
    document.getElementById('position-user').value = ''
    document.getElementById('position-reports-to').value = ''
    statusEl.textContent = 'Position added!'
    statusEl.className = 'dash-form-status status-success'

    await loadAll()
  } catch (err) {
    console.error('Failed to add position:', err)
    statusEl.textContent = 'Failed to add position'
    statusEl.className = 'dash-form-status status-error'
  }
})

// ── Hierarchy Tree ──────────────────────────────────────────────────────
function renderHierarchyTree() {
  const container = document.getElementById('hierarchy-tree')

  if (!positions.length) {
    container.innerHTML = '<p class="dash-empty">No positions defined yet. Add positions above to build your hierarchy.</p>'
    return
  }

  // Build tree from positions
  const posMap = new Map(positions.map(p => [p.id, { ...p, children: [] }]))

  const roots = []
  for (const [id, pos] of posMap) {
    if (pos.reportsTo && posMap.has(pos.reportsTo)) {
      posMap.get(pos.reportsTo).children.push(pos)
    } else {
      roots.push(pos)
    }
  }

  // Sort by priority
  const sortByPriority = arr => arr.sort((a, b) => (a.notificationPriority || 5) - (b.notificationPriority || 5))
  sortByPriority(roots)

  function renderNode(node, depth = 0) {
    sortByPriority(node.children)
    const indent = depth * 28
    const userName = node.assignedUserId ? esc(getUserName(node.assignedUserId)) : '<em>Unassigned</em>'
    const childCount = node.children.length
    return `
      <div class="hierarchy-node" style="margin-left:${indent}px;padding:8px 12px;border-left:3px solid var(--brand-primary, #2563eb);margin-bottom:4px;background:#f8fafc;border-radius:0 6px 6px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${esc(node.positionTitle)}</strong>
            <span style="margin-left:8px;color:#6b7280;font-size:13px;">${userName}</span>
            ${childCount > 0 ? `<span class="section-badge" style="margin-left:8px;">${childCount} report${childCount > 1 ? 's' : ''}</span>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm" data-delete="${esc(node.id)}" title="Remove position" style="color:#ef4444;">✕</button>
        </div>
      </div>
      ${node.children.map(c => renderNode(c, depth + 1)).join('')}
    `
  }

  container.innerHTML = roots.map(r => renderNode(r)).join('')

  // Wire delete buttons
  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const posId = btn.dataset.delete
      const pos = positions.find(p => p.id === posId)
      if (!window.confirm(`Remove position "${pos?.positionTitle || posId}"?`)) return

      try {
        await deletePosition(schoolId, posId)
        toast('Position removed', 'success')
        await loadAll()
      } catch (err) {
        toast('Failed to remove position', 'error')
      }
    })
  })
}

// ── Positions Table ────────────────────────────────────────────────────
function renderPositionsTable() {
  renderTable('positions-table', {
    columns: ['Title', 'Assigned User', 'Reports To', 'Level', 'Role Type'],
    rows: positions,
    rowFn: (p) => {
      const reportsToPos = p.reportsTo ? positions.find(x => x.id === p.reportsTo) : null
      return [
        esc(p.positionTitle),
        esc(p.assignedUserId ? getUserName(p.assignedUserId) : '—'),
        esc(reportsToPos ? reportsToPos.positionTitle : '— Top Level —'),
        String(p.notificationPriority || '—'),
        esc(p.roleType || '—'),
      ]
    },
    emptyMessage: 'No positions defined.',
  })
}

// ── Init ────────────────────────────────────────────────────────────────
loadAll()
