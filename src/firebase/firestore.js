/**
 * SchoolPortal — Firestore Helpers
 *
 * Collections:
 *   users/{uid}       → { role, email, displayName, schoolId, phone, childName, childGrade, createdAt, updatedAt }
 *   notices/{id}      → { title, body, authorId, authorName, schoolId, createdAt }
 *   submissions/{id}  → { formType, data, schoolId, createdAt }
 *   parentForms/{id}  → { formType, parentId, parentName, schoolId, data, status, createdAt }
 *   messages/{id}     → { senderId, senderName, senderRole, schoolId, subject, body, createdAt }
 *   events/{id}       → { title, description, date, time, location, schoolId, createdAt }
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
  // New SchoolOS roles
  platform_admin: '/platform/dashboard.html',
  super_admin: '/admin/dashboard.html',
  admin: '/admin/dashboard.html',
  line_manager: '/admin/dashboard.html',
  teacher: '/admin/dashboard.html',
  student: '/parent/portal.html',
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

// ── Parent Forms (absence reports, permission notes) ────────────────────

/**
 * Submit a parent form (absence, permission note, etc).
 */
export async function submitParentForm({ formType, parentId, parentName, schoolId, data }) {
  const ref = await addDoc(collection(db, 'parentForms'), {
    formType,
    parentId,
    parentName,
    schoolId,
    data,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Fetch parent forms by parent UID.
 */
export async function getParentForms(parentId, maxResults = 50) {
  const q = query(
    collection(db, 'parentForms'),
    where('parentId', '==', parentId),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Fetch all parent forms for a school (admin view).
 */
export async function getSchoolParentForms(schoolId, maxResults = 100) {
  const q = query(
    collection(db, 'parentForms'),
    where('schoolId', '==', schoolId),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Update a parent form status (admin: acknowledged/approved/denied).
 */
export async function updateParentFormStatus(formId, status) {
  await updateDoc(doc(db, 'parentForms', formId), {
    status,
    updatedAt: serverTimestamp(),
  })
}

// ── Messages ────────────────────────────────────────────────────────────

/**
 * Send a message (parent→school or school→parent).
 */
export async function sendMessage({ senderId, senderName, senderRole, recipientId, schoolId, subject, body }) {
  const ref = await addDoc(collection(db, 'messages'), {
    senderId,
    senderName,
    senderRole,
    recipientId: recipientId || 'school',
    schoolId,
    subject,
    body,
    read: false,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Fetch messages for a school (all messages in that school).
 */
export async function getSchoolMessages(schoolId, maxResults = 100) {
  const q = query(
    collection(db, 'messages'),
    where('schoolId', '==', schoolId),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Fetch messages sent by a specific user.
 */
export async function getUserMessages(userId, maxResults = 50) {
  const q = query(
    collection(db, 'messages'),
    where('senderId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Mark a message as read.
 */
export async function markMessageRead(messageId) {
  await updateDoc(doc(db, 'messages', messageId), { read: true })
}

// ── Events ──────────────────────────────────────────────────────────────

/**
 * Create a school event (admin only).
 */
export async function createEvent({ title, description, date, time, location, schoolId }) {
  const ref = await addDoc(collection(db, 'events'), {
    title,
    description,
    date,
    time,
    location,
    schoolId,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Fetch events for a school, sorted by event date.
 */
export async function getEvents(schoolId, maxResults = 50) {
  const q = query(
    collection(db, 'events'),
    where('schoolId', '==', schoolId),
    orderBy('date', 'asc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Delete an event.
 */
export async function deleteEvent(eventId) {
  await deleteDoc(doc(db, 'events', eventId))
}

// ── User Profile ────────────────────────────────────────────────────────

/**
 * Update user profile fields (cannot change role).
 */
export async function updateUserProfile(uid, fields) {
  await updateDoc(doc(db, 'users', uid), {
    ...fields,
    updatedAt: serverTimestamp(),
  })
}
