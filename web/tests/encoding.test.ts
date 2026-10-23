import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Double-encoded UTF-8 (read as Windows-1252 and saved again) shows up as "Ã§", "Ã£", "â€”"…
const MOJIBAKE = /Ã[\u0080-¿¡-ÿ]|â€[\u0080-¿‘-›™œ]?|Â[\u0080-¿]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css|js|json|webmanifest)$/.test(name) ? [path] : [];
  });
}

test('no source file contains mojibake, a BOM or the replacement character', () => {
  const offenders: string[] = [];
  for (const file of [...files('src'), 'public/manifest.webmanifest']) {
    const raw = readFileSync(file);
    if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) offenders.push(`${file}: BOM`);
    const text = raw.toString('utf8');
    if (text.includes('�')) offenders.push(`${file}: caractere inválido`);
    text.split('\n').forEach((line, i) => { if (MOJIBAKE.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 60)}`); });
  }
  assert.deepEqual(offenders, []);
});
