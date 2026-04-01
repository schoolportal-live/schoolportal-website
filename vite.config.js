import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:           resolve(__dirname, 'index.html'),
        login:          resolve(__dirname, 'login.html'),
        resetPassword:  resolve(__dirname, 'reset-password.html'),
        adminDashboard:    resolve(__dirname, 'admin/dashboard.html'),
        parentPortal:      resolve(__dirname, 'parent/portal.html'),
        platformDashboard: resolve(__dirname, 'platform/dashboard.html'),
        schoolDashboard:   resolve(__dirname, 'school/dashboard.html'),
        schoolAdmin:       resolve(__dirname, 'school/admin.html'),
        schoolTeacher:     resolve(__dirname, 'school/teacher.html'),
        schoolLineManager: resolve(__dirname, 'school/linemanager.html'),
        schoolParent:      resolve(__dirname, 'school/parent.html'),
        schoolStudent:     resolve(__dirname, 'school/student.html'),
        schoolTimetable:   resolve(__dirname, 'school/timetable.html'),
        schoolOrgBuilder:  resolve(__dirname, 'school/org-builder.html'),
      },
    },
  },
})
