/**
 * SchoolOS — Report Card Generator
 *
 * Generates a printable report card HTML for a student.
 * Opens in a new window with print styling.
 *
 * Data model:
 *   exam: { name, examType, subjects: [], maxMarks: { [subject]: number }, results: { [studentId]: { [subject]: { marks } } } }
 *   student: { name, rollNumber, sectionId }
 *   school: { name, branding: { logo, primaryColor } }
 *   section/class names passed as strings
 */

/**
 * Generate and open a printable report card.
 *
 * @param {Object} opts
 * @param {Object} opts.student - { name, rollNumber, id }
 * @param {Object} opts.exam - exam document from Firestore
 * @param {string} opts.schoolName
 * @param {string} opts.schoolLogo - URL or empty
 * @param {string} opts.className
 * @param {string} opts.sectionName
 * @param {string} opts.primaryColor - hex color
 * @param {string} opts.academicYear
 */
export function printReportCard({
  student, exam, schoolName, schoolLogo,
  className, sectionName, primaryColor, academicYear
}) {
  if (!student || !exam) return

  const subjects = exam.subjects || []
  const maxMarksMap = exam.maxMarks || {}
  const studentResults = exam.results?.[student.id] || {}
  const color = primaryColor || '#2563eb'

  // Calculate totals
  let totalObtained = 0
  let totalMax = 0
  const rows = subjects.map(sub => {
    const marks = studentResults[sub]?.marks ?? studentResults[sub] ?? '—'
    const max = maxMarksMap[sub] || 100
    const obtained = typeof marks === 'number' ? marks : 0
    totalObtained += obtained
    totalMax += max
    const pct = typeof marks === 'number' ? ((obtained / max) * 100).toFixed(1) : '—'
    const grade = typeof marks === 'number' ? getGrade(obtained / max * 100) : '—'
    return { subject: sub, marks, max, percentage: pct, grade }
  })

  const overallPct = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : '—'
  const overallGrade = totalMax > 0 ? getGrade(totalObtained / totalMax * 100) : '—'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Report Card — ${esc(student.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; line-height: 1.5; padding: 20px; }
    .report-card { max-width: 800px; margin: 0 auto; border: 2px solid ${esc(color)}; padding: 0; }
    .rc-header { background: ${esc(color)}; color: #fff; padding: 24px 32px; display: flex; align-items: center; gap: 20px; }
    .rc-logo { width: 64px; height: 64px; border-radius: 8px; object-fit: contain; background: rgba(255,255,255,0.2); padding: 4px; }
    .rc-school-name { font-size: 24px; font-weight: 700; }
    .rc-subtitle { font-size: 13px; opacity: 0.85; margin-top: 2px; }
    .rc-title-bar { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 32px; text-align: center; }
    .rc-title-bar h2 { font-size: 18px; color: ${esc(color)}; letter-spacing: 1px; text-transform: uppercase; }
    .rc-info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; padding: 20px 32px; border-bottom: 1px solid #e2e8f0; }
    .rc-info-item { font-size: 14px; }
    .rc-info-item strong { color: #475569; min-width: 100px; display: inline-block; }
    .rc-table { width: 100%; border-collapse: collapse; }
    .rc-table th { background: ${esc(color)}; color: #fff; padding: 10px 16px; text-align: left; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .rc-table td { padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .rc-table tr:nth-child(even) td { background: #f8fafc; }
    .rc-table .total-row td { font-weight: 700; background: #f1f5f9; border-top: 2px solid ${esc(color)}; }
    .rc-footer { padding: 24px 32px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; border-top: 1px solid #e2e8f0; margin-top: 0; }
    .rc-sign { text-align: center; padding-top: 40px; border-top: 1px solid #94a3b8; font-size: 12px; color: #64748b; }
    .rc-grade-box { text-align: center; padding: 16px 32px; background: #f8fafc; }
    .rc-grade-big { font-size: 36px; font-weight: 800; color: ${esc(color)}; }
    .rc-grade-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
    .rc-watermark { text-align: center; padding: 8px; font-size: 11px; color: #94a3b8; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:16px;" class="no-print">
    <button onclick="window.print()" style="padding:10px 24px;background:${esc(color)};color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;">
      Print Report Card
    </button>
    <button onclick="window.close()" style="padding:10px 24px;background:#e2e8f0;color:#334155;border:none;border-radius:6px;font-size:14px;cursor:pointer;margin-left:8px;">
      Close
    </button>
  </div>

  <div class="report-card">
    <div class="rc-header">
      ${schoolLogo ? `<img class="rc-logo" src="${esc(schoolLogo)}" alt="Logo" />` : ''}
      <div>
        <div class="rc-school-name">${esc(schoolName || 'SchoolOS')}</div>
        <div class="rc-subtitle">${academicYear ? `Academic Year: ${esc(academicYear)}` : ''}</div>
      </div>
    </div>

    <div class="rc-title-bar">
      <h2>Progress Report — ${esc(exam.name || 'Examination')}</h2>
    </div>

    <div class="rc-info">
      <div class="rc-info-item"><strong>Student:</strong> ${esc(student.name)}</div>
      <div class="rc-info-item"><strong>Roll No:</strong> ${esc(student.rollNumber || '—')}</div>
      <div class="rc-info-item"><strong>Class:</strong> ${esc(className || '—')}</div>
      <div class="rc-info-item"><strong>Section:</strong> ${esc(sectionName || '—')}</div>
      <div class="rc-info-item"><strong>Exam Type:</strong> ${esc(exam.examType || '—')}</div>
      <div class="rc-info-item"><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>

    <table class="rc-table">
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>Subject</th>
          <th style="text-align:center;">Max Marks</th>
          <th style="text-align:center;">Obtained</th>
          <th style="text-align:center;">%</th>
          <th style="text-align:center;">Grade</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(r.subject)}</td>
            <td style="text-align:center;">${r.max}</td>
            <td style="text-align:center;">${r.marks}</td>
            <td style="text-align:center;">${r.percentage}%</td>
            <td style="text-align:center;font-weight:600;">${r.grade}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td></td>
          <td>Total</td>
          <td style="text-align:center;">${totalMax}</td>
          <td style="text-align:center;">${totalObtained}</td>
          <td style="text-align:center;">${overallPct}%</td>
          <td style="text-align:center;">${overallGrade}</td>
        </tr>
      </tbody>
    </table>

    <div class="rc-grade-box">
      <div class="rc-grade-label">Overall Grade</div>
      <div class="rc-grade-big">${overallGrade}</div>
      <div class="rc-grade-label">${overallPct}%</div>
    </div>

    <div class="rc-footer">
      <div class="rc-sign">Class Teacher</div>
      <div class="rc-sign">Principal</div>
      <div class="rc-sign">Parent / Guardian</div>
    </div>

    <div class="rc-watermark">Generated by SchoolOS</div>
  </div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

/**
 * Grade mapping (customizable per school in future).
 */
function getGrade(percentage) {
  if (percentage >= 90) return 'A+'
  if (percentage >= 80) return 'A'
  if (percentage >= 70) return 'B+'
  if (percentage >= 60) return 'B'
  if (percentage >= 50) return 'C'
  if (percentage >= 40) return 'D'
  return 'F'
}

/** Simple HTML escape */
function esc(str) {
  if (str == null) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
