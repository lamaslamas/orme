import { defineConfig } from 'vite';

// L'app è pubblicata su https://lamaslamas.github.io/orme/
// quindi tutti i percorsi partono da /orme/.
export default defineConfig({
  base: '/orme/',
  test: {
    environment: 'node',
  },
});
