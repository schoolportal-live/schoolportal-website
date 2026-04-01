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
