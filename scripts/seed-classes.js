/**
 * SchoolOS — Seed Classes & Sections for Greenfield Academy
 *
 * Creates sample class/section structure typical of a Pakistani school:
 *   Nursery, KG, Class 1-10 with sections A-D
 *
 * Usage: node scripts/seed-classes.js
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  getFirestore, doc, setDoc, addDoc, collection, getDocs, Timestamp,
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

const CLASS_STRUCTURE = [
  { name: 'Nursery',   sections: ['A', 'B'],           sortOrder: 0 },
  { name: 'KG',        sections: ['A', 'B'],           sortOrder: 1 },
  { name: 'Class 1',   sections: ['A', 'B', 'C'],      sortOrder: 2 },
  { name: 'Class 2',   sections: ['A', 'B', 'C'],      sortOrder: 3 },
  { name: 'Class 3',   sections: ['A', 'B', 'C'],      sortOrder: 4 },
  { name: 'Class 4',   sections: ['A', 'B', 'C', 'D'], sortOrder: 5 },
  { name: 'Class 5',   sections: ['A', 'B', 'C', 'D'], sortOrder: 6 },
  { name: 'Class 6',   sections: ['A', 'B', 'C'],      sortOrder: 7 },
  { name: 'Class 7',   sections: ['A', 'B', 'C'],      sortOrder: 8 },
  { name: 'Class 8',   sections: ['A', 'B'],           sortOrder: 9 },
  { name: 'Class 9',   sections: ['A', 'B'],           sortOrder: 10 },
  { name: 'Class 10',  sections: ['A', 'B'],           sortOrder: 11 },
]

async function main() {
  console.log('\n📚 SchoolOS — Seeding Classes & Sections\n')
  console.log('─'.repeat(50))

  // Sign in
  console.log('Signing in as admin...')
  try {
    await signInWithEmailAndPassword(auth, 'admin@schoolportal.live', 'Admin123!')
    console.log('  ✓ Signed in')
  } catch (err) {
    console.error('  ✗ Failed to sign in:', err.message)
    process.exit(1)
  }

  let totalClasses = 0
  let totalSections = 0

  for (const cls of CLASS_STRUCTURE) {
    console.log(`\nCreating ${cls.name} with sections [${cls.sections.join(', ')}]...`)

    // Create class document
    const classRef = await addDoc(collection(db, 'schools', SCHOOL_ID, 'classes'), {
      name: cls.name,
      sortOrder: cls.sortOrder,
      sections: cls.sections,
      createdAt: Timestamp.now(),
    })
    totalClasses++
    console.log(`  ✓ Class: ${cls.name} → ${classRef.id}`)

    // Create section documents
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
      totalSections++
      console.log(`    ✓ Section: ${cls.name} - ${letter} → ${sectionId}`)
    }
  }

  await signOut(auth)

  console.log('\n' + '─'.repeat(50))
  console.log(`\n✅ Seeding complete!`)
  console.log(`  • ${totalClasses} classes created`)
  console.log(`  • ${totalSections} sections created`)
  console.log(`  • School: ${SCHOOL_ID}\n`)

  process.exit(0)
}

main()
