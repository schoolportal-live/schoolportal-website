/**
 * SchoolOS — Seed Second Demo School: Riverside International School
 *
 * Proves multi-tenancy by creating a complete second school with:
 *   - School document (premium package, full modules)
 *   - 2 classes, 3 sections
 *   - 1 super_admin, 2 teachers, 1 line_manager, 2 parents, 2 students
 *   - Homework assignments for section 9-A
 *   - A transport route
 *
 * Uses the same Firebase client SDK + REST API pattern as the other seed scripts.
 *
 * Usage: node scripts/seed-second-school.js
 * Requirements: Platform admin (admin@schoolportal.live) must exist.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  getFirestore, doc, setDoc, addDoc, collection, Timestamp,
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

const SCHOOL_ID = 'riverside-international'
const DEFAULT_PASSWORD = 'Demo1234!'
const API_KEY = firebaseConfig.apiKey

const ALL_MODULES = [
  'communication', 'requests', 'attendance', 'fees', 'results',
  'homework', 'requisition', 'transport', 'timetable', 'documents',
  'library', 'events', 'notifications',
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function ts(daysAgo = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return Timestamp.fromDate(d)
}

function futureDate(daysAhead) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().split('T')[0]
}

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
      return null
    }
    throw new Error(`Auth error for ${email}: ${data.error.message}`)
  }
  return data.localId
}

const schoolCol = (sub) => collection(db, 'schools', SCHOOL_ID, sub)

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🏫 SchoolOS — Seeding Second School: Riverside International\n')
  console.log('─'.repeat(60))

  // Sign in as platform admin
  console.log('Signing in as Platform Admin...')
  const cred = await signInWithEmailAndPassword(auth, 'shumyle@schoolportal.live', 'Shumyle2026!')
  const platformAdminUid = cred.user.uid
  console.log(`  ✓ Signed in (UID: ${platformAdminUid})`)

  const stats = { classes: 0, sections: 0, users: 0, homework: 0, routes: 0 }

  // ── 1. School Document ──────────────────────────────────────────────
  console.log('\n📋 Creating school document...')
  await setDoc(doc(db, 'schools', SCHOOL_ID), {
    name: 'Riverside International School',
    slug: 'riverside-international',
    headOfficeId: null,
    branches: [],
    package: 'premium',
    activeModules: ALL_MODULES,
    branding: {
      logo: '',
      schoolName: 'Riverside International School',
      primaryColor: '#7c3aed',
      secondaryColor: '#0891b2',
      accentColor: '#f97316',
    },
    contactEmail: 'info@riverside.demo',
    address: '',
    phone: '',
    academicYear: '2025-2026',
    status: 'active',
    createdBy: platformAdminUid,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true })
  console.log('  ✓ schools/riverside-international created')

  // ── 2. Classes & Sections ───────────────────────────────────────────
  console.log('\n📚 Creating Classes & Sections...')

  const CLASS_STRUCTURE = [
    { name: 'Grade 9',  sections: ['A', 'B'], sortOrder: 0 },
    { name: 'Grade 10', sections: ['A'],      sortOrder: 1 },
  ]

  const classIds = {}
  for (const cls of CLASS_STRUCTURE) {
    const classRef = await addDoc(schoolCol('classes'), {
      name: cls.name,
      sortOrder: cls.sortOrder,
      sections: cls.sections,
      createdAt: Timestamp.now(),
    })
    classIds[cls.name] = classRef.id
    stats.classes++
    console.log(`  ✓ Class: ${cls.name} → ${classRef.id}`)

    for (const letter of cls.sections) {
      const sectionId = `${cls.name.toLowerCase().replace(/\s+/g, '-')}-${letter.toLowerCase()}`
      await setDoc(doc(db, 'schools', SCHOOL_ID, 'sections', sectionId), {
        classId: classRef.id,
        sectionLetter: letter,
        displayName: `${cls.name} - ${letter}`,
        homeTeacherId: null,
        lineManagerId: null,
        subjectTeachers: {},
        studentCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
      stats.sections++
      console.log(`    ✓ Section: ${cls.name} - ${letter} → ${sectionId}`)
    }
  }

  // ── 3. Super Admin ──────────────────────────────────────────────────
  console.log('\n👤 Creating Super Admin...')
  const adminEmail = 'admin@riverside.demo'
  const adminUid = await createAuthUser(adminEmail, DEFAULT_PASSWORD, 'Riverside Admin')
  if (adminUid) {
    await setDoc(doc(db, 'users', adminUid), {
      displayName: 'Riverside Admin',
      email: adminEmail,
      role: 'super_admin',
      schoolId: SCHOOL_ID,
      createdAt: Timestamp.now(),
    })
    console.log(`  ✓ ${adminEmail} → super_admin (${adminUid})`)
    stats.users++
  }
  const schoolAdminUid = adminUid || platformAdminUid

  // ── 4. Line Manager ─────────────────────────────────────────────────
  console.log('\n👤 Creating Line Manager...')
  const lmEmail = 'lm.senior@riverside.demo'
  const lmUid = await createAuthUser(lmEmail, DEFAULT_PASSWORD, 'Hassan Raza')
  if (lmUid) {
    const managedSections = ['grade-9-a', 'grade-9-b', 'grade-10-a']
    await setDoc(doc(db, 'users', lmUid), {
      displayName: 'Hassan Raza',
      email: lmEmail,
      role: 'line_manager',
      schoolId: SCHOOL_ID,
      reportsTo: schoolAdminUid,
      managedSections,
      createdAt: Timestamp.now(),
    })

    for (const secId of managedSections) {
      try {
        await setDoc(doc(db, 'schools', SCHOOL_ID, 'sections', secId), {
          lineManagerId: lmUid,
          updatedAt: Timestamp.now(),
        }, { merge: true })
      } catch { /* section may not exist yet */ }
    }

    console.log(`  ✓ ${lmEmail} → line_manager (${lmUid})`)
    stats.users++
  }
  const effectiveLmUid = lmUid || schoolAdminUid

  // ── 5. Teachers ─────────────────────────────────────────────────────
  console.log('\n👥 Creating Teachers...')
  const TEACHERS = [
    {
      email: 'teacher.ali@riverside.demo',
      name: 'Ali Shahzad',
      homeSection: 'grade-9-a',
      subjects: ['Physics', 'Mathematics'],
      assignedSections: ['grade-9-a', 'grade-9-b'],
    },
    {
      email: 'teacher.maria@riverside.demo',
      name: 'Maria Tariq',
      homeSection: 'grade-10-a',
      subjects: ['English', 'Biology'],
      assignedSections: ['grade-10-a', 'grade-9-a'],
    },
  ]

  const teacherUids = {}
  for (const t of TEACHERS) {
    const uid = await createAuthUser(t.email, DEFAULT_PASSWORD, t.name)
    if (!uid) continue
    teacherUids[t.email] = uid

    await setDoc(doc(db, 'users', uid), {
      displayName: t.name,
      email: t.email,
      role: 'teacher',
      schoolId: SCHOOL_ID,
      homeSection: t.homeSection,
      subjects: t.subjects,
      assignedSections: t.assignedSections,
      reportsTo: effectiveLmUid,
      createdAt: Timestamp.now(),
    })

    if (t.homeSection) {
      await setDoc(doc(db, 'schools', SCHOOL_ID, 'sections', t.homeSection), {
        homeTeacherId: uid,
        updatedAt: Timestamp.now(),
      }, { merge: true })
    }

    for (const secId of t.assignedSections) {
      try {
        const secRef = doc(db, 'schools', SCHOOL_ID, 'sections', secId)
        // Merge subject teacher mappings
        const subjectTeachers = {}
        for (const subj of t.subjects) {
          subjectTeachers[`subjectTeachers.${subj}`] = uid
        }
        await setDoc(secRef, { ...subjectTeachers, updatedAt: Timestamp.now() }, { merge: true })
      } catch { /* skip */ }
    }

    console.log(`  ✓ ${t.email} → teacher (${uid})`)
    stats.users++
  }

  // ── 6. Parents & Students ──────────────────────────────────────────
  console.log('\n👨‍👩‍👧‍👦 Creating Parents & Students...')
  const FAMILIES = [
    {
      parent: { email: 'parent.khan@riverside.demo', name: 'Khalid Khan' },
      child: { name: 'Omar Khan', section: 'grade-9-a', rollNo: 1, studentEmail: 'student.omar@riverside.demo' },
    },
    {
      parent: { email: 'parent.ahmed@riverside.demo', name: 'Nusrat Ahmed' },
      child: { name: 'Fatima Ahmed', section: 'grade-9-a', rollNo: 2, studentEmail: 'student.fatima@riverside.demo' },
    },
  ]

  const studentUids = {}
  for (const family of FAMILIES) {
    const { parent, child } = family

    const parentUid = await createAuthUser(parent.email, DEFAULT_PASSWORD, parent.name)
    if (!parentUid) continue

    const studentUid = await createAuthUser(child.studentEmail, DEFAULT_PASSWORD, child.name)
    studentUids[child.studentEmail] = studentUid

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
    stats.users++
    console.log(`  ✓ Parent: ${parent.email} (${parentUid})`)

    // Student user doc + school subcollection doc
    if (studentUid) {
      await setDoc(doc(db, 'users', studentUid), {
        displayName: child.name,
        email: child.studentEmail,
        role: 'student',
        schoolId: SCHOOL_ID,
        sectionId: child.section,
        parentIds: [parentUid],
        createdAt: Timestamp.now(),
      })

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

      stats.users++
      console.log(`  ✓ Student: ${child.studentEmail} in ${child.section} (${studentUid})`)
    }
  }

  // ── 7. Homework Assignments (section 9-A) ─────────────────────────
  console.log('\n📝 Creating Homework for Grade 9-A...')
  const aliUid = teacherUids['teacher.ali@riverside.demo'] || null
  const mariaUid = teacherUids['teacher.maria@riverside.demo'] || null

  const homeworkItems = [
    { subject: 'Physics', title: 'Newton\'s Laws — Practice Problems Ch.4', teacherId: aliUid, teacherName: 'Ali Shahzad', daysAgo: 1, dueDays: 4 },
    { subject: 'Mathematics', title: 'Quadratic Equations Worksheet', teacherId: aliUid, teacherName: 'Ali Shahzad', daysAgo: 2, dueDays: 3 },
    { subject: 'English', title: 'Essay: Impact of Technology on Education', teacherId: mariaUid, teacherName: 'Maria Tariq', daysAgo: 0, dueDays: 5 },
    { subject: 'Biology', title: 'Label the Human Digestive System diagram', teacherId: mariaUid, teacherName: 'Maria Tariq', daysAgo: 3, dueDays: 2 },
  ]

  for (const hw of homeworkItems) {
    await addDoc(schoolCol('homework'), {
      subject: hw.subject,
      title: hw.title,
      description: '',
      sectionId: 'grade-9-a',
      teacherId: hw.teacherId,
      teacherName: hw.teacherName,
      deadline: futureDate(hw.dueDays),
      status: 'assigned',
      completions: {},
      verifications: {},
      createdAt: ts(hw.daysAgo),
    })
    stats.homework++
  }
  console.log(`  ✓ ${homeworkItems.length} homework assignments`)

  // ── 8. Transport Route ────────────────────────────────────────────
  console.log('\n🚌 Creating Transport Route...')
  await addDoc(schoolCol('transport'), {
    name: 'Route 1 — Riverside Heights → School',
    driverName: 'Tariq Mehmood',
    driverPhone: '0310-5551234',
    vehicleNo: 'ISB-4421',
    stops: ['Riverside Heights', 'Blue Area', 'F-8 Markaz', 'School Campus'],
    capacity: 35,
    currentStudents: 18,
    morningTime: '07:15',
    afternoonTime: '14:30',
    status: 'active',
    isActive: true,
    createdAt: ts(10),
  })
  stats.routes++
  console.log('  ✓ 1 transport route')

  // ── Done ──────────────────────────────────────────────────────────
  await signOut(auth)

  console.log('\n' + '─'.repeat(60))
  console.log('\n✅ Riverside International School seeding complete!')
  console.log(`  • 1 school document (premium)`)
  console.log(`  • ${stats.classes} classes`)
  console.log(`  • ${stats.sections} sections`)
  console.log(`  • ${stats.users} users`)
  console.log(`  • ${stats.homework} homework assignments`)
  console.log(`  • ${stats.routes} transport route`)
  console.log(`\n  School ID: ${SCHOOL_ID}`)
  console.log(`  Academic Year: 2025-2026`)
  console.log(`  Package: premium (all modules)`)
  console.log(`  Default password: ${DEFAULT_PASSWORD}`)

  console.log('\nDemo Login Accounts:')
  console.log('─'.repeat(60))
  console.log('  Super Admin:    admin@riverside.demo            / Demo1234!')
  console.log('  Line Manager:   lm.senior@riverside.demo        / Demo1234!')
  console.log('  Teacher:        teacher.ali@riverside.demo       / Demo1234!')
  console.log('  Teacher:        teacher.maria@riverside.demo     / Demo1234!')
  console.log('  Parent:         parent.khan@riverside.demo       / Demo1234!')
  console.log('  Parent:         parent.ahmed@riverside.demo      / Demo1234!')
  console.log('  Student:        student.omar@riverside.demo      / Demo1234!')
  console.log('  Student:        student.fatima@riverside.demo    / Demo1234!')
  console.log('')

  process.exit(0)
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message)
  process.exit(1)
})
