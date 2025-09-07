import { defineConfig } from 'vite'

// Minimal Vite config — no plugins required for basic JSX transform.
export default defineConfig({
  root: '.',
  server: {
    port: 5173
  }
})
