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
    rollupOptions: {
      output: {
        manualChunks: {
          // Split WebGL stack from main bundle (819KB → 3 chunks separati)
          'three-webgl': ['three', '@react-three/fiber', '@react-three/drei'],
          // Split animation libraries from main bundle
          'animation': ['gsap', '@gsap/react', 'lenis'],
          // AtlasCanvas specific: già lazy-loaded, ma split ulteriore per la dependency tree
          // Noto: AtlasCanvas è già lazy-loaded in HomePage.jsx, questo è solo per
          // evitare che le sue dependencies finiscano nel vendor chunk generico
        },
      },
    },
  },
})
