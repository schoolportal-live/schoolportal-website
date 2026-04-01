/**
 * SchoolOS — Hierarchy & Notification Routing Engine
 *
 * The backbone of SchoolOS. Every message, request, and notification
 * flows through this engine to determine who should be notified.
 *
 * Algorithm:
 *   1. Look up section → get homeTeacherId, lineManagerId
 *   2. Walk the reportsTo chain upward from homeTeacher to superAdmin
 *   3. Inject category-specific recipients (fee → accountant, transport → entry/exit)
 *   4. Always add receptionist + coordinator (if affiliated)
 *   5. Deduplicate and sort by hierarchy level
 *
 * Data sources (Firestore subcollections under schools/{schoolId}/):
 *   - sections/{sectionId}  → homeTeacherId, lineManagerId, subjectTeachers
 *   - hierarchy/{positionId} → positionTitle, roleType, assignedUserId, reportsTo, sections
 *   - users/{uid}           → role, adminSubRole, reportsTo, hierarchyLevel
 */

import { REQUEST_EXTRA_RECIPIENTS, HIERARCHY_LEVELS, ROLES } from './constants.js'

// ── Cache ──────────────────────────────────────────────────────────────────

/**
 * In-memory cache for a single school's hierarchy data.
 * Invalidated when school context changes or on manual refresh.
 */
let _cache = {
  schoolId: null,
  sections: null,     // Map<sectionId, sectionDoc>
  positions: null,    // Map<positionId, positionDoc>
  users: null,        // Map<uid, userDoc>
  loadedAt: 0,
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Load hierarchy data for a school into cache.
 * Called once per page load; subsequent calls use cache unless stale.
 *
 * @param {string} schoolId
 * @param {Object} loaders — Firestore query functions injected from schools.js
 * @param {Function} loaders.getSections — (schoolId) => sectionDoc[]
 * @param {Function} loaders.getPositions — (schoolId) => positionDoc[]
 * @param {Function} loaders.getSchoolUsers — (schoolId) => userDoc[]
 */
export async function loadHierarchy(schoolId, loaders) {
  const now = Date.now()
  if (_cache.schoolId === schoolId && (now - _cache.loadedAt) < CACHE_TTL) {
    return // Cache still valid
  }

  const [sections, positions, users] = await Promise.all([
    loaders.getSections(schoolId),
    loaders.getPositions(schoolId),
    loaders.getSchoolUsers(schoolId),
  ])

  _cache = {
    schoolId,
    sections: new Map(sections.map(s => [s.id, s])),
    positions: new Map(positions.map(p => [p.id, p])),
    users: new Map(users.map(u => [u.id, u])),
    loadedAt: now,
  }
}

/** Force cache refresh on next call */
export function invalidateHierarchy() {
  _cache.loadedAt = 0
}

// ── Notification Chain Builder ─────────────────────────────────────────────

/**
 * Build the notification chain for a given section and optional category.
 *
 * @param {string} sectionId — the class/section (e.g., "kg-b")
 * @param {string|null} category — message/request category (e.g., "fee", "transport")
 * @returns {Array<{uid: string, role: string, positionTitle: string}>}
 */
export function buildNotificationChain(sectionId, category = null) {
  if (!_cache.sections) {
    console.warn('Hierarchy not loaded. Call loadHierarchy() first.')
    return []
  }

  const section = _cache.sections.get(sectionId)
  if (!section) {
    console.warn(`Section "${sectionId}" not found in hierarchy cache.`)
    return []
  }

  const chain = []
  const seen = new Set()

  // Step 1: Add home teacher
  if (section.homeTeacherId) {
    addToChain(chain, seen, section.homeTeacherId, 'home_teacher')
  }

  // Step 2: Walk reportsTo chain upward from line manager
  if (section.lineManagerId) {
    walkChainUpward(chain, seen, section.lineManagerId)
  }

  // Step 3: Add all users with admin roles that are always in the base chain
  addBaseAdminRoles(chain, seen)

  // Step 4: Add category-specific recipients
  if (category && REQUEST_EXTRA_RECIPIENTS[category]) {
    const extraRoles = REQUEST_EXTRA_RECIPIENTS[category]
    for (const [uid, user] of _cache.users) {
      if (extraRoles.includes(user.adminSubRole) && !seen.has(uid)) {
        addToChain(chain, seen, uid, user.adminSubRole)
      }
    }
  }

  // Step 5: Ensure super admin is always in the chain
  for (const [uid, user] of _cache.users) {
    if (user.role === ROLES.SUPER_ADMIN && !seen.has(uid)) {
      addToChain(chain, seen, uid, 'super_admin')
    }
  }

  // Step 6: Sort by hierarchy level (lower = higher authority, appears later in chain)
  chain.sort((a, b) => {
    const levelA = HIERARCHY_LEVELS[a.role] ?? 99
    const levelB = HIERARCHY_LEVELS[b.role] ?? 99
    return levelB - levelA // Higher authority (lower number) at end → gets notified but chain starts with teacher
  })

  // Reverse so chain goes: teacher → line manager → ... → super admin
  chain.reverse()

  return chain
}

/**
 * Build an escalation chain for requests.
 * Same as notification chain but structured for step-by-step assignment.
 *
 * @param {string} sectionId
 * @param {string|null} category
 * @returns {Array<{uid, role, positionTitle, assignedAt, respondedAt, response}>}
 */
export function buildEscalationChain(sectionId, category = null) {
  const chain = buildNotificationChain(sectionId, category)
  return chain.map((recipient, index) => ({
    ...recipient,
    assignedAt: index === 0 ? new Date().toISOString() : null,
    respondedAt: null,
    response: null,
  }))
}

/**
 * Get the next person in the escalation chain.
 *
 * @param {Array} escalationChain — the request's escalationChain array
 * @param {number} currentLevel — current escalation level index
 * @returns {{uid, role, positionTitle}|null} — next assignee, or null if fully escalated
 */
export function getNextEscalationTarget(escalationChain, currentLevel) {
  const nextLevel = currentLevel + 1
  if (nextLevel >= escalationChain.length) return null
  return escalationChain[nextLevel]
}

// ── Section Lookup Helpers ─────────────────────────────────────────────────

/**
 * Get the home teacher for a section.
 */
export function getHomeTeacher(sectionId) {
  const section = _cache.sections?.get(sectionId)
  if (!section?.homeTeacherId) return null
  return _cache.users.get(section.homeTeacherId) || null
}

/**
 * Get all sections a teacher is assigned to (home + subject).
 */
export function getTeacherSections(teacherUid) {
  if (!_cache.sections) return []
  const results = []
  for (const [id, section] of _cache.sections) {
    if (section.homeTeacherId === teacherUid) {
      results.push({ ...section, assignmentType: 'home' })
    } else if (section.subjectTeachers) {
      const subjects = Object.entries(section.subjectTeachers)
        .filter(([, uid]) => uid === teacherUid)
        .map(([subject]) => subject)
      if (subjects.length > 0) {
        results.push({ ...section, assignmentType: 'subject', subjects })
      }
    }
  }
  return results
}

/**
 * Get all sections a line manager oversees.
 */
export function getManagerSections(managerUid) {
  if (!_cache.sections) return []
  return [..._cache.sections.values()].filter(s => s.lineManagerId === managerUid)
}

/**
 * Get all students in a section (returns user docs with role=student or parent).
 */
export function getSectionParents(sectionId) {
  if (!_cache.users) return []
  return [..._cache.users.values()].filter(u =>
    u.role === ROLES.PARENT &&
    u.children?.some(c => c.sectionId === sectionId)
  )
}

// ── Internal Helpers ───────────────────────────────────────────────────────

function addToChain(chain, seen, uid, role) {
  if (seen.has(uid)) return
  seen.add(uid)
  const user = _cache.users.get(uid)
  chain.push({
    uid,
    role: user?.role || role,
    positionTitle: user?.positionTitle || role,
    displayName: user?.displayName || 'Unknown',
  })
}

function walkChainUpward(chain, seen, uid) {
  let current = uid
  let depth = 0
  const MAX_DEPTH = 20 // Safety limit to prevent infinite loops

  while (current && depth < MAX_DEPTH) {
    const user = _cache.users.get(current)
    if (!user) break
    addToChain(chain, seen, current, user.role)
    current = user.reportsTo || null
    depth++
  }
}

function addBaseAdminRoles(chain, seen) {
  // Receptionist and coordinator are always in the base chain
  const baseRoles = ['receptionist', 'coordinator']
  for (const [uid, user] of _cache.users) {
    if (user.role === ROLES.ADMIN && baseRoles.includes(user.adminSubRole) && !seen.has(uid)) {
      addToChain(chain, seen, uid, user.adminSubRole)
    }
  }
}
