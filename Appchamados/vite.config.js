import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_SERVER_URL || 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/uploads': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('html2canvas')) {
            return 'html2canvas'
          }

          if (id.includes('uuid')) {
            return 'uuid'
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

          if (id.includes('react-transition-group')) {
            return 'motion'
          }

          if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('/react/')) {
            return 'react'
          }

          if (id.includes('@babel/runtime')) {
            return 'runtime'
          }

          return 'vendor'
        },
      },
    },
  },
})
