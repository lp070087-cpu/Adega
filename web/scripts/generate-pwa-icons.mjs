import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../public/pwa/', import.meta.url));
await mkdir(output, { recursive: true });
const shapes = {
  panel: { color: '#0B1F3A', label: 'Del Flash', paths: '<path d="m276 112-104 160h96l-20 128 112-176h-96Z" fill="white" stroke="none"/><path d="M128 168h56M112 212h40" stroke="#168FE5"/>' },
  customer: { color: '#087EA4', label: 'Del Flash Loja', paths: '<path d="M168 208h176l24 176H144zM216 208v-40a40 40 0 0 1 80 0v40"/><path d="m266 244-42 66h36l-8 42 48-74h-36Z" fill="white" stroke="none"/>' },
  driver: { color: '#0B1F3A', label: 'Del Flash Entregador', paths: '<path d="M256 392s96-100 96-172a96 96 0 0 0-192 0c0 72 96 172 96 172Z"/><path d="m270 155-54 80h45l-10 55 58-87h-46Z" fill="white" stroke="none"/><path d="M112 186h28M96 232h48M120 278h32" stroke="#168FE5"/>' },
};
for (const [name, item] of Object.entries(shapes)) {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${item.label}"><rect width="512" height="512" rx="112" fill="${item.color}"/><g fill="none" stroke="white" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">${item.paths}</g></svg>`;
  await writeFile(`${output}${name}.svg`, source);
  for (const size of [192, 512]) await sharp(Buffer.from(source)).resize(size, size).png().toFile(`${output}${name}-${size}.png`);
  // Full opaque square; all artwork stays inside the maskable 80% safe circle.
  const maskable = source.replace('rx="112"', 'rx="0"').replace('<g fill=', '<g transform="translate(40 40) scale(.84375)" fill=');
  await writeFile(`${output}${name}-maskable.svg`, maskable);
  await sharp(Buffer.from(maskable)).png().toFile(`${output}${name}-maskable-512.png`);
  if (name === 'driver') for (const size of [192,512]) await sharp(Buffer.from(source)).resize(size,size).png().toFile(`${output}../driver-icon-${size}.png`);
  if (name === 'panel') {
    await writeFile(`${output}../favicon.svg`, source);
    await sharp(Buffer.from(source)).resize(32,32).png().toFile(`${output}../favicon-32.png`);
  }
}
