import * as esbuild from 'esbuild';
import { mkdirSync, cpSync } from 'fs';

mkdirSync('dist/assets', { recursive: true });

await esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  outfile: 'dist/assets/index.js',
  jsx: 'automatic',
  jsxImportSource: 'react',
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ''),
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.BASE_URL': '"/"',
  },
  loader: {
    '.png': 'file',
    '.svg': 'file',
    '.jpg': 'file',
    '.jpeg': 'file',
    '.gif': 'file',
    '.webp': 'file',
  },
  assetNames: 'assets/[name]-[hash]',
  logLevel: 'info',
});

// Copia public/ → dist/ (favicon, manifest, ecc.)
cpSync('public', 'dist', { recursive: true });

console.log('Build completato.');
