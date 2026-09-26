import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ── Validazione env obbligatorie al build time ──────────────────────────────
// Vite espone le env var di Vercel come process.env durante il build.
// Validiamo che le variabili necessarie siano presenti; se mancano,
// il build fallisce invece di produrre un bundle rotto.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[vite.config] ENV obbligatorie mancanti:',
    !SUPABASE_URL ? (!!SUPABASE_ANON_KEY ? 'VITE_SUPABASE_URL' : 'VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY') : '',
    !SUPABASE_ANON_KEY && SUPABASE_URL ? 'VITE_SUPABASE_ANON_KEY' : ''
  )
  process.exit(1)
}

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
          // Split animation libraries from main bundle
          'animation': ['gsap', '@gsap/react', 'lenis'],
        },
      },
    },
  },
})
