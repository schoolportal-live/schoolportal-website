/**
 * SchoolOS — Shared Constants
 *
 * Central definitions for roles, packages, modules, and route mappings.
 * Imported by guard.js, firestore helpers, and every dashboard page.
 */

// ── User Roles ─────────────────────────────────────────────────────────────

export const ROLES = {
  PLATFORM_ADMIN: 'platform_admin',   // Shumyle — super-super-admin
  SUPER_ADMIN: 'super_admin',         // School-level super admin
  ADMIN: 'admin',                     // Sub-admin (receptionist, accountant, etc.)
  LINE_MANAGER: 'line_manager',       // Floor head / line manager
  TEACHER: 'teacher',                 // Home teacher or subject teacher
  PARENT: 'parent',
  STUDENT: 'student',

  // Legacy (kept for backward compatibility during migration)
  SCHOOL_ADMIN: 'school_admin',
}

/** Admin sub-roles (when user.role === 'admin') */
export const ADMIN_SUB_ROLES = {
  RECEPTIONIST: 'receptionist',
  ACCOUNTANT: 'accountant',
  COORDINATOR: 'coordinator',
  REQUISITION_INCHARGE: 'requisition_incharge',
}

/** Hierarchy level numbers (lower = higher authority) */
export const HIERARCHY_LEVELS = {
  [ROLES.PLATFORM_ADMIN]: 0,
  [ROLES.SUPER_ADMIN]: 1,
  [ROLES.ADMIN]: 2,
  [ROLES.LINE_MANAGER]: 2,
  [ROLES.TEACHER]: 3,
  [ROLES.PARENT]: 4,
  [ROLES.STUDENT]: 5,
}

// ── Route Mapping ──────────────────────────────────────────────────────────

export const ROLE_ROUTES = {
  [ROLES.PLATFORM_ADMIN]: '/platform/dashboard.html',
  [ROLES.SUPER_ADMIN]: '/school/dashboard.html',
  [ROLES.ADMIN]: '/school/admin.html',
  [ROLES.LINE_MANAGER]: '/school/linemanager.html',
  [ROLES.TEACHER]: '/school/teacher.html',
  [ROLES.PARENT]: '/school/parent.html',
  [ROLES.STUDENT]: '/school/student.html',

  // Legacy routes (redirect to new ones in Phase 3)
  [ROLES.SCHOOL_ADMIN]: '/admin/dashboard.html',
}

// ── Modules ────────────────────────────────────────────────────────────────

export const MODULES = {
  COMMUNICATION: 'communication',
  REQUESTS: 'requests',
  ATTENDANCE: 'attendance',
  FEES: 'fees',
  RESULTS: 'results',
  HOMEWORK: 'homework',
  REQUISITION: 'requisition',
  TRANSPORT: 'transport',
  TIMETABLE: 'timetable',
  DOCUMENTS: 'documents',
  LIBRARY: 'library',
  EVENTS: 'events',
  NOTIFICATIONS: 'notifications',
}

/** Default package definitions */
export const PACKAGES = {
  basic: {
    name: 'Basic',
    modules: [
      MODULES.COMMUNICATION,
      MODULES.FEES,
    ],
  },
  standard: {
    name: 'Standard',
    modules: [
      MODULES.COMMUNICATION,
      MODULES.FEES,
      MODULES.ATTENDANCE,
      MODULES.RESULTS,
      MODULES.HOMEWORK,
    ],
  },
  premium: {
    name: 'Premium',
    modules: Object.values(MODULES),
  },
  custom: {
    name: 'Custom',
    modules: [], // Set per school by platform admin
  },
}

// ── Message Categories ─────────────────────────────────────────────────────

export const MESSAGE_CATEGORIES = [
  { value: 'early_leave', label: 'Early Leave' },
  { value: 'forgotten_item', label: 'Forgotten Item' },
  { value: 'early_pickup', label: 'Early Pickup' },
  { value: 'absent', label: 'Absent' },
  { value: 'schedule_meeting', label: 'Schedule Meeting' },
  { value: 'general', label: 'General' },
]

// ── Request Types ──────────────────────────────────────────────────────────

export const REQUEST_TYPES = [
  { value: 'leave', label: 'Leave Request' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'general', label: 'General Request' },
  { value: 'fee', label: 'Fee Issue' },
  { value: 'transport', label: 'Transport Issue' },
]

/** Extra recipients added for specific request types (beyond the base chain) */
export const REQUEST_EXTRA_RECIPIENTS = {
  fee: ['accountant'],
  transport: ['transport_incharge'],
}

// ── Pickup Person Relations ────────────────────────────────────────────────

export const PICKUP_RELATIONS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'relative', label: 'Relative' },
  { value: 'new_driver', label: 'New Driver' },
]

// ── Request & Form Statuses ────────────────────────────────────────────────

export const REQUEST_STATUSES = {
  PENDING: 'pending',
  ACKNOWLEDGED: 'acknowledged',
  IN_PROGRESS: 'in_progress',
  APPROVED: 'approved',
  DENIED: 'denied',
  ESCALATED: 'escalated',
  RESOLVED: 'resolved',
}

export const HOMEWORK_STATUSES = {
  ASSIGNED: 'assigned',
  COMPLETED: 'completed',       // Parent marked complete
  APPROVED: 'approved',         // Teacher verified
  INCOMPLETE: 'incomplete',     // Teacher says partial
  NOT_COMPLETED: 'not_completed', // Teacher says not done
}

// ── Attendance Statuses ────────────────────────────────────────────────────

export const ATTENDANCE_STATUSES = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EXCUSED: 'excused',
}

// ── Fee Statuses ───────────────────────────────────────────────────────────

export const FEE_STATUSES = {
  UNPAID: 'unpaid',
  PAID: 'paid',
  PARTIAL: 'partial',
  OVERDUE: 'overdue',
}

// ── Utility ────────────────────────────────────────────────────────────────

/** Word limit for parent messages */
export const MESSAGE_WORD_LIMIT = 30

/** Default auto-escalation time in hours */
export const ESCALATION_HOURS = 24
