/**
 * SchoolOS — Schools & Subcollection Firestore Helpers
 *
 * Multi-tenant data layer. All school-specific data lives under:
 *   schools/{schoolId}/subcollection/{docId}
 *
 * Platform-level:
 *   schools/{schoolId}       → school org unit (name, branding, package, modules)
 *   platform/config          → platform-wide settings, package definitions
 *   users/{uid}              → top-level for auth lookup (stays in existing firestore.js)
 *
 * School-scoped subcollections:
 *   schools/{schoolId}/classes/{classId}
 *   schools/{schoolId}/sections/{sectionId}
 *   schools/{schoolId}/students/{studentId}
 *   schools/{schoolId}/hierarchy/{positionId}
 *   schools/{schoolId}/notices/{id}
 *   schools/{schoolId}/messages/{id}
 *   schools/{schoolId}/requests/{id}
 *   schools/{schoolId}/attendance/{id}
 *   schools/{schoolId}/fees/{id}
 *   schools/{schoolId}/results/{id}
 *   schools/{schoolId}/homework/{id}
 *   schools/{schoolId}/requisitions/{id}
 *   schools/{schoolId}/requisitionCatalogue/{id}
 *   schools/{schoolId}/paperRequisitions/{id}
 *   schools/{schoolId}/events/{id}
 *   schools/{schoolId}/transport/{routeId}
 *   schools/{schoolId}/transportRequests/{id}
 *   schools/{schoolId}/timetable/{sectionId}
 *   schools/{schoolId}/library/books/{id}
 *   schools/{schoolId}/library/transactions/{id}
 *   schools/{schoolId}/notifications/{id}
 */
import {
  doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  collection, query, where, orderBy, limit, getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './config.js'

// ── Helper: subcollection reference ────────────────────────────────────────

function schoolRef(schoolId) {
  return doc(db, 'schools', schoolId)
}

function schoolCol(schoolId, subcollection) {
  return collection(db, 'schools', schoolId, subcollection)
}

function schoolDoc(schoolId, subcollection, docId) {
  return doc(db, 'schools', schoolId, subcollection, docId)
}

// ═══════════════════════════════════════════════════════════════════════════
//   SCHOOLS (Top-Level)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new school org unit.
 * Called by Shumyle (platform_admin) during onboarding.
 */
export async function createSchool(schoolId, data) {
  await setDoc(schoolRef(schoolId), {
    name: data.name,
    slug: schoolId,
    headOfficeId: data.headOfficeId || null,
    branches: data.branches || [],
    package: data.package || 'basic',
    activeModules: data.activeModules || [],
    branding: {
      logo: data.logo || '',
      schoolName: data.name,
      primaryColor: data.primaryColor || '#2563eb',
      secondaryColor: data.secondaryColor || '#16a34a',
      accentColor: data.accentColor || '#f59e0b',
    },
    contactEmail: data.contactEmail || '',
    address: data.address || '',
    phone: data.phone || '',
    academicYear: data.academicYear || '',
    status: 'active',
    createdBy: data.createdBy || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Fetch a school document.
 */
export async function getSchool(schoolId) {
  const snap = await getDoc(schoolRef(schoolId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * Fetch all schools (for platform admin dashboard).
 */
export async function getAllSchools() {
  const q = query(collection(db, 'schools'), orderBy('name'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Update school fields (branding, package, modules, status, etc).
 */
export async function updateSchool(schoolId, fields) {
  await updateDoc(schoolRef(schoolId), {
    ...fields,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Toggle a module on/off for a school.
 */
export async function toggleSchoolModule(schoolId, moduleName, enabled) {
  const school = await getSchool(schoolId)
  if (!school) return
  let modules = school.activeModules || []
  if (enabled && !modules.includes(moduleName)) {
    modules = [...modules, moduleName]
  } else if (!enabled) {
    modules = modules.filter(m => m !== moduleName)
  }
  await updateSchool(schoolId, { activeModules: modules })
}

/**
 * Get branches for a head office school.
 */
export async function getBranches(headOfficeId) {
  const q = query(
    collection(db, 'schools'),
    where('headOfficeId', '==', headOfficeId),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ═══════════════════════════════════════════════════════════════════════════
//   CLASSES & SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function createClass(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'classes'), {
    name: data.name,
    sortOrder: data.sortOrder || 0,
    sections: data.sections || [],
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getClasses(schoolId) {
  const q = query(schoolCol(schoolId, 'classes'), orderBy('sortOrder'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function createSection(schoolId, data) {
  await setDoc(schoolDoc(schoolId, 'sections', data.sectionId), {
    classId: data.classId,
    sectionLetter: data.sectionLetter,
    displayName: data.displayName,
    homeTeacherId: data.homeTeacherId || null,
    lineManagerId: data.lineManagerId || null,
    subjectTeachers: data.subjectTeachers || {},
    studentCount: data.studentCount || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function getSections(schoolId) {
  const snap = await getDocs(schoolCol(schoolId, 'sections'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateSection(schoolId, sectionId, fields) {
  await updateDoc(schoolDoc(schoolId, 'sections', sectionId), {
    ...fields,
    updatedAt: serverTimestamp(),
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   STUDENTS
// ═══════════════════════════════════════════════════════════════════════════

export async function createStudent(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'students'), {
    name: data.name,
    classId: data.classId,
    sectionId: data.sectionId,
    rollNumber: data.rollNumber || '',
    parentIds: data.parentIds || [],
    dateOfBirth: data.dateOfBirth || '',
    gender: data.gender || '',
    bloodGroup: data.bloodGroup || '',
    address: data.address || '',
    transportRoute: data.transportRoute || null,
    status: 'active',
    admissionDate: data.admissionDate || new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getStudentsBySection(schoolId, sectionId) {
  const q = query(
    schoolCol(schoolId, 'students'),
    where('sectionId', '==', sectionId),
    where('status', '==', 'active'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllStudents(schoolId) {
  const q = query(
    schoolCol(schoolId, 'students'),
    where('status', '==', 'active'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateStudent(schoolId, studentId, fields) {
  await updateDoc(schoolDoc(schoolId, 'students', studentId), {
    ...fields,
    updatedAt: serverTimestamp(),
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   HIERARCHY POSITIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function createPosition(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'hierarchy'), {
    positionTitle: data.positionTitle,
    roleType: data.roleType,
    assignedUserId: data.assignedUserId || null,
    reportsTo: data.reportsTo || null,
    sections: data.sections || [],
    notificationPriority: data.notificationPriority || 5,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getPositions(schoolId) {
  const snap = await getDocs(schoolCol(schoolId, 'hierarchy'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updatePosition(schoolId, positionId, fields) {
  await updateDoc(schoolDoc(schoolId, 'hierarchy', positionId), {
    ...fields,
    updatedAt: serverTimestamp(),
  })
}

export async function deletePosition(schoolId, positionId) {
  await deleteDoc(schoolDoc(schoolId, 'hierarchy', positionId))
}

// ═══════════════════════════════════════════════════════════════════════════
//   SCHOOL USERS QUERY (for hierarchy engine)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all users belonging to a school.
 * Uses the top-level users collection (scoped by schoolId field).
 */
export async function getSchoolUsers(schoolId) {
  const q = query(
    collection(db, 'users'),
    where('schoolId', '==', schoolId),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ═══════════════════════════════════════════════════════════════════════════
//   HIERARCHY LOADER (for hierarchy.js engine)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the loader functions expected by hierarchy.js loadHierarchy().
 */
export function getHierarchyLoaders() {
  return {
    getSections,
    getPositions,
    getSchoolUsers,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//   PLATFORM CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export async function getPlatformConfig() {
  const snap = await getDoc(doc(db, 'platform', 'config'))
  if (!snap.exists()) return null
  return snap.data()
}

export async function updatePlatformConfig(fields) {
  await setDoc(doc(db, 'platform', 'config'), {
    ...fields,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

// ═══════════════════════════════════════════════════════════════════════════
//   MESSAGES (hierarchy-routed communication)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a message routed through the hierarchy.
 * recipientUids is the computed notification chain (written at creation time).
 */
export async function createMessage(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'messages'), {
    senderId: data.senderId,
    senderName: data.senderName,
    senderRole: data.senderRole,
    category: data.category || 'general',
    subject: data.subject || '',
    body: data.body,
    sectionId: data.sectionId || null,
    studentId: data.studentId || null,
    studentName: data.studentName || '',
    recipientUids: data.recipientUids || [],
    readBy: [],
    repliedBy: [],
    replies: [],
    status: 'sent',
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Add a reply to a message.
 */
export async function addMessageReply(schoolId, messageId, reply) {
  const msgRef = schoolDoc(schoolId, 'messages', messageId)
  const snap = await getDoc(msgRef)
  if (!snap.exists()) return
  const msg = snap.data()
  const replies = msg.replies || []
  replies.push({
    senderId: reply.senderId,
    senderName: reply.senderName,
    senderRole: reply.senderRole,
    body: reply.body,
    createdAt: new Date().toISOString(),
  })
  await updateDoc(msgRef, {
    replies,
    repliedBy: [...new Set([...(msg.repliedBy || []), reply.senderId])],
  })
}

/**
 * Mark a message as read by a user.
 */
export async function markMessageRead(schoolId, messageId, uid) {
  const msgRef = schoolDoc(schoolId, 'messages', messageId)
  const snap = await getDoc(msgRef)
  if (!snap.exists()) return
  const readBy = snap.data().readBy || []
  if (!readBy.includes(uid)) {
    await updateDoc(msgRef, { readBy: [...readBy, uid] })
  }
}

/**
 * Fetch messages where user is sender or in recipientUids.
 */
export async function getMessagesForUser(schoolId, uid, maxResults = 100) {
  // Firestore doesn't support OR queries across fields, so we run two queries
  const [sentQ, recvQ] = await Promise.all([
    getDocs(query(
      schoolCol(schoolId, 'messages'),
      where('senderId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    )),
    getDocs(query(
      schoolCol(schoolId, 'messages'),
      where('recipientUids', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    )),
  ])

  const map = new Map()
  sentQ.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }))
  recvQ.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }))

  return [...map.values()].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0
    const tb = b.createdAt?.toMillis?.() || 0
    return tb - ta
  })
}

/**
 * Fetch all messages for a school (admin/coordinator view).
 */
export async function getAllMessages(schoolId, maxResults = 200) {
  const q = query(
    schoolCol(schoolId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUESTS (hierarchy-routed with escalation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a request routed through the hierarchy.
 * escalationChain is the ordered list of handlers.
 */
export async function createRequest(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'requests'), {
    senderId: data.senderId,
    senderName: data.senderName,
    senderRole: data.senderRole,
    requestType: data.requestType,
    subject: data.subject || '',
    body: data.body,
    sectionId: data.sectionId || null,
    studentId: data.studentId || null,
    studentName: data.studentName || '',
    recipientUids: data.recipientUids || [],
    escalationChain: data.escalationChain || [],
    currentHandler: data.currentHandler || 0,
    status: 'pending',
    comments: [],
    readBy: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Update request status (acknowledge, approve, deny, escalate, resolve).
 */
export async function updateRequestStatus(schoolId, requestId, status, comment) {
  const reqRef = schoolDoc(schoolId, 'requests', requestId)
  const snap = await getDoc(reqRef)
  if (!snap.exists()) return
  const req = snap.data()

  const updates = { status, updatedAt: serverTimestamp() }

  // If escalating, advance the handler
  if (status === 'escalated') {
    updates.currentHandler = (req.currentHandler || 0) + 1
  }

  // Add comment if provided
  if (comment) {
    const comments = req.comments || []
    comments.push({
      uid: comment.uid,
      name: comment.name,
      role: comment.role,
      body: comment.body,
      status,
      createdAt: new Date().toISOString(),
    })
    updates.comments = comments
  }

  await updateDoc(reqRef, updates)
}

/**
 * Mark a request as read by a user.
 */
export async function markRequestRead(schoolId, requestId, uid) {
  const reqRef = schoolDoc(schoolId, 'requests', requestId)
  const snap = await getDoc(reqRef)
  if (!snap.exists()) return
  const readBy = snap.data().readBy || []
  if (!readBy.includes(uid)) {
    await updateDoc(reqRef, { readBy: [...readBy, uid] })
  }
}

/**
 * Fetch requests where user is sender or in recipientUids.
 */
export async function getRequestsForUser(schoolId, uid, maxResults = 100) {
  const [sentQ, recvQ] = await Promise.all([
    getDocs(query(
      schoolCol(schoolId, 'requests'),
      where('senderId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    )),
    getDocs(query(
      schoolCol(schoolId, 'requests'),
      where('recipientUids', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    )),
  ])

  const map = new Map()
  sentQ.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }))
  recvQ.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }))

  return [...map.values()].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0
    const tb = b.createdAt?.toMillis?.() || 0
    return tb - ta
  })
}

/**
 * Fetch all requests for a school (admin view).
 */
export async function getAllRequests(schoolId, maxResults = 200) {
  const q = query(
    schoolCol(schoolId, 'requests'),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ═══════════════════════════════════════════════════════════════════════════
//   NOTIFICATIONS (per-user feed)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a notification for a user.
 */
export async function createNotification(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'notifications'), {
    uid: data.uid,
    type: data.type,         // 'message', 'request', 'escalation', 'announcement'
    title: data.title,
    body: data.body || '',
    refType: data.refType || null,   // 'messages', 'requests'
    refId: data.refId || null,
    read: false,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Fetch notifications for a user, newest first.
 */
export async function getNotifications(schoolId, uid, maxResults = 50) {
  const q = query(
    schoolCol(schoolId, 'notifications'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(schoolId, notificationId) {
  await updateDoc(schoolDoc(schoolId, 'notifications', notificationId), { read: true })
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadNotificationCount(schoolId, uid) {
  const q = query(
    schoolCol(schoolId, 'notifications'),
    where('uid', '==', uid),
    where('read', '==', false),
  )
  const snap = await getDocs(q)
  return snap.size
}

/**
 * Send notifications to all recipients in a chain.
 * Called after creating a message or request.
 */
export async function notifyRecipients(schoolId, recipientUids, notification) {
  const promises = recipientUids.map(uid =>
    createNotification(schoolId, { ...notification, uid })
  )
  await Promise.all(promises)
}

// ═══════════════════════════════════════════════════════════════════════════
//   ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save or update attendance for a section on a given date.
 * Document ID = `{date}_{sectionId}` for easy upserts.
 * records: Array of { studentId, studentName, status, rfidStatus?, discrepancy? }
 */
export async function saveAttendance(schoolId, { date, sectionId, teacherId, teacherName, records }) {
  const docId = `${date}_${sectionId}`
  await setDoc(schoolDoc(schoolId, 'attendance', docId), {
    date,
    sectionId,
    teacherId,
    teacherName,
    records,
    recordCount: records.length,
    presentCount: records.filter(r => r.status === 'present').length,
    absentCount: records.filter(r => r.status === 'absent').length,
    lateCount: records.filter(r => r.status === 'late').length,
    hasDiscrepancy: records.some(r => r.discrepancy),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * Get attendance for a section on a date.
 */
export async function getAttendance(schoolId, date, sectionId) {
  const docId = `${date}_${sectionId}`
  const snap = await getDoc(schoolDoc(schoolId, 'attendance', docId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * Get all attendance records for a section in a date range.
 */
export async function getAttendanceBySection(schoolId, sectionId, maxResults = 30) {
  const q = query(
    schoolCol(schoolId, 'attendance'),
    where('sectionId', '==', sectionId),
    orderBy('date', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Upload RFID attendance CSV data (parsed client-side).
 * Compares against teacher-marked attendance and flags discrepancies.
 */
export async function uploadRfidAttendance(schoolId, { date, sectionId, rfidRecords }) {
  const docId = `${date}_${sectionId}`
  const snap = await getDoc(schoolDoc(schoolId, 'attendance', docId))

  if (!snap.exists()) {
    // No teacher attendance yet — save RFID only
    await setDoc(schoolDoc(schoolId, 'attendance', docId), {
      date,
      sectionId,
      rfidRecords,
      rfidUploaded: true,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return { discrepancies: [] }
  }

  // Compare with teacher records
  const existing = snap.data()
  const teacherRecords = existing.records || []
  const discrepancies = []

  for (const rfid of rfidRecords) {
    const teacher = teacherRecords.find(t => t.studentId === rfid.studentId)
    if (teacher && teacher.status !== rfid.status) {
      discrepancies.push({
        studentId: rfid.studentId,
        studentName: rfid.studentName || teacher.studentName,
        teacherStatus: teacher.status,
        rfidStatus: rfid.status,
      })
      teacher.rfidStatus = rfid.status
      teacher.discrepancy = true
    }
  }

  await setDoc(schoolDoc(schoolId, 'attendance', docId), {
    records: teacherRecords,
    rfidRecords,
    rfidUploaded: true,
    hasDiscrepancy: discrepancies.length > 0,
    discrepancyCount: discrepancies.length,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  return { discrepancies }
}

// ═══════════════════════════════════════════════════════════════════════════
//   HOMEWORK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assign homework.
 */
export async function createHomework(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'homework'), {
    sectionId: data.sectionId,
    subject: data.subject,
    title: data.title,
    description: data.description || '',
    deadline: data.deadline,
    teacherId: data.teacherId,
    teacherName: data.teacherName,
    completions: {},  // { studentId: { parentMarked: bool, teacherVerified: status } }
    status: 'assigned',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Get homework for a section.
 */
export async function getHomeworkBySection(schoolId, sectionId, maxResults = 50) {
  const q = query(
    schoolCol(schoolId, 'homework'),
    where('sectionId', '==', sectionId),
    orderBy('deadline', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Get homework assigned by a teacher.
 */
export async function getHomeworkByTeacher(schoolId, teacherId, maxResults = 50) {
  const q = query(
    schoolCol(schoolId, 'homework'),
    where('teacherId', '==', teacherId),
    orderBy('deadline', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Parent marks homework as completed for their child.
 */
export async function markHomeworkCompleted(schoolId, homeworkId, studentId) {
  const hwRef = schoolDoc(schoolId, 'homework', homeworkId)
  const snap = await getDoc(hwRef)
  if (!snap.exists()) return
  const hw = snap.data()
  const completions = hw.completions || {}
  completions[studentId] = {
    ...(completions[studentId] || {}),
    parentMarked: true,
    parentMarkedAt: new Date().toISOString(),
  }
  await updateDoc(hwRef, { completions, updatedAt: serverTimestamp() })
}

/**
 * Teacher verifies homework completion for a student.
 * status: 'approved', 'incomplete', 'not_completed'
 */
export async function verifyHomework(schoolId, homeworkId, studentId, status) {
  const hwRef = schoolDoc(schoolId, 'homework', homeworkId)
  const snap = await getDoc(hwRef)
  if (!snap.exists()) return
  const hw = snap.data()
  const completions = hw.completions || {}
  completions[studentId] = {
    ...(completions[studentId] || {}),
    teacherVerified: status,
    teacherVerifiedAt: new Date().toISOString(),
  }
  await updateDoc(hwRef, { completions, updatedAt: serverTimestamp() })
}

// ═══════════════════════════════════════════════════════════════════════════
//   FEES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a fee record for a student.
 */
export async function createFee(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'fees'), {
    studentId: data.studentId,
    studentName: data.studentName,
    sectionId: data.sectionId,
    classId: data.classId,
    month: data.month,
    year: data.year || data.month?.split('-')[0],
    feeType: data.feeType || 'monthly',
    amount: data.amount,
    discount: data.discount || 0,
    amountDue: (data.amount || 0) - (data.discount || 0),
    amountPaid: 0,
    status: 'unpaid',
    dueDate: data.dueDate || '',
    payments: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Bulk-create fees for students for a month.
 */
export async function bulkCreateFees(schoolId, students, { month, amount, feeType, dueDate }) {
  const promises = students.map(s =>
    createFee(schoolId, {
      studentId: s.id, studentName: s.name, sectionId: s.sectionId,
      classId: s.classId, month, feeType, amount, dueDate,
    })
  )
  return Promise.all(promises)
}

/**
 * Record a payment against a fee.
 */
export async function recordPayment(schoolId, feeId, payment) {
  const feeRef = schoolDoc(schoolId, 'fees', feeId)
  const snap = await getDoc(feeRef)
  if (!snap.exists()) return
  const fee = snap.data()
  const payments = fee.payments || []
  payments.push({
    amount: payment.amount,
    method: payment.method || 'cash',
    reference: payment.reference || '',
    date: payment.date || new Date().toISOString().split('T')[0],
    recordedBy: payment.recordedBy || '',
    createdAt: new Date().toISOString(),
  })
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
  const amountDue = fee.amountDue || fee.amount || 0
  const status = totalPaid >= amountDue ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'
  await updateDoc(feeRef, { payments, amountPaid: totalPaid, status, updatedAt: serverTimestamp() })
}

/**
 * Get fees for a student.
 */
export async function getFeesByStudent(schoolId, studentId, maxResults = 24) {
  const q = query(schoolCol(schoolId, 'fees'), where('studentId', '==', studentId), orderBy('month', 'desc'), limit(maxResults))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Get all fees for a month (admin view).
 */
export async function getFeesByMonth(schoolId, month) {
  const q = query(schoolCol(schoolId, 'fees'), where('month', '==', month))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Get all unpaid/partial fees.
 */
export async function getOutstandingFees(schoolId) {
  const q = query(schoolCol(schoolId, 'fees'), where('status', 'in', ['unpaid', 'partial']))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Parse bank statement CSV and attempt to match payments to fees.
 */
export function matchBankStatement(fees, csvRecords) {
  const matched = []
  const unmatched = []
  for (const record of csvRecords) {
    const fee = fees.find(f =>
      f.status !== 'paid' &&
      (f.studentName?.toLowerCase().includes(record.description?.toLowerCase()) ||
       record.reference?.includes(f.id?.slice(-6)))
    )
    if (fee) matched.push({ fee, record })
    else unmatched.push(record)
  }
  return { matched, unmatched }
}

// ═══════════════════════════════════════════════════════════════════════════
//   RESULTS / EXAMS
// ═══════════════════════════════════════════════════════════════════════════

export async function createExam(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'results'), {
    name: data.name,
    examType: data.examType,
    classId: data.classId,
    sectionId: data.sectionId || null,
    subjects: data.subjects || [],
    maxMarks: data.maxMarks || {},
    gradeScale: data.gradeScale || null,
    results: {},
    published: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function saveExamResults(schoolId, examId, results) {
  await updateDoc(schoolDoc(schoolId, 'results', examId), { results, updatedAt: serverTimestamp() })
}

export async function publishExamResults(schoolId, examId) {
  await updateDoc(schoolDoc(schoolId, 'results', examId), { published: true, publishedAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

export async function getExamsByClass(schoolId, classId) {
  const q = query(schoolCol(schoolId, 'results'), where('classId', '==', classId), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllExams(schoolId) {
  const q = query(schoolCol(schoolId, 'results'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getStudentResults(schoolId, classId) {
  const q = query(schoolCol(schoolId, 'results'), where('classId', '==', classId), where('published', '==', true))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUISITION CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════

export async function addCatalogueItem(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'requisitionCatalogue'), {
    name: data.name, category: data.category || 'general',
    unit: data.unit || 'pcs', defaultQty: data.defaultQty || 1,
    currentStock: data.currentStock || 0, isActive: true,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getCatalogue(schoolId) {
  const q = query(schoolCol(schoolId, 'requisitionCatalogue'), where('isActive', '==', true), orderBy('name'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateCatalogueItem(schoolId, itemId, fields) {
  await updateDoc(schoolDoc(schoolId, 'requisitionCatalogue', itemId), { ...fields })
}

// ═══════════════════════════════════════════════════════════════════════════
//   REQUISITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a requisition (teacher submits items needed).
 */
export async function createRequisition(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'requisitions'), {
    teacherId: data.teacherId,
    teacherName: data.teacherName,
    sectionId: data.sectionId,
    eventId: data.eventId || null,   // linked requisition event
    eventName: data.eventName || '',
    items: data.items || [],  // [{ catalogueId, name, requestedQty, approvedQty?, comment? }]
    status: 'submitted',      // submitted → reviewed → approved → dispatched
    reviewerId: null,
    reviewerName: null,
    reviewComments: [],
    totalItems: (data.items || []).length,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * LM reviews a requisition — can adjust quantities and add comments.
 */
export async function reviewRequisition(schoolId, reqId, { reviewerId, reviewerName, items, comments }) {
  await updateDoc(schoolDoc(schoolId, 'requisitions', reqId), {
    items,
    status: 'reviewed',
    reviewerId, reviewerName,
    reviewComments: comments || [],
    updatedAt: serverTimestamp(),
  })
}

/**
 * Approve/dispatch a requisition (requisition_incharge).
 */
export async function approveRequisition(schoolId, reqId, status) {
  await updateDoc(schoolDoc(schoolId, 'requisitions', reqId), {
    status, updatedAt: serverTimestamp(),
  })
}

export async function getRequisitionsByTeacher(schoolId, teacherId) {
  const q = query(schoolCol(schoolId, 'requisitions'), where('teacherId', '==', teacherId), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllRequisitions(schoolId) {
  const q = query(schoolCol(schoolId, 'requisitions'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Paper Requisitions ─────────────────────────────────────────────────
export async function createPaperRequisition(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'paperRequisitions'), {
    teacherId: data.teacherId,
    teacherName: data.teacherName,
    sectionId: data.sectionId,
    sectionName: data.sectionName || '',
    examName: data.examName || '',
    examType: data.examType || '',
    subjects: data.subjects || [],
    studentCount: data.studentCount || 0,
    pagesPerStudent: data.pagesPerStudent || 4,
    calculations: data.calculations || [],  // [{subject, students, pages, total}]
    totalSheets: data.totalSheets || 0,
    adjustedSheets: data.adjustedSheets || 0,  // after teacher override
    notes: data.notes || '',
    status: 'submitted',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getPaperRequisitions(schoolId) {
  const q = query(schoolCol(schoolId, 'paperRequisitions'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getPaperRequisitionsByTeacher(schoolId, teacherId) {
  const q = query(schoolCol(schoolId, 'paperRequisitions'), where('teacherId', '==', teacherId), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function approvePaperRequisition(schoolId, reqId, status) {
  await updateDoc(schoolDoc(schoolId, 'paperRequisitions', reqId), {
    status,
    updatedAt: serverTimestamp(),
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//   EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export async function createSchoolEvent(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'events'), {
    title: data.title, description: data.description || '',
    date: data.date, time: data.time || '',
    location: data.location || '', eventType: data.eventType || 'general',
    category: data.category || data.eventType || 'general',
    isRecurring: data.isRecurring || false,
    reminderDays: data.reminderDays ?? 7,
    targetAudience: data.targetAudience || 'all',
    linkedRequisitionId: data.linkedRequisitionId || null,
    requiresRequisition: data.requiresRequisition || false,
    requiresApproval: data.requiresApproval || false,
    approvalRequired: data.approvalRequired || data.requiresApproval || false,
    approvalStatus: data.approvalRequired || data.requiresApproval ? 'pending' : null,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getSchoolEvents(schoolId, maxResults = 100) {
  const q = query(schoolCol(schoolId, 'events'), orderBy('date', 'asc'), limit(maxResults))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateSchoolEvent(schoolId, eventId, fields) {
  await updateDoc(schoolDoc(schoolId, 'events', eventId), {
    ...fields,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteSchoolEvent(schoolId, eventId) {
  await deleteDoc(schoolDoc(schoolId, 'events', eventId))
}

export async function getUpcomingEvents(schoolId, daysAhead = 30) {
  const today = new Date().toISOString().split('T')[0]
  const futureDate = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0]
  const q = query(
    schoolCol(schoolId, 'events'),
    where('date', '>=', today),
    where('date', '<=', futureDate),
    orderBy('date', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getEventsByMonth(schoolId, yearMonth) {
  const startDate = yearMonth + '-01'
  const [y, m] = yearMonth.split('-').map(Number)
  const endDate = yearMonth + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0')
  const q = query(
    schoolCol(schoolId, 'events'),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ═══════════════════════════════════════════════════════════════════════════
//   TRANSPORT
// ═══════════════════════════════════════════════════════════════════════════

export async function createTransportRoute(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'transport'), {
    routeName: data.routeName, driverName: data.driverName || '',
    driverPhone: data.driverPhone || '', vehicleNumber: data.vehicleNumber || '',
    stops: data.stops || [], studentCount: 0, isActive: true,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getTransportRoutes(schoolId) {
  const q = query(schoolCol(schoolId, 'transport'), where('isActive', '==', true))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function createTransportRequest(schoolId, data) {
  const ref = await addDoc(schoolCol(schoolId, 'transportRequests'), {
    parentId: data.parentId, parentName: data.parentName,
    studentId: data.studentId, studentName: data.studentName,
    requestType: data.requestType,  // alternate_pickup, route_change
    pickupPerson: data.pickupPerson || {},  // { name, relation, nationalId, phone }
    reason: data.reason || '', date: data.date || '',
    status: 'pending', createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getTransportRequests(schoolId, maxResults = 50) {
  const q = query(schoolCol(schoolId, 'transportRequests'), orderBy('createdAt', 'desc'), limit(maxResults))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ═══════════════════════════════════════════════════════════════════════════
//   TIMETABLE
// ═══════════════════════════════════════════════════════════════════════════

export async function saveTimetable(schoolId, sectionId, data) {
  await setDoc(schoolDoc(schoolId, 'timetable', sectionId), {
    sectionId, periods: data.periods || [],
    breaks: data.breaks || [], zeroPeriods: data.zeroPeriods || [],
    schedule: data.schedule || {},  // { day: [{ periodIndex, subject, teacherId }] }
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function getTimetable(schoolId, sectionId) {
  const snap = await getDoc(schoolDoc(schoolId, 'timetable', sectionId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

// ═══════════════════════════════════════════════════════════════════════════
//   DOCUMENTS & MEDICAL
// ═══════════════════════════════════════════════════════════════════════════

export async function updateStudentDocuments(schoolId, studentId, documents) {
  await updateDoc(schoolDoc(schoolId, 'students', studentId), {
    documents, updatedAt: serverTimestamp(),
  })
}

export async function saveMedicalRecord(schoolId, studentId, medicalData) {
  await setDoc(doc(db, 'schools', schoolId, 'medicalRecords', studentId), {
    studentId, ...medicalData,
    status: medicalData.status || 'pending_approval',
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function getMedicalRecord(schoolId, studentId) {
  const snap = await getDoc(doc(db, 'schools', schoolId, 'medicalRecords', studentId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

// ═══════════════════════════════════════════════════════════════════════════
//   LIBRARY
// ═══════════════════════════════════════════════════════════════════════════

export async function addLibraryBook(schoolId, data) {
  const ref = await addDoc(collection(db, 'schools', schoolId, 'library', 'books', 'items'), {
    title: data.title, author: data.author || '', isbn: data.isbn || '',
    category: data.category || '', copies: data.copies || 1,
    availableCopies: data.copies || 1, location: data.location || '',
    barcode: data.barcode || '', isActive: true,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getLibraryBooks(schoolId) {
  const q = query(collection(db, 'schools', schoolId, 'library', 'books', 'items'), where('isActive', '==', true), orderBy('title'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function issueBook(schoolId, data) {
  const ref = await addDoc(collection(db, 'schools', schoolId, 'library', 'transactions', 'items'), {
    bookId: data.bookId, bookTitle: data.bookTitle,
    borrowerId: data.borrowerId, borrowerName: data.borrowerName,
    borrowerType: data.borrowerType,  // student, teacher
    issueDate: data.issueDate || new Date().toISOString().split('T')[0],
    dueDate: data.dueDate, returnDate: null, status: 'issued',
    createdAt: serverTimestamp(),
  })
  // Decrement available copies
  const bookRef = doc(db, 'schools', schoolId, 'library', 'books', 'items', data.bookId)
  const bookSnap = await getDoc(bookRef)
  if (bookSnap.exists()) {
    const avail = (bookSnap.data().availableCopies || 1) - 1
    await updateDoc(bookRef, { availableCopies: Math.max(0, avail) })
  }
  return ref.id
}

export async function returnBook(schoolId, transactionId, bookId) {
  const txRef = doc(db, 'schools', schoolId, 'library', 'transactions', 'items', transactionId)
  await updateDoc(txRef, { returnDate: new Date().toISOString().split('T')[0], status: 'returned' })
  // Increment available copies
  const bookRef = doc(db, 'schools', schoolId, 'library', 'books', 'items', bookId)
  const bookSnap = await getDoc(bookRef)
  if (bookSnap.exists()) {
    const avail = (bookSnap.data().availableCopies || 0) + 1
    await updateDoc(bookRef, { availableCopies: avail })
  }
}

export async function getLibraryTransactions(schoolId, maxResults = 100) {
  const q = query(collection(db, 'schools', schoolId, 'library', 'transactions', 'items'), orderBy('createdAt', 'desc'), limit(maxResults))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ═══════════════════════════════════════════════════════════════════════════
//   HEAD OFFICE AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch aggregated stats for all branch schools.
 * Returns per-branch counts of students, staff, teachers, sections, classes, parents.
 */
export async function getAggregatedStats(branchSchoolIds) {
  const results = await Promise.all(branchSchoolIds.map(async (schoolId) => {
    const [students, users, sections, classes] = await Promise.all([
      getAllStudents(schoolId).catch(() => []),
      getSchoolUsers(schoolId).catch(() => []),
      getSections(schoolId).catch(() => []),
      getClasses(schoolId).catch(() => []),
    ])
    return {
      schoolId,
      studentCount: students.length,
      staffCount: users.filter(u => ['super_admin', 'admin', 'teacher', 'line_manager'].includes(u.role)).length,
      teacherCount: users.filter(u => u.role === 'teacher').length,
      sectionCount: sections.length,
      classCount: classes.length,
      parentCount: users.filter(u => u.role === 'parent').length,
    }
  }))
  return results
}

/**
 * Fetch upcoming events across all branch schools.
 */
export async function getBranchEvents(branchSchoolIds, daysAhead = 30) {
  const today = new Date().toISOString().split('T')[0]
  const allEvents = []
  for (const schoolId of branchSchoolIds) {
    try {
      const events = await getSchoolEvents(schoolId, 20)
      events.forEach(e => { e.schoolId = schoolId })
      allEvents.push(...events)
    } catch { /* skip branch on error */ }
  }
  return allEvents
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 50)
}

/**
 * Fetch fees summary across all branch schools.
 */
export async function getBranchFeesSummary(branchSchoolIds) {
  const results = await Promise.all(branchSchoolIds.map(async (schoolId) => {
    try {
      const outstanding = await getOutstandingFees(schoolId)
      const totalDue = outstanding.reduce((sum, f) => sum + (f.amountDue || 0), 0)
      const totalPaid = outstanding.reduce((sum, f) => sum + (f.amountPaid || 0), 0)
      return { schoolId, outstandingCount: outstanding.length, totalDue, totalPaid }
    } catch {
      return { schoolId, outstandingCount: 0, totalDue: 0, totalPaid: 0 }
    }
  }))
  return results
}
