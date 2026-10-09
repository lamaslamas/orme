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
      includeAssets: ['icone/icona.svg', 'icone/apple-touch-icon.png', 'logo.svg'],
      manifest: {
        name: 'Orme',
        short_name: 'Orme',
        description: 'Sentieri, fauna e panorami dei parchi nazionali italiani: trekking, MTB ed e-MTB',
        lang: 'it',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f4ef',
        theme_color: '#2f6f6d',
        icons: [
          { src: 'icone/icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone/icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone/icona-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // caratteri per alfabeti non usati (cirillico, greco, vietnamita): si scaricano solo se servono
        globIgnores: ['dati/**', '**/*-cyrillic*', '**/*-greek*', '**/*-vietnamese*'],
        // la nuova versione prende subito il posto della vecchia e ne cancella i file
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [
          cacheMappa('mappa-osm', /^https:\/\/tile\.openstreetmap\.org\//),
          cacheMappa('mappa-vettoriale', /^https:\/\/tiles\.openfreemap\.org\//),
          cacheMappa('mappa-topo', /^https:\/\/[abc]\.tile\.opentopomap\.org\//),
          cacheMappa('mappa-sentieri', /^https:\/\/tile\.waymarkedtrails\.org\//),
          cacheMappa('mappa-satellite', /^https:\/\/server\.arcgisonline\.com\//),
          // archivio pubblico: prima la rete, la copia salvata solo offline
          {
            urlPattern: /\/dati\/.*\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'orme-archivio', networkTimeoutSeconds: 5, expiration: { maxEntries: 20 } },
          },
          // foto di parchi e animali (Wikimedia Commons): non cambiano, si tengono a lungo
          {
            urlPattern: /^https:\/\/(thumb|upload)\.wikimedia\.org\//,
            handler: 'CacheFirst',
            options: { cacheName: 'foto-commons', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } },
          },
          // heatmap iNaturalist: si aggiorna spesso, la teniamo solo un giorno
          {
            urlPattern: /^https:\/\/api\.inaturalist\.org\/v1\/heatmap\//,
            handler: 'CacheFirst',
            options: { cacheName: 'inaturalist-heatmap', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
