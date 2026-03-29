/**
 * SchoolPortal — Auth Module
 *
 * Thin wrappers around Firebase Auth. No UI logic here —
 * each page JS handles its own error/success display.
 */
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { auth } from './config.js'

/** Sign in with email + password. Returns UserCredential. */
export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

/** Create a new account. Returns UserCredential. */
export function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password)
}

/** Update the display name on the Auth profile. */
export function setDisplayName(user, name) {
  return updateProfile(user, { displayName: name })
}

/** Sign out the current user. */
export function logout() {
  return signOut(auth)
}

/** Send a password-reset email. */
export function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email)
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}

/** Synchronous check for the current user (may be null on cold start). */
export function getCurrentUser() {
  return auth.currentUser
}

/**
 * Returns a promise that resolves with the current user once
 * Firebase has finished checking the persisted auth token.
 * Use this instead of getCurrentUser() when you need a reliable check.
 */
export function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}
