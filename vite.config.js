import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// L'app è pubblicata su https://lamaslamas.github.io/orme/
// quindi tutti i percorsi partono da /orme/.
const BASE = '/orme/';

// Le porzioni di mappa già viste restano disponibili offline (con un limite),
// senza scaricare in anticipo intere zone come chiedono le regole di OpenStreetMap.
function cacheMappa(nome, regola) {
  return {
    urlPattern: regola,
    handler: 'CacheFirst',
    options: {
      cacheName: nome,
      expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
      cacheableResponse: { statuses: [0, 200] },
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone/icona.svg', 'icone/apple-touch-icon.png'],
      manifest: {
        name: 'Orme',
        short_name: 'Orme',
        description: "Sentieri faunistici del Parco Nazionale d'Abruzzo, Lazio e Molise",
        lang: 'it',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f5f2',
        theme_color: '#1d3b1f',
        icons: [
          { src: 'icone/icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone/icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone/icona-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [
          cacheMappa('mappa-osm', /^https:\/\/tile\.openstreetmap\.org\//),
          cacheMappa('mappa-topo', /^https:\/\/[abc]\.tile\.opentopomap\.org\//),
          cacheMappa('mappa-sentieri', /^https:\/\/tile\.waymarkedtrails\.org\//),
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
