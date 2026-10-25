import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The dev server proxies to the Go backend. Override the target when the backend
// is not reachable on localhost, for example VITE_API_PROXY=http://host.docker.internal:4533
// when running this dev server inside a container.
const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:4533'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/rest': { target: apiTarget, changeOrigin: true },
    },
  },
})
