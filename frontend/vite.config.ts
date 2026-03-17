import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'

function gitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

const frontendPort = parseInt(process.env.VITE_PORT || '5173', 10)
const backendPort = parseInt(process.env.VITE_BACKEND_PORT || '8000', 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __GIT_BRANCH__: JSON.stringify(gitBranch()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: frontendPort,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': `http://localhost:${backendPort}`,
    },
  },
})
