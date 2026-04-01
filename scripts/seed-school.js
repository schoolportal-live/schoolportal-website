/**
 * SchoolOS — School Document Seed Script
 *
 * Creates the schools/greenfield-academy document in Firestore.
 * This migrates the existing demo school from a hardcoded schoolId
 * to a proper school org unit document.
 *
 * Also creates the platform/config document.
 *
 * Usage: node scripts/seed-school.js
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
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
  console.log('\n🏫 SchoolOS — Seeding school document\n')
  console.log('─'.repeat(50))

  // Sign in as admin to have write permissions
  console.log('Signing in as admin...')
  try {
    await signInWithEmailAndPassword(auth, 'admin@schoolportal.live', 'Admin123!')
    console.log('  ✓ Signed in')
  } catch (err) {
    console.error('  ✗ Failed to sign in:', err.message)
    console.log('\nMake sure admin@schoolportal.live exists (run seed-users.js first)')
    process.exit(1)
  }

  // Create platform config
  console.log('\nCreating platform/config...')
  const platformRef = doc(db, 'platform', 'config')
  const platformSnap = await getDoc(platformRef)
  if (platformSnap.exists()) {
    console.log('  ⚠ platform/config already exists — updating')
  }
  await setDoc(platformRef, {
    platformName: 'SchoolOS',
    superAdminEmail: 'admin@schoolportal.live',
    packages: {
      basic: {
        name: 'Basic',
        modules: ['communication', 'fees'],
      },
      standard: {
        name: 'Standard',
        modules: ['communication', 'fees', 'attendance', 'results', 'homework'],
      },
      premium: {
        name: 'Premium',
        modules: [
          'communication', 'requests', 'attendance', 'fees', 'results',
          'homework', 'requisition', 'transport', 'timetable', 'documents',
          'library', 'events', 'notifications',
        ],
      },
      custom: {
        name: 'Custom',
        modules: [],
      },
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true })
  console.log('  ✓ Platform config created')

  // Create school document
  console.log('\nCreating schools/greenfield-academy...')
  const schoolRef = doc(db, 'schools', 'greenfield-academy')
  const schoolSnap = await getDoc(schoolRef)
  if (schoolSnap.exists()) {
    console.log('  ⚠ School already exists — updating')
  }
  await setDoc(schoolRef, {
    name: 'Greenfield Academy',
    slug: 'greenfield-academy',
    headOfficeId: null,
    branches: [],
    package: 'premium',
    activeModules: [
      'communication', 'requests', 'attendance', 'fees', 'results',
      'homework', 'requisition', 'transport', 'timetable', 'documents',
      'library', 'events', 'notifications',
    ],
    branding: {
      logo: '',
      schoolName: 'Greenfield Academy',
      primaryColor: '#2563eb',
      secondaryColor: '#16a34a',
      accentColor: '#f59e0b',
    },
    contactEmail: 'admin@schoolportal.live',
    address: '',
    phone: '',
    academicYear: '2026-2027',
    status: 'active',
    createdBy: auth.currentUser.uid,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true })
  console.log('  ✓ School document created')

  // Sign out
  await signOut(auth)

  console.log('\n' + '─'.repeat(50))
  console.log('\n✅ School seeding complete!')
  console.log('\nCreated:')
  console.log('  • platform/config — package definitions')
  console.log('  • schools/greenfield-academy — demo school with premium package')
  console.log('\n')

  process.exit(0)
}

main()
