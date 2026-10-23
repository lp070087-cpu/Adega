import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Double-encoded UTF-8 (read as Windows-1252 and saved again): a typical lead
// byte (Â, Ã, â, ð) followed by what was a UTF-8 continuation byte. Catches
// "Ã§", "â€”", the box-drawing "â•" and broken emoji such as "ðŸ".
const CONTINUATION = '\\u0080-\\u00BF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC\\u2013\\u2014\\u2018-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122';
const MOJIBAKE = new RegExp(`[\\u00C2\\u00C3\\u00E2\\u00F0][${CONTINUATION}]`);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css|m?js|json|webmanifest|prisma|sql)$/.test(name) ? [path] : [];
  });
}

test('no source file contains mojibake, a BOM or the replacement character', () => {
  const offenders: string[] = [];
  for (const file of [...files('src'), ...files('prisma'), ...files('scripts').filter((file) => !file.endsWith('fix-encoding.mjs')), 'tailwind.config.ts', 'next.config.mjs', 'public/manifest.webmanifest']) {
    const raw = readFileSync(file);
    if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) offenders.push(`${file}: BOM`);
    const text = raw.toString('utf8');
    if (text.includes('�')) offenders.push(`${file}: caractere inválido`);
    text.split('\n').forEach((line, i) => { if (MOJIBAKE.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 60)}`); });
  }
  assert.deepEqual(offenders, []);
});
