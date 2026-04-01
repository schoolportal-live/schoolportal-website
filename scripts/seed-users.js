/**
 * SchoolOS — Seed Demo Users for Greenfield Academy
 *
 * Creates a realistic user hierarchy for demos:
 *   - 1 Super Admin (already exists: admin@schoolportal.live)
 *   - 4 Admin sub-roles (receptionist, accountant, coordinator, req incharge)
 *   - 2 Line Managers
 *   - 6 Teachers (3 home teachers + 3 subject teachers)
 *   - 6 Parents (each with 1 child)
 *   - 6 Students
 *
 * Uses Firebase REST API for user creation (avoids signing out the admin).
 *
 * Usage: node scripts/seed-users.js
 * Requirements: Run seed-classes.js first (needs sections to exist).
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, Timestamp, updateDoc,
} from 'firebase/firestore'

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

const SCHOOL_ID = 'greenfield-academy'
const DEFAULT_PASSWORD = 'Demo1234!'
const API_KEY = firebaseConfig.apiKey

// ── User Definitions ──────────────────────────────────────────────────────

const ADMIN_USERS = [
  { email: 'reception@greenfield.demo', name: 'Fatima Noor', subRole: 'receptionist' },
  { email: 'accounts@greenfield.demo', name: 'Ahmed Khan', subRole: 'accountant' },
  { email: 'coordinator@greenfield.demo', name: 'Ayesha Malik', subRole: 'coordinator' },
  { email: 'stores@greenfield.demo', name: 'Usman Ali', subRole: 'requisition_incharge' },
]

const LINE_MANAGERS = [
  { email: 'lm.junior@greenfield.demo', name: 'Saima Iqbal', managedSections: ['nursery-a', 'nursery-b', 'kg-a', 'kg-b', 'class-1-a', 'class-1-b', 'class-1-c'] },
  { email: 'lm.senior@greenfield.demo', name: 'Tariq Hussain', managedSections: ['class-6-a', 'class-6-b', 'class-6-c', 'class-7-a', 'class-7-b', 'class-7-c', 'class-8-a', 'class-8-b'] },
]

const TEACHERS = [
  // Home teachers (assigned to a section)
  { email: 'teacher.sarah@greenfield.demo', name: 'Sarah Qureshi', homeSection: 'class-1-a', subjects: ['English', 'Urdu'], assignedSections: ['class-1-a', 'class-1-b'] },
  { email: 'teacher.bilal@greenfield.demo', name: 'Bilal Ahmed', homeSection: 'class-6-a', subjects: ['Math', 'Science'], assignedSections: ['class-6-a', 'class-6-b', 'class-6-c'] },
  { email: 'teacher.hina@greenfield.demo', name: 'Hina Pervez', homeSection: 'kg-a', subjects: ['General'], assignedSections: ['kg-a', 'kg-b'] },
  // Subject-only teachers (no home section)
  { email: 'teacher.ali@greenfield.demo', name: 'Ali Raza', homeSection: null, subjects: ['Islamiat', 'Social Studies'], assignedSections: ['class-1-a', 'class-1-b', 'class-1-c', 'class-6-a', 'class-6-b'] },
  { email: 'teacher.nadia@greenfield.demo', name: 'Nadia Shah', homeSection: null, subjects: ['Computer', 'Art'], assignedSections: ['class-6-a', 'class-6-b', 'class-6-c'] },
  { email: 'teacher.zain@greenfield.demo', name: 'Zain Ul Abideen', homeSection: null, subjects: ['Physical Education'], assignedSections: ['class-1-a', 'class-1-b', 'kg-a', 'kg-b'] },
]

// Parents + their children (linked to sections)
const FAMILIES = [
  { parent: { email: 'parent.amna@greenfield.demo', name: 'Amna Hassan' }, child: { name: 'Zara Hassan', section: 'class-1-a', rollNo: 1 } },
  { parent: { email: 'parent.imran@greenfield.demo', name: 'Imran Sheikh' }, child: { name: 'Ibrahim Sheikh', section: 'class-1-a', rollNo: 2 } },
  { parent: { email: 'parent.sana@greenfield.demo', name: 'Sana Fatima' }, child: { name: 'Hamza Tariq', section: 'class-1-b', rollNo: 1 } },
  { parent: { email: 'parent.rashid@greenfield.demo', name: 'Rashid Mehmood' }, child: { name: 'Aisha Rashid', section: 'class-6-a', rollNo: 1 } },
  { parent: { email: 'parent.maria@greenfield.demo', name: 'Maria Kamal' }, child: { name: 'Omar Kamal', section: 'class-6-a', rollNo: 2 } },
  { parent: { email: 'parent.nasir@greenfield.demo', name: 'Nasir Javed' }, child: { name: 'Fatima Javed', section: 'kg-a', rollNo: 1 } },
]

// ── Firebase REST API for user creation ────────────────────────────────────

async function createAuthUser(email, password, displayName) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      displayName,
      returnSecureToken: false,
    }),
  })
  const data = await res.json()
  if (data.error) {
    if (data.error.message === 'EMAIL_EXISTS') {
      console.log(`    ⚠ Auth user exists: ${email}`)
      return null // User already exists
    }
    throw new Error(`Auth error: ${data.error.message}`)
  }
  return data.localId // Firebase UID
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n👥 SchoolOS — Seeding Demo Users for Greenfield Academy\n')
  console.log('─'.repeat(60))

  // Sign in as admin to verify access + get admin UID for reportsTo
  console.log('Signing in as Super Admin...')
  const cred = await signInWithEmailAndPassword(auth, 'admin@schoolportal.live', 'Admin123!')
  const adminUid = cred.user.uid
  console.log(`  ✓ Signed in (UID: ${adminUid})`)

  // Update existing admin to super_admin role (migrating from school_admin)
  const adminDocRef = doc(db, 'users', adminUid)
  const adminSnap = await getDoc(adminDocRef)
  if (adminSnap.exists() && adminSnap.data().role === 'school_admin') {
    await updateDoc(adminDocRef, { role: 'super_admin', updatedAt: Timestamp.now() })
    console.log('  ✓ Upgraded admin role: school_admin → super_admin')
  }

  // Verify sections exist
  const sectionsSnap = await getDocs(collection(db, 'schools', SCHOOL_ID, 'sections'))
  if (sectionsSnap.empty) {
    console.error('\n  ✗ No sections found! Run seed-classes.js first.\n')
    process.exit(1)
  }
  console.log(`  ✓ Found ${sectionsSnap.size} sections`)

  const stats = { admins: 0, lineManagers: 0, teachers: 0, parents: 0, students: 0, skipped: 0 }

  // ── 1. Admin Sub-Roles ─────────────────────────────────────────────
  console.log('\n📋 Creating Admin Users...')
  for (const admin of ADMIN_USERS) {
    console.log(`  Creating ${admin.name} (${admin.subRole})...`)
    const uid = await createAuthUser(admin.email, DEFAULT_PASSWORD, admin.name)
    if (!uid) { stats.skipped++; continue }

    await setDoc(doc(db, 'users', uid), {
      displayName: admin.name,
      email: admin.email,
      role: 'admin',
      adminSubRole: admin.subRole,
      schoolId: SCHOOL_ID,
      reportsTo: adminUid,
      createdAt: Timestamp.now(),
    })
    console.log(`    ✓ ${admin.name} → ${admin.subRole} (${uid})`)
    stats.admins++
  }

  // ── 2. Line Managers ───────────────────────────────────────────────
  console.log('\n📋 Creating Line Managers...')
  const lmUids = {}
  for (const lm of LINE_MANAGERS) {
    console.log(`  Creating ${lm.name}...`)
    const uid = await createAuthUser(lm.email, DEFAULT_PASSWORD, lm.name)
    if (!uid) { stats.skipped++; continue }
    lmUids[lm.email] = uid

    await setDoc(doc(db, 'users', uid), {
      displayName: lm.name,
      email: lm.email,
      role: 'line_manager',
      schoolId: SCHOOL_ID,
      reportsTo: adminUid,
      managedSections: lm.managedSections,
      createdAt: Timestamp.now(),
    })

    // Update section docs with lineManagerId
    for (const secId of lm.managedSections) {
      try {
        await updateDoc(doc(db, 'schools', SCHOOL_ID, 'sections', secId), {
          lineManagerId: uid,
          updatedAt: Timestamp.now(),
        })
      } catch { /* section may not exist */ }
    }

    console.log(`    ✓ ${lm.name} → ${lm.managedSections.length} sections (${uid})`)
    stats.lineManagers++
  }

  // ── 3. Teachers ────────────────────────────────────────────────────
  console.log('\n📋 Creating Teachers...')
  const teacherUids = {}
  for (const t of TEACHERS) {
    console.log(`  Creating ${t.name}...`)
    const uid = await createAuthUser(t.email, DEFAULT_PASSWORD, t.name)
    if (!uid) { stats.skipped++; continue }
    teacherUids[t.email] = uid

    // Determine reportsTo: use the line manager managing their home section or first assigned section
    const primarySection = t.homeSection || t.assignedSections[0]
    const lm = LINE_MANAGERS.find(l => l.managedSections.includes(primarySection))
    const reportsTo = lm ? lmUids[lm.email] : adminUid

    await setDoc(doc(db, 'users', uid), {
      displayName: t.name,
      email: t.email,
      role: 'teacher',
      schoolId: SCHOOL_ID,
      homeSection: t.homeSection,
      subjects: t.subjects,
      assignedSections: t.assignedSections,
      reportsTo: reportsTo || adminUid,
      createdAt: Timestamp.now(),
    })

    // Update section docs with homeTeacherId
    if (t.homeSection) {
      try {
        await updateDoc(doc(db, 'schools', SCHOOL_ID, 'sections', t.homeSection), {
          homeTeacherId: uid,
          updatedAt: Timestamp.now(),
        })
      } catch { /* section may not exist */ }
    }

    // Update subject teacher mappings
    for (const secId of t.assignedSections) {
      try {
        const secRef = doc(db, 'schools', SCHOOL_ID, 'sections', secId)
        const secSnap = await getDoc(secRef)
        if (secSnap.exists()) {
          const existing = secSnap.data().subjectTeachers || {}
          for (const subj of t.subjects) {
            existing[subj] = uid
          }
          await updateDoc(secRef, { subjectTeachers: existing, updatedAt: Timestamp.now() })
        }
      } catch { /* skip */ }
    }

    console.log(`    ✓ ${t.name} → ${t.homeSection ? 'Home: ' + t.homeSection : 'Subject only'} (${uid})`)
    stats.teachers++
  }

  // ── 4. Parents + Students ──────────────────────────────────────────
  console.log('\n📋 Creating Parents & Students...')
  for (const family of FAMILIES) {
    const { parent, child } = family
    console.log(`  Creating ${parent.name} + child ${child.name}...`)

    // Create parent auth + doc
    const parentUid = await createAuthUser(parent.email, DEFAULT_PASSWORD, parent.name)
    if (!parentUid) { stats.skipped++; continue }

    // Create student auth + doc
    const studentEmail = `student.${child.name.toLowerCase().replace(/\s+/g, '.')}@greenfield.demo`
    const studentUid = await createAuthUser(studentEmail, DEFAULT_PASSWORD, child.name)

    // Parent user doc
    await setDoc(doc(db, 'users', parentUid), {
      displayName: parent.name,
      email: parent.email,
      role: 'parent',
      schoolId: SCHOOL_ID,
      children: [{
        name: child.name,
        sectionId: child.section,
        studentId: studentUid || null,
      }],
      createdAt: Timestamp.now(),
    })
    stats.parents++
    console.log(`    ✓ Parent: ${parent.name} (${parentUid})`)

    // Student user doc (if auth user was created)
    if (studentUid) {
      await setDoc(doc(db, 'users', studentUid), {
        displayName: child.name,
        email: studentEmail,
        role: 'student',
        schoolId: SCHOOL_ID,
        sectionId: child.section,
        parentIds: [parentUid],
        createdAt: Timestamp.now(),
      })

      // Also create student in the school subcollection
      await setDoc(doc(db, 'schools', SCHOOL_ID, 'students', studentUid), {
        name: child.name,
        displayName: child.name,
        rollNumber: String(child.rollNo),
        sectionId: child.section,
        parentIds: [parentUid],
        parentName: parent.name,
        status: 'active',
        documents: {},
        createdAt: Timestamp.now(),
      })

      stats.students++
      console.log(`    ✓ Student: ${child.name} in ${child.section} (${studentUid})`)
    }
  }

  await signOut(auth)

  // ── Summary ────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60))
  console.log('\n✅ User seeding complete!')
  console.log(`  • ${stats.admins} admin users`)
  console.log(`  • ${stats.lineManagers} line managers`)
  console.log(`  • ${stats.teachers} teachers`)
  console.log(`  • ${stats.parents} parents`)
  console.log(`  • ${stats.students} students`)
  if (stats.skipped > 0) console.log(`  • ${stats.skipped} skipped (already exist)`)
  console.log(`\n  Default password: ${DEFAULT_PASSWORD}`)
  console.log(`  School: ${SCHOOL_ID}\n`)

  console.log('Demo Login Accounts:')
  console.log('─'.repeat(60))
  console.log('  Super Admin:      admin@schoolportal.live       / Admin123!')
  console.log('  Receptionist:     reception@greenfield.demo     / Demo1234!')
  console.log('  Accountant:       accounts@greenfield.demo      / Demo1234!')
  console.log('  Coordinator:      coordinator@greenfield.demo   / Demo1234!')
  console.log('  Store Incharge:   stores@greenfield.demo        / Demo1234!')
  console.log('  Line Mgr (Jr):    lm.junior@greenfield.demo     / Demo1234!')
  console.log('  Line Mgr (Sr):    lm.senior@greenfield.demo     / Demo1234!')
  console.log('  Teacher (Home):   teacher.sarah@greenfield.demo / Demo1234!')
  console.log('  Teacher (Subj):   teacher.ali@greenfield.demo   / Demo1234!')
  console.log('  Parent:           parent.amna@greenfield.demo   / Demo1234!')
  console.log('  Student:          student.zara.hassan@greenfield.demo / Demo1234!')
  console.log('')

  process.exit(0)
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message)
  process.exit(1)
})
