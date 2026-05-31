import { createRequire } from 'node:module'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// React 19 + React Compiler + Tailwind v4. TanStack Router's file-based
// routing plugin is intentionally deferred — routes are downstream features,
// and an empty route tree would fail the build. @tanstack/react-router is
// already a dependency, ready to wire when the first route lands.
//
// VITE_API_BASE_URL is exposed to the app natively via import.meta.env
// (Vite auto-injects VITE_-prefixed env vars at build time).

// Resolve the React Compiler babel plugin to an absolute path anchored to THIS
// config file, not a bare specifier. @vitejs/plugin-react forwards a bare plugin
// name to babel, which resolves it from babel's own location inside Bun's
// isolated store (node_modules/.bun/@vitejs+plugin-react@*/...), where
// babel-plugin-react-compiler is not a sibling and is not hoisted to the repo
// root — so the bare string fails no matter the process cwd. createRequire
// anchored to import.meta.url resolves against apps/web/node_modules (where the
// plugin IS linked), giving an absolute path that loads identically whether
// vite/vitest runs from apps/web or the repo root.
const reactCompiler = createRequire(import.meta.url).resolve('babel-plugin-react-compiler')

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [[reactCompiler, { target: '19' }]],
      },
    }),
    tailwindcss(),
  ],
})
