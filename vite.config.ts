import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset URLs keep the build usable from any sub-path (and from a file preview).
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'پلاسکو منیجینگ',
        short_name: 'پلاسکو',
        description: 'مدیریت انبار و فروشگاه محصولات پلاستیکی',
        lang: 'fa',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'portrait',
        // Relative values keep the same build working at the domain root,
        // in a sub-folder, and on localhost. `id` pins the app identity so
        // Chrome treats every deployment path as one installed app.
        id: './',
        start_url: './',
        scope: './',
        theme_color: '#0B7285',
        background_color: '#F1F5F6',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        // preview.html is the single-file build for double-clicking on a PC; it
        // must never be pre-cached into the installed app (it doubles the download).
        globIgnores: ['preview.html'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
