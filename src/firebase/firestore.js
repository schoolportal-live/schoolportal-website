/**
 * SchoolPortal — Firestore Helpers
 *
 * Collections:
 *   users/{uid}       → { role, email, displayName, schoolId, createdAt, updatedAt }
 *   notices/{id}      → { title, body, authorId, authorName, schoolId, createdAt }
 *   submissions/{id}  → { formType, data, schoolId, createdAt }
 */
import {
  doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  collection, query, where, orderBy, limit, getDocs,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
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

// ── Notices ─────────────────────────────────────────────────────────────

/**
 * Create a notice/announcement.
 * Only school_admin should call this (enforced by Firestore rules).
 */
export async function createNotice({ title, body, priority = 'normal', authorId, authorName, schoolId }) {
  const ref = await addDoc(collection(db, 'notices'), {
    title,
    body,
    priority,
    authorId,
    authorName,
    schoolId,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Fetch notices for a school, newest first.
 */
export async function getNotices(schoolId, maxResults = 50) {
  const q = query(
    collection(db, 'notices'),
    where('schoolId', '==', schoolId),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Delete a notice by ID.
 */
export async function deleteNotice(noticeId) {
  await deleteDoc(doc(db, 'notices', noticeId))
}

// ── Users (admin queries) ───────────────────────────────────────────────

/**
 * Fetch all parents for a school.
 */
export async function getParentsBySchool(schoolId) {
  const q = query(
    collection(db, 'users'),
    where('schoolId', '==', schoolId),
    where('role', '==', 'parent'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Fetch all users for a school (admin view).
 */
export async function getUsersBySchool(schoolId) {
  const q = query(
    collection(db, 'users'),
    where('schoolId', '==', schoolId),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Get counts for dashboard stats.
 */
export async function getSchoolStats(schoolId) {
  const [parents, notices] = await Promise.all([
    getParentsBySchool(schoolId),
    getNotices(schoolId, 999),
  ])
  return {
    parentCount: parents.length,
    noticeCount: notices.length,
    recentNotices: notices.slice(0, 5),
  }
}

// ── Submissions (for Netlify form data synced to Firestore) ─────────────

/**
 * Save a form submission to Firestore.
 */
export async function saveSubmission({ formType, data, schoolId = 'global' }) {
  const ref = await addDoc(collection(db, 'submissions'), {
    formType,
    data,
    schoolId,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Fetch submissions by form type.
 */
export async function getSubmissions(formType, maxResults = 100) {
  const q = query(
    collection(db, 'submissions'),
    where('formType', '==', formType),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
