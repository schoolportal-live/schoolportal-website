/**
 * SchoolOS — Platform Admin Seed Script
 *
 * Creates Shumyle's platform_admin account.
 * This is the super-super-admin who onboards schools.
 *
 * Usage: node scripts/seed-platform-admin.js
 */
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore'

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

async function main() {
  console.log('\n🔑 SchoolOS — Creating Platform Admin\n')
  console.log('─'.repeat(50))

  const email = 'shumyle@schoolportal.live'
  const password = 'Shumyle2026!'
  const displayName = 'Shumyle'

  try {
    console.log(`Creating platform admin: ${email}...`)
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(user, { displayName })

    await setDoc(doc(db, 'users', user.uid), {
      role: 'platform_admin',
      email,
      displayName,
      schoolId: '',  // Platform admin isn't tied to a school
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })

    console.log(`  ✓ Created: ${email} → UID: ${user.uid} → role: platform_admin`)
    await signOut(auth)
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log(`  ⚠ ${email} already exists — updating role to platform_admin...`)

      // Sign in and update the existing user's role
      const { signInWithEmailAndPassword } = await import('firebase/auth')
      try {
        const { user } = await signInWithEmailAndPassword(auth, email, password)
        await setDoc(doc(db, 'users', user.uid), {
          role: 'platform_admin',
          email,
          displayName,
          schoolId: '',
          updatedAt: Timestamp.now(),
        }, { merge: true })
        console.log(`  ✓ Updated role to platform_admin`)
        await signOut(auth)
      } catch (signInErr) {
        console.error(`  ✗ Could not sign in to update role:`, signInErr.message)
        await signOut(auth).catch(() => {})
      }
    } else {
      console.error(`  ✗ Failed:`, err.message)
      await signOut(auth).catch(() => {})
    }
  }

  console.log('\n' + '─'.repeat(50))
  console.log('\n✅ Platform admin ready!\n')
  console.log('Credentials:')
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
  console.log(`  Role:     platform_admin`)
  console.log(`\nLogin at: https://schoolportal.live/login`)
  console.log(`Dashboard: https://schoolportal.live/platform/dashboard.html\n`)

  process.exit(0)
}

main()
