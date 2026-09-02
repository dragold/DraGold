import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only: run the /api/img image proxy in `vite dev` (Vercel functions don't
// execute under the Vite dev server). Production uses api/img.js on Vercel.
function devApiImg() {
  return {
    name: 'dev-api-img',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/img', async (req, res) => {
        try {
          const { default: handler } = await server.ssrLoadModule('/api/img.js')
          const url = new URL(req.url, 'http://localhost')
          const query = Object.fromEntries(url.searchParams)
          const shim = {
            status(code) { res.statusCode = code; return shim },
            setHeader: (k, v) => res.setHeader(k, v),
            json: (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)) },
            send: (b) => res.end(b),
          }
          await handler({ method: req.method, query }, shim)
        } catch (e) {
          res.statusCode = 500
          res.end(String(e))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApiImg()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  // Component tests only (src/**/*.test.jsx, via vitest + @testing-library/react).
  // Pure-function tests (src/**/*.test.js) keep running on `node --test` (npm test)
  // — no overlap by extension, so both runners coexist without double-running files.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
    include: ['src/**/*.test.jsx'],
    css: false,
  },
})
