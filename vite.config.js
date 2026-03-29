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
        adminDashboard: resolve(__dirname, 'admin/dashboard.html'),
        parentPortal:   resolve(__dirname, 'parent/portal.html'),
      },
    },
  },
})
