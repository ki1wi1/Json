import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/Json/',  // Repository-Name hier einfügen
  plugins: [react()],
})
