import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Audio fixtures live under public/ so the dev server can serve them to the browser during
 * testing, but they're megabytes of test tones with no place in a production bundle.
 */
function excludeDevAssets(): Plugin {
  return {
    name: 'exclude-dev-assets',
    apply: 'build',
    closeBundle() {
      rmSync(fileURLToPath(new URL('dist/dev-assets', import.meta.url)), { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), excludeDevAssets()],
})
