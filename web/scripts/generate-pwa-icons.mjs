import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../public/pwa/', import.meta.url));
await mkdir(output, { recursive: true });
const shapes = {
  panel: { color: '#17212F', label: 'Adega Gestão', paths: '<path d="M136 168h240v216H136zM112 168l32-64h224l32 64M160 240h64v144M264 240h80v72"/>' },
  customer: { color: '#F15A24', label: 'Loja', paths: '<path d="M152 176h208l24 224H128zM200 192v-48a56 56 0 0 1 112 0v48"/>' },
};
for (const [name, item] of Object.entries(shapes)) {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${item.label}"><rect width="512" height="512" rx="112" fill="${item.color}"/><g fill="none" stroke="white" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">${item.paths}</g></svg>`;
  await writeFile(`${output}${name}.svg`, source);
  for (const size of [192, 512]) await sharp(Buffer.from(source)).resize(size, size).png().toFile(`${output}${name}-${size}.png`);
}
