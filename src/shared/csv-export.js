/**
 * CSV Export Utility for SchoolOS
 * Provides functions to export various data sets as downloadable CSV files.
 * No external dependencies - uses Blob + URL.createObjectURL.
 */

/**
 * Escape a cell value for CSV format.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 * Double quotes within the value are escaped by doubling them.
 */
function escapeCSVValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
function todayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Trigger a CSV file download in the browser.
 */
function triggerDownload(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Generic CSV export.
 * @param {Object[]} data - Array of row objects.
 * @param {string} filename - Download filename (e.g. 'report.csv').
 * @param {Array<{key: string, label: string}>} columns - Column definitions.
 */
export function exportToCSV(data, filename, columns) {
  if (!data || !columns) return;

  const headerRow = columns.map(col => escapeCSVValue(col.label)).join(',');

  const dataRows = data.map(row =>
    columns.map(col => escapeCSVValue(row[col.key])).join(',')
  );

  const csv = [headerRow, ...dataRows].join('\n');
  triggerDownload(csv, filename);
}

/**
 * Export attendance records for a section on a given date.
 * @param {Array<{studentName: string, studentId: string, status: string}>} records
 * @param {string} sectionName
 * @param {string} date - Date string (e.g. '2026-04-02').
 */
export function exportAttendanceCSV(records, sectionName, date) {
  const columns = [
    { key: 'studentName', label: 'Student Name' },
    { key: 'studentId', label: 'Student ID' },
    { key: 'status', label: 'Status' }
  ];
  const safeName = sectionName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `attendance-${safeName}-${date}.csv`;
  exportToCSV(records, filename, columns);
}

/**
 * Export a student list.
 * @param {Object[]} students - Array of student objects.
 */
export function exportStudentsCSV(students) {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'rollNo', label: 'Roll No' },
    { key: 'section', label: 'Section' },
    { key: 'class', label: 'Class' },
    { key: 'parentName', label: 'Parent Name' },
    { key: 'parentPhone', label: 'Parent Phone' },
    { key: 'status', label: 'Status' }
  ];
  const filename = `students-export-${todayDate()}.csv`;
  exportToCSV(students, filename, columns);
}

/**
 * Export fee records.
 * @param {Object[]} fees - Array of fee record objects.
 */
export function exportFeesCSV(fees) {
  const columns = [
    { key: 'studentName', label: 'Student Name' },
    { key: 'month', label: 'Month' },
    { key: 'feeType', label: 'Fee Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'paid', label: 'Paid' },
    { key: 'balance', label: 'Balance' },
    { key: 'status', label: 'Status' }
  ];
  const filename = `fees-export-${todayDate()}.csv`;
  exportToCSV(fees, filename, columns);
}

/**
 * Export exam results with dynamic subject columns.
 * @param {Object} exam - Exam object with at least { name, subjects: string[], results: Object }.
 *   exam.results is a map of studentId -> { scores: { [subject]: number }, total: number, percentage: number }
 * @param {Array<{id: string, name: string}>} students - Student array for name lookup.
 */
export function exportResultsCSV(exam, students) {
  if (!exam || !students) return;

  const subjects = exam.subjects || [];

  const columns = [
    { key: 'studentName', label: 'Student Name' },
    ...subjects.map(sub => ({ key: `subject_${sub}`, label: sub })),
    { key: 'total', label: 'Total' },
    { key: 'percentage', label: 'Percentage' }
  ];

  const results = exam.results || {};

  const data = students.map(student => {
    const result = results[student.id] || {};
    const scores = result.scores || {};
    const row = {
      studentName: student.name
    };
    subjects.forEach(sub => {
      row[`subject_${sub}`] = scores[sub] !== undefined ? scores[sub] : '';
    });
    row.total = result.total !== undefined ? result.total : '';
    row.percentage = result.percentage !== undefined ? result.percentage : '';
    return row;
  });

  const safeName = (exam.name || 'exam').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `results-${safeName}-${todayDate()}.csv`;
  exportToCSV(data, filename, columns);
}
