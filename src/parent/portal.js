/**
 * SchoolPortal — Parent Portal JS
 * Protected page: requires auth + parent role
 *
 * Displays school notices and announcements.
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import { getUserDoc, getNotices } from '../firebase/firestore.js'

// ── Auth Guard: must be parent ────────────────────────────────────────────
const { user } = await initGuard({
  requireAuth: true,
  requiredRole: 'parent',
})

const userDoc = await getUserDoc(user.uid)
const schoolId = userDoc?.schoolId || 'greenfield-academy'

// ── Populate UI ───────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName
document.getElementById('welcome-name').textContent = displayName

// ── Logout ────────────────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── Load Notices ──────────────────────────────────────────────────────────
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
              <h4>${escHtml(n.title)}</h4>
              ${n.priority !== 'normal' ? `<span class="dash-priority-badge ${n.priority}">${n.priority}</span>` : ''}
            </div>
            <p class="dash-list-item-body">${escHtml(n.body)}</p>
            <span class="dash-list-item-meta">From ${escHtml(n.authorName)} &middot; ${formatDate(date)}</span>
          </div>
        </div>`
    }).join('')
  } catch (err) {
    console.error('Failed to load notices:', err)
    noticesList.innerHTML = '<div class="dash-list-empty"><p>Unable to load notices. Please try again later.</p></div>'
  }
}

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

await loadNotices()
