/**
 * SchoolPortal — Firestore Helpers
 *
 * User document operations for role-based access control.
 * Users collection schema:
 *   users/{uid} → { role, email, displayName, schoolId, createdAt, updatedAt }
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './config.js'

/** Valid user roles */
export const ROLES = {
  SCHOOL_ADMIN: 'school_admin',
  PARENT: 'parent',
}

/** Route each role redirects to after login */
export const ROLE_ROUTES = {
  [ROLES.SCHOOL_ADMIN]: '/admin/dashboard.html',
  [ROLES.PARENT]: '/parent/portal.html',
}

/**
 * Fetch the role string for a given UID.
 * Returns 'school_admin' | 'parent' | null (if doc not found)
 */
export async function getUserRole(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return snap.data().role || null
}

/**
 * Fetch the full user document.
 * Returns the document data or null.
 */
export async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * Create a user document after registration.
 * Called immediately after createUserWithEmailAndPassword.
 */
export async function createUserDoc(uid, { role, email, displayName, schoolId = '' }) {
  await setDoc(doc(db, 'users', uid), {
    role,
    email,
    displayName,
    schoolId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
