import { createRequire } from 'node:module'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Resolve the React Compiler plugin to an absolute path: @vitejs/plugin-react
// forwards a bare name to babel, which resolves from its own location in Bun's
// isolated store where babel-plugin-react-compiler is not a sibling — so the bare
// string fails regardless of cwd. createRequire anchors to apps/web/node_modules.
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
