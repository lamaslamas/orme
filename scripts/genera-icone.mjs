// Genera le icone PNG dell'app a partire dagli SVG.
// Uso: npm install --no-save sharp && node scripts/genera-icone.mjs
import sharp from 'sharp';

const lavori = [
  ['scripts/icona.svg', 'public/icone/icona-192.png', 192],
  ['scripts/icona.svg', 'public/icone/icona-512.png', 512],
  ['scripts/icona-maskable.svg', 'public/icone/icona-maskable-512.png', 512],
  ['scripts/icona.svg', 'public/icone/apple-touch-icon.png', 180],
];
for (const [da, a, lato] of lavori) {
  await sharp(da, { density: 300 }).resize(lato, lato).png().toFile(a);
  console.log('creata', a);
}
