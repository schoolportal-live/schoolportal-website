/**
 * SchoolOS — Seed Sample Activity Data for Greenfield Academy
 *
 * Creates realistic sample data across all modules for demo purposes:
 *   - Homework assignments
 *   - Attendance records
 *   - Fee records
 *   - Exam results
 *   - Notices
 *   - Transport routes
 *   - Catalogue items for requisitions
 *
 * Usage: node scripts/seed-sample-data.js
 * Requirements: Run seed-classes.js + seed-users.js first.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  getFirestore, doc, setDoc, addDoc, collection, getDocs, query, where,
  Timestamp,
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

function ts(daysAgo = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return Timestamp.fromDate(d)
}

function dateStr(daysAgo = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split('T')[0]
}

function futureDate(daysAhead) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().split('T')[0]
}

async function main() {
  console.log('\n📊 SchoolOS — Seeding Sample Data\n')
  console.log('─'.repeat(60))

  console.log('Signing in...')
  await signInWithEmailAndPassword(auth, 'admin@schoolportal.live', 'Admin123!')
  console.log('  ✓ Signed in')

  // Load users to get UIDs
  const usersSnap = await getDocs(collection(db, 'users'))
  const users = {}
  usersSnap.forEach(d => { users[d.data().email] = { id: d.id, ...d.data() } })

  const getUid = (email) => users[email]?.id || null
  const studentsSnap = await getDocs(collection(db, 'schools', SCHOOL_ID, 'students'))
  const students = []
  studentsSnap.forEach(d => students.push({ id: d.id, ...d.data() }))

  const schoolCol = (sub) => collection(db, 'schools', SCHOOL_ID, sub)

  // ── 1. Notices ─────────────────────────────────────────────────────
  console.log('\n📢 Creating Notices...')
  const notices = [
    { title: 'Welcome Back — New Academic Year 2026', body: 'We are excited to welcome everyone back for the new academic year. Classes begin on April 7th.', type: 'general', priority: 'high' },
    { title: 'Parent-Teacher Meeting — April 15', body: 'Annual PTM scheduled for April 15. All parents are requested to attend.', type: 'event', priority: 'normal' },
    { title: 'Fee Submission Deadline', body: 'Monthly fee for April must be submitted by April 10th to avoid late charges.', type: 'fee', priority: 'high' },
    { title: 'Sports Day Announcement', body: 'Annual Sports Day will be held on April 25th. Students should bring PE kits.', type: 'event', priority: 'normal' },
  ]
  for (const n of notices) {
    await addDoc(schoolCol('notices'), {
      ...n,
      authorId: getUid('admin@schoolportal.live'),
      authorName: 'School Admin',
      createdAt: ts(Math.floor(Math.random() * 5)),
    })
  }
  console.log(`  ✓ ${notices.length} notices`)

  // ── 2. Homework ────────────────────────────────────────────────────
  console.log('\n📝 Creating Homework...')
  const homeworkItems = [
    { subject: 'English', title: 'Essay Writing — My Favourite Season', sectionId: 'class-1-a', teacherEmail: 'teacher.sarah@greenfield.demo', daysAgo: 2, dueDays: 3 },
    { subject: 'Urdu', title: 'Urdu Comprehension Exercise Ch. 3', sectionId: 'class-1-a', teacherEmail: 'teacher.sarah@greenfield.demo', daysAgo: 1, dueDays: 2 },
    { subject: 'Math', title: 'Algebra Practice — Page 45-47', sectionId: 'class-6-a', teacherEmail: 'teacher.bilal@greenfield.demo', daysAgo: 1, dueDays: 3 },
    { subject: 'Science', title: 'Draw and label a plant cell', sectionId: 'class-6-a', teacherEmail: 'teacher.bilal@greenfield.demo', daysAgo: 3, dueDays: 5 },
    { subject: 'General', title: 'Color the alphabet worksheet', sectionId: 'kg-a', teacherEmail: 'teacher.hina@greenfield.demo', daysAgo: 1, dueDays: 1 },
    { subject: 'Islamiat', title: 'Learn Surah Al-Fatiha translation', sectionId: 'class-1-a', teacherEmail: 'teacher.ali@greenfield.demo', daysAgo: 0, dueDays: 5 },
  ]
  for (const hw of homeworkItems) {
    const teacherId = getUid(hw.teacherEmail)
    await addDoc(schoolCol('homework'), {
      subject: hw.subject,
      title: hw.title,
      description: '',
      sectionId: hw.sectionId,
      teacherId,
      teacherName: users[hw.teacherEmail]?.displayName || 'Teacher',
      deadline: futureDate(hw.dueDays),
      status: 'assigned',
      completions: {},
      verifications: {},
      createdAt: ts(hw.daysAgo),
    })
  }
  console.log(`  ✓ ${homeworkItems.length} homework assignments`)

  // ── 3. Attendance ──────────────────────────────────────────────────
  console.log('\n✅ Creating Attendance Records...')
  const sections = ['class-1-a', 'class-6-a', 'kg-a']
  let attCount = 0
  for (const secId of sections) {
    const secStudents = students.filter(s => s.sectionId === secId)
    for (let daysAgo = 1; daysAgo <= 5; daysAgo++) {
      const date = dateStr(daysAgo)
      const records = secStudents.map(stu => {
        const rand = Math.random()
        return {
          studentId: stu.id,
          studentName: stu.displayName,
          status: rand < 0.85 ? 'present' : rand < 0.95 ? 'late' : 'absent',
        }
      })
      const docId = `${date}_${secId}`
      await setDoc(doc(db, 'schools', SCHOOL_ID, 'attendance', docId), {
        date,
        sectionId: secId,
        teacherId: null,
        teacherName: 'Auto-seeded',
        records,
        recordCount: records.length,
        presentCount: records.filter(r => r.status === 'present').length,
        absentCount: records.filter(r => r.status === 'absent').length,
        lateCount: records.filter(r => r.status === 'late').length,
        createdAt: ts(daysAgo),
      })
      attCount++
    }
  }
  console.log(`  ✓ ${attCount} attendance records (${sections.length} sections × 5 days)`)

  // ── 4. Fees ────────────────────────────────────────────────────────
  console.log('\n💰 Creating Fee Records...')
  let feeCount = 0
  const months = ['2026-03', '2026-04']
  for (const stu of students) {
    for (const month of months) {
      const isPaid = month === '2026-03' ? Math.random() > 0.2 : false
      await addDoc(schoolCol('fees'), {
        studentId: stu.id,
        studentName: stu.displayName || stu.name,
        sectionId: stu.sectionId,
        month,
        feeType: 'monthly',
        amount: 5000,
        amountDue: 5000,
        amountPaid: isPaid ? 5000 : 0,
        status: isPaid ? 'paid' : 'unpaid',
        dueDate: `${month}-10`,
        payments: isPaid ? [{ amount: 5000, date: `${month}-08`, method: 'bank_transfer', reference: `BK-${Math.floor(Math.random() * 99999)}` }] : [],
        createdAt: ts(month === '2026-03' ? 30 : 0),
      })
      feeCount++
    }
  }
  console.log(`  ✓ ${feeCount} fee records`)

  // ── 5. Transport Routes ────────────────────────────────────────────
  console.log('\n🚌 Creating Transport Routes...')
  const routes = [
    { name: 'Route A — Gulberg → School', driverName: 'Muhammad Aslam', driverPhone: '0300-1234567', vehicleNo: 'LHR-1234', stops: ['Gulberg Main', 'Liberty Chowk', 'MM Alam Road', 'School Gate'] },
    { name: 'Route B — DHA → School', driverName: 'Waseem Khan', driverPhone: '0301-7654321', vehicleNo: 'LHR-5678', stops: ['DHA Phase 5', 'DHA Phase 3', 'Cavalry Ground', 'School Gate'] },
    { name: 'Route C — Model Town → School', driverName: 'Naveed Ahmed', driverPhone: '0302-1111222', vehicleNo: 'LHR-9012', stops: ['Model Town Link Road', 'Faisal Town', 'Canal Road', 'School Gate'] },
  ]
  for (const r of routes) {
    await addDoc(schoolCol('transport'), {
      ...r,
      capacity: 30,
      currentStudents: Math.floor(Math.random() * 20) + 10,
      morningTime: '07:00',
      afternoonTime: '14:00',
      status: 'active',
      isActive: true,
      createdAt: ts(10),
    })
  }
  console.log(`  ✓ ${routes.length} transport routes`)

  // ── 6. Requisition Catalogue ───────────────────────────────────────
  console.log('\n📦 Creating Requisition Catalogue...')
  const catalogueItems = [
    { name: 'Whiteboard Marker (Black)', category: 'Stationery', unit: 'piece', unitPrice: 150 },
    { name: 'Whiteboard Marker (Blue)', category: 'Stationery', unit: 'piece', unitPrice: 150 },
    { name: 'Whiteboard Marker (Red)', category: 'Stationery', unit: 'piece', unitPrice: 150 },
    { name: 'A4 Paper Ream (500 sheets)', category: 'Paper', unit: 'ream', unitPrice: 950 },
    { name: 'Chalk Box (White)', category: 'Stationery', unit: 'box', unitPrice: 80 },
    { name: 'Chalk Box (Colored)', category: 'Stationery', unit: 'box', unitPrice: 120 },
    { name: 'Duster (Whiteboard)', category: 'Stationery', unit: 'piece', unitPrice: 200 },
    { name: 'Register (Attendance)', category: 'Registers', unit: 'piece', unitPrice: 350 },
    { name: 'Register (Homework)', category: 'Registers', unit: 'piece', unitPrice: 350 },
    { name: 'Chart Paper (White)', category: 'Art Supplies', unit: 'sheet', unitPrice: 50 },
    { name: 'Chart Paper (Colored)', category: 'Art Supplies', unit: 'sheet', unitPrice: 60 },
    { name: 'Glue Stick', category: 'Art Supplies', unit: 'piece', unitPrice: 100 },
    { name: 'Scissors (Student)', category: 'Art Supplies', unit: 'piece', unitPrice: 80 },
    { name: 'Printer Toner (Black)', category: 'Office', unit: 'cartridge', unitPrice: 4500 },
    { name: 'Stapler Pins', category: 'Office', unit: 'box', unitPrice: 120 },
    { name: 'Paper Clips', category: 'Office', unit: 'box', unitPrice: 60 },
    { name: 'Geometry Box', category: 'Math Supplies', unit: 'piece', unitPrice: 450 },
    { name: 'Science Lab Goggles', category: 'Lab Equipment', unit: 'piece', unitPrice: 800 },
    { name: 'Test Tubes (Pack of 10)', category: 'Lab Equipment', unit: 'pack', unitPrice: 600 },
    { name: 'First Aid Kit Refill', category: 'Medical', unit: 'kit', unitPrice: 2500 },
  ]
  for (const item of catalogueItems) {
    await addDoc(schoolCol('requisitionCatalogue'), {
      ...item,
      stockQuantity: Math.floor(Math.random() * 50) + 5,
      minStock: 5,
      isActive: true,
      createdAt: ts(30),
    })
  }
  console.log(`  ✓ ${catalogueItems.length} catalogue items`)

  // ── 7. School Events ───────────────────────────────────────────────
  console.log('\n📅 Creating School Events...')
  const events = [
    { title: 'Parent-Teacher Meeting', date: futureDate(13), type: 'meeting', location: 'School Hall', requiresRequisition: false },
    { title: 'Sports Day 2026', date: futureDate(23), type: 'sports', location: 'School Ground', requiresRequisition: true },
    { title: 'Mid-Term Exams Begin', date: futureDate(30), type: 'exam', location: 'Classrooms', requiresRequisition: true },
    { title: 'Independence Day Celebration', date: '2026-08-14', type: 'celebration', location: 'School Ground', requiresRequisition: true },
    { title: 'Summer Vacation Begins', date: '2026-06-01', type: 'holiday', location: '', requiresRequisition: false },
  ]
  for (const ev of events) {
    await addDoc(schoolCol('events'), {
      ...ev,
      description: '',
      status: 'upcoming',
      createdAt: ts(5),
    })
  }
  console.log(`  ✓ ${events.length} events`)

  // ── 8. Library Books ───────────────────────────────────────────────
  console.log('\n📚 Creating Library Books...')
  const books = [
    { title: 'Oxford English Grammar', author: 'Oxford University Press', isbn: '978-0-19-431250-8', category: 'Reference', copies: 10 },
    { title: 'Urdu Ka Guldasta', author: 'Punjab Textbook Board', isbn: '978-969-07-0001-1', category: 'Textbook', copies: 20 },
    { title: 'Mathematics for Class 6', author: 'Hamdard Foundation', isbn: '978-969-07-0002-8', category: 'Textbook', copies: 15 },
    { title: 'General Science', author: 'Oxford University Press', isbn: '978-0-19-547123-4', category: 'Textbook', copies: 15 },
    { title: 'Harry Potter and the Philosopher\'s Stone', author: 'J.K. Rowling', isbn: '978-0-7475-3269-9', category: 'Fiction', copies: 5 },
    { title: 'Islamic Studies Grade 1-3', author: 'Darussalam', isbn: '978-603-500-041-2', category: 'Religious', copies: 10 },
    { title: 'Computer Studies for Beginners', author: 'Cambridge Press', isbn: '978-1-107-61892-7', category: 'Technology', copies: 8 },
    { title: 'Pakistan Studies Atlas', author: 'Oxford University Press', isbn: '978-0-19-577340-0', category: 'Reference', copies: 12 },
  ]
  const libraryBooksCol = collection(db, 'schools', SCHOOL_ID, 'library', 'books', 'items')
  for (const b of books) {
    await addDoc(libraryBooksCol, {
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      category: b.category,
      copies: b.copies,
      availableCopies: b.copies,
      isActive: true,
      createdAt: ts(60),
    })
  }
  console.log(`  ✓ ${books.length} library books`)

  await signOut(auth)

  console.log('\n' + '─'.repeat(60))
  console.log('\n✅ Sample data seeding complete!')
  console.log(`  • ${notices.length} notices`)
  console.log(`  • ${homeworkItems.length} homework assignments`)
  console.log(`  • ${attCount} attendance records`)
  console.log(`  • ${feeCount} fee records`)
  console.log(`  • ${routes.length} transport routes`)
  console.log(`  • ${catalogueItems.length} catalogue items`)
  console.log(`  • ${events.length} events`)
  console.log(`  • ${books.length} library books`)
  console.log(`\nThe system is ready for demo! 🎉\n`)

  process.exit(0)
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message)
  process.exit(1)
})
