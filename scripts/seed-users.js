/**
 * SchoolPortal — Seed Script
 * Creates test users in Firebase Auth + Firestore user documents.
 *
 * Usage: node scripts/seed-users.js
 *
 * This uses the Firebase client SDK (not Admin SDK) because:
 * - Spark plan doesn't support Cloud Functions / Admin SDK server
 * - Client SDK can create users and write Firestore docs
 * - Firestore must be in test mode OR rules must allow creates
 *
 * NOTE: Run this ONCE to seed test data, then delete or disable.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth'
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyA20MPMaSjsJt8qB-FsEXXP07d2Vn9d7BM',
  authDomain: 'schoolportal-live.firebaseapp.com',
  projectId: 'schoolportal-live',
  storageBucket: 'schoolportal-live.firebasestorage.app',
  messagingSenderId: '558601017648',
  appId: '1:558601017648:web:c648604cca74e1df2150f5',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const TEST_USERS = [
  {
    email: 'admin@schoolportal.live',
    password: 'Admin123!',
    displayName: 'School Admin',
    role: 'school_admin',
    schoolId: 'greenfield-academy',
  },
  {
    email: 'parent@schoolportal.live',
    password: 'Parent123!',
    displayName: 'Test Parent',
    role: 'parent',
    schoolId: 'greenfield-academy',
  },
]

async function seedUser({ email, password, displayName, role, schoolId }) {
  try {
    console.log(`Creating user: ${email} (${role})...`)

    // 1. Create Auth user
    const { user } = await createUserWithEmailAndPassword(auth, email, password)

    // 2. Set display name
    await updateProfile(user, { displayName })

    // 3. Create Firestore user document
    await setDoc(doc(db, 'users', user.uid), {
      role,
      email,
      displayName,
      schoolId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })

    console.log(`  ✓ Created: ${email} → UID: ${user.uid} → role: ${role}`)

    // Sign out so we can create the next user
    await signOut(auth)

    return { success: true, uid: user.uid }
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log(`  ⚠ User ${email} already exists — skipping.`)
      await signOut(auth).catch(() => {})
      return { success: false, reason: 'exists' }
    }
    console.error(`  ✗ Failed to create ${email}:`, err.message)
    await signOut(auth).catch(() => {})
    return { success: false, reason: err.message }
  }
}

async function main() {
  console.log('\n🏫 SchoolPortal — Seeding test users\n')
  console.log('─'.repeat(50))

  for (const userData of TEST_USERS) {
    await seedUser(userData)
  }

  console.log('─'.repeat(50))
  console.log('\n✅ Seeding complete!\n')
  console.log('Test credentials:')
  console.log('  School Admin: admin@schoolportal.live / Admin123!')
  console.log('  Parent:       parent@schoolportal.live / Parent123!')
  console.log('\nTry logging in at: https://schoolportal.live/login\n')

  process.exit(0)
}

main()
