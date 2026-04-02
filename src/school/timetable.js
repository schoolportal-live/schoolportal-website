/**
 * SchoolOS — Timetable Builder
 * Protected page: requires auth + super_admin role
 *
 * Configurable grid builder:
 *   - Set period count, duration, start time, zero periods
 *   - Add breaks between periods
 *   - Assign subjects + teachers to each slot
 *   - Conflict detection (same teacher at same time)
 *   - Save per section
 */
import { initGuard } from '../firebase/guard.js'
import { logout } from '../firebase/auth.js'
import {
  getSections, getClasses, getSchoolUsers,
  saveTimetable, getTimetable,
} from '../firebase/schools.js'
import { esc, toast } from '../shared/components.js'

// ── Auth Guard ──────────────────────────────────────────────────────────
const { user, role, userDoc, school } = await initGuard({
  requireAuth: true,
  allowedRoles: ['super_admin'],
  loadSchool: true,
})

const schoolId = userDoc.schoolId

// ── Header ──────────────────────────────────────────────────────────────
const displayName = user.displayName || user.email.split('@')[0]
document.getElementById('user-name').textContent = displayName

document.getElementById('logout-btn').addEventListener('click', async () => {
  await logout()
  window.location.replace('/login.html')
})

// ── State ───────────────────────────────────────────────────────────────
let sections = []
let classes = []
let users = []
let currentSection = null
let currentTimetable = null
let breaks = []  // [{ afterPeriod: 3, duration: 20, label: 'Lunch' }]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ── Load Data ───────────────────────────────────────────────────────────
async function loadAll() {
  try {
    ;[sections, classes, users] = await Promise.all([
      getSections(schoolId),
      getClasses(schoolId).catch(() => []),
      getSchoolUsers(schoolId),
    ])
    populateSectionSelect()
  } catch (err) {
    console.error('Failed to load data:', err)
    toast('Failed to load data', 'error')
  }
}

function populateSectionSelect() {
  const select = document.getElementById('section-select')
  select.innerHTML = '<option value="">— Choose a section —</option>' +
    sections.map(s => `<option value="${esc(s.id)}">${esc(s.displayName || s.id)}</option>`).join('')
}

function getTeachers() {
  return users.filter(u => u.role === 'teacher')
}

// ── Section Selection ──────────────────────────────────────────────────
document.getElementById('section-select').addEventListener('change', async (e) => {
  const sectionId = e.target.value
  if (!sectionId) {
    document.getElementById('period-config').style.display = 'none'
    document.getElementById('timetable-grid').style.display = 'none'
    currentSection = null
    return
  }

  currentSection = sections.find(s => s.id === sectionId)
  document.getElementById('period-config').style.display = 'block'

  // Try loading existing timetable
  try {
    currentTimetable = await getTimetable(schoolId, sectionId)
    if (currentTimetable) {
      // Populate config from saved data
      const periods = currentTimetable.periods || []
      document.getElementById('period-count').value = periods.length || 8
      if (currentTimetable.zeroPeriods?.length) {
        document.getElementById('zero-periods').value = currentTimetable.zeroPeriods.length
      }
      breaks = currentTimetable.breaks || []
      renderBreaks()
      generateGrid()
    } else {
      breaks = [{ afterPeriod: 4, duration: 30, label: 'Lunch Break' }]
      renderBreaks()
      document.getElementById('timetable-grid').style.display = 'none'
    }
  } catch (err) {
    console.warn('No existing timetable:', err)
    breaks = [{ afterPeriod: 4, duration: 30, label: 'Lunch Break' }]
    renderBreaks()
  }
})

// ── Breaks Management ──────────────────────────────────────────────────
function renderBreaks() {
  const container = document.getElementById('breaks-list')
  container.innerHTML = breaks.map((b, i) => `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
      <label style="min-width:80px;">After P${b.afterPeriod}:</label>
      <input type="text" class="dash-input break-label" value="${esc(b.label)}" data-idx="${i}" style="width:140px;" placeholder="Label">
      <input type="number" class="dash-input break-duration" value="${b.duration}" data-idx="${i}" style="width:70px;" min="5" max="60"> min
      <button class="btn btn-ghost btn-sm remove-break" data-idx="${i}" style="color:#ef4444;">✕</button>
    </div>
  `).join('')

  container.querySelectorAll('.break-label').forEach(input => {
    input.addEventListener('change', () => { breaks[input.dataset.idx].label = input.value })
  })
  container.querySelectorAll('.break-duration').forEach(input => {
    input.addEventListener('change', () => { breaks[input.dataset.idx].duration = parseInt(input.value) || 20 })
  })
  container.querySelectorAll('.remove-break').forEach(btn => {
    btn.addEventListener('click', () => { breaks.splice(btn.dataset.idx, 1); renderBreaks() })
  })
}

document.getElementById('add-break-btn').addEventListener('click', () => {
  const periodCount = parseInt(document.getElementById('period-count').value) || 8
  const afterPeriod = Math.min(Math.floor(periodCount / 2), periodCount)
  breaks.push({ afterPeriod, duration: 20, label: 'Break' })
  renderBreaks()
})

// ── Generate Grid ──────────────────────────────────────────────────────
document.getElementById('generate-grid-btn').addEventListener('click', generateGrid)

function generateGrid() {
  const periodCount = parseInt(document.getElementById('period-count').value) || 8
  const zeroPeriodCount = parseInt(document.getElementById('zero-periods').value) || 0
  const periodDuration = parseInt(document.getElementById('period-duration').value) || 40
  const startTime = document.getElementById('start-time').value || '08:00'

  // Generate period times
  const periods = []
  let [hours, mins] = startTime.split(':').map(Number)

  // Zero periods first
  for (let i = 0; i < zeroPeriodCount; i++) {
    const start = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
    mins += periodDuration
    if (mins >= 60) { hours += Math.floor(mins / 60); mins %= 60 }
    const end = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
    periods.push({ label: `Z${i + 1}`, start, end, isZero: true })
  }

  // Regular periods
  for (let i = 0; i < periodCount; i++) {
    // Check for break before this period
    const breakBefore = breaks.find(b => b.afterPeriod === i)
    if (breakBefore) {
      mins += breakBefore.duration
      if (mins >= 60) { hours += Math.floor(mins / 60); mins %= 60 }
    }

    const start = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
    mins += periodDuration
    if (mins >= 60) { hours += Math.floor(mins / 60); mins %= 60 }
    const end = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
    periods.push({ label: `P${i + 1}`, start, end, isZero: false })
  }

  // Build the grid
  const teachers = getTeachers()
  const schedule = currentTimetable?.schedule || {}

  const table = document.getElementById('schedule-table')
  let html = '<thead><tr><th>Day / Period</th>'
  periods.forEach(p => {
    html += `<th style="font-size:12px;text-align:center;">${esc(p.label)}<br><span style="color:#6b7280;font-size:11px;">${p.start}-${p.end}</span></th>`
  })
  html += '</tr></thead><tbody>'

  for (const day of DAYS) {
    const daySlots = schedule[day] || []
    html += `<tr><td><strong>${day}</strong></td>`
    periods.forEach((p, pi) => {
      const slot = daySlots.find(s => s.periodIndex === pi)
      const subject = slot?.subject || ''
      const teacherId = slot?.teacherId || ''
      html += `<td style="padding:4px;">
        <input type="text" class="dash-input slot-subject" data-day="${day}" data-period="${pi}" value="${esc(subject)}" placeholder="Subject" style="width:80px;font-size:12px;margin-bottom:2px;">
        <select class="dash-input slot-teacher" data-day="${day}" data-period="${pi}" style="width:80px;font-size:11px;">
          <option value="">—</option>
          ${teachers.map(t => `<option value="${esc(t.id)}" ${t.id === teacherId ? 'selected' : ''}>${esc((t.displayName || t.email || '').substring(0, 15))}</option>`).join('')}
        </select>
      </td>`
    })
    html += '</tr>'
  }
  html += '</tbody>'
  table.innerHTML = html

  // Store periods for save
  table.dataset.periodCount = periods.length
  table._periods = periods

  document.getElementById('timetable-grid').style.display = 'block'

  // Attach conflict detection on change
  table.querySelectorAll('.slot-teacher').forEach(select => {
    select.addEventListener('change', detectConflicts)
  })

  detectConflicts()
}

// ── Conflict Detection ─────────────────────────────────────────────────
function detectConflicts() {
  const table = document.getElementById('schedule-table')
  const warnings = []

  // Check for duplicate teacher assignments within the grid
  const teacherSlots = {}
  table.querySelectorAll('.slot-teacher').forEach(select => {
    const day = select.dataset.day
    const period = select.dataset.period
    const teacherId = select.value
    if (!teacherId) return
    const key = `${teacherId}-${day}-${period}`
    if (!teacherSlots[key]) teacherSlots[key] = 0
    teacherSlots[key]++
    if (teacherSlots[key] > 1) {
      const teacher = users.find(u => u.id === teacherId)
      warnings.push(`${teacher?.displayName || teacherId} is assigned twice on ${day} Period ${parseInt(period) + 1}`)
    }
  })

  const warningsEl = document.getElementById('conflict-warnings')
  const listEl = document.getElementById('conflict-list')
  if (warnings.length > 0) {
    listEl.innerHTML = warnings.map(w => `<li>${esc(w)}</li>`).join('')
    warningsEl.style.display = 'block'
  } else {
    warningsEl.style.display = 'none'
  }
}

// ── Save Timetable ─────────────────────────────────────────────────────
document.getElementById('save-timetable-btn').addEventListener('click', async () => {
  if (!currentSection) {
    toast('No section selected', 'error')
    return
  }

  const table = document.getElementById('schedule-table')
  const statusEl = document.getElementById('save-status')
  statusEl.textContent = 'Saving...'
  statusEl.className = 'dash-form-status status-sending'

  // Gather schedule from grid
  const schedule = {}
  for (const day of DAYS) {
    const slots = []
    table.querySelectorAll(`.slot-subject[data-day="${day}"]`).forEach(input => {
      const period = parseInt(input.dataset.period)
      const subject = input.value.trim()
      const teacherSelect = table.querySelector(`.slot-teacher[data-day="${day}"][data-period="${period}"]`)
      const teacherId = teacherSelect?.value || ''
      if (subject || teacherId) {
        slots.push({ periodIndex: period, subject, teacherId })
      }
    })
    if (slots.length) schedule[day] = slots
  }

  // Gather period config
  const periodCount = parseInt(document.getElementById('period-count').value) || 8
  const periodDuration = parseInt(document.getElementById('period-duration').value) || 40
  const startTime = document.getElementById('start-time').value || '08:00'
  const zeroPeriodCount = parseInt(document.getElementById('zero-periods').value) || 0

  const periods = []
  for (let i = 0; i < zeroPeriodCount; i++) periods.push({ label: `Z${i + 1}`, isZero: true })
  for (let i = 0; i < periodCount; i++) periods.push({ label: `P${i + 1}`, isZero: false, duration: periodDuration })

  const zeroPeriods = periods.filter(p => p.isZero).map(p => p.label)

  try {
    await saveTimetable(schoolId, currentSection.id, {
      periods,
      breaks,
      zeroPeriods,
      schedule,
      startTime,
      periodDuration,
    })
    statusEl.textContent = 'Saved!'
    statusEl.className = 'dash-form-status status-success'
    toast('Timetable saved', 'success')
  } catch (err) {
    console.error('Failed to save timetable:', err)
    statusEl.textContent = 'Failed to save'
    statusEl.className = 'dash-form-status status-error'
    toast('Failed to save timetable', 'error')
  }
})

// ── Init ────────────────────────────────────────────────────────────────
loadAll()
