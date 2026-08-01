import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('jspdf') || id.includes('jspdf-autotable')) {
            return 'pdf'
          }

          if (id.includes('react-easy-crop')) {
            return 'cropper'
          }

          if (id.includes('recharts')) {
            return 'charts'
          }

          if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('/react/')) {
            return 'react'
          }

          return 'vendor'
        },
      },
    },
  },
})
