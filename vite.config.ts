import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// One HTML file per route. GitHub Pages serves /practice as /practice/index.html.
const pages = ['practice', 'session', 'room', 'difficulties', 'onboarding']

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(pages.map((p) => [p, resolve(__dirname, p, 'index.html')])),
      },
    },
  },
})
