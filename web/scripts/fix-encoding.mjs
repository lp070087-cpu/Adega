#!/usr/bin/env node
/**
 * fix-encoding.mjs — repara mojibake nos arquivos-fonte do painel.
 *
 * SINTOMA
 *   Texto que era UTF-8 e passou por um pipeline que o leu/gravou como CP1252.
 *   O resultado na tela é "VocÃª" no lugar de "Você" e "â€”" no lugar de "—".
 *
 * POR QUE A CORREÇÃO É POR LINHA, E NÃO DO ARQUIVO INTEIRO
 *   Vários arquivos estão MISTOS: trechos antigos corrompidos convivem, no
 *   mesmo arquivo, com trechos novos em UTF-8 correto. Converter o arquivo
 *   inteiro de uma vez estragaria o que já está bom. Por isso a decisão de
 *   corrigir ou não é tomada linha a linha.
 *
 * COMO CADA LINHA É DECIDIDA
 *   1. Todo caractere da linha é mapeado de volta para 1 byte CP1252.
 *      Se algum caractere não existe em CP1252 (ex.: "é", "ç"), a linha tem
 *      texto de verdade e é devolvida intacta. É o que protege o que já está certo.
 *   2. Os bytes são lidos como UTF-8.
 *      Se aparecer o caractere de substituição (U+FFFD), os bytes não formam
 *      UTF-8 válido → a linha não era mojibake → devolvida intacta.
 *   3. Só quando os dois testes passam a linha é considerada corrompida.
 *
 * SEPARADORES DECORATIVOS
 *   As antigas molduras "────" / "════" em comentários perderam bytes no
 *   caminho e não voltam por reversão. Elas são normalizadas para uma régua
 *   de "-", que cumpre o mesmo papel visual. Só linhas com marcador de
 *   mojibake são tocadas; régua já correta fica como está.
 *
 * SEGURANÇA
 *   - Não cria nem apaga arquivo. Só reescreve o conteúdo, e só se ele mudou.
 *   - Rode --check antes. Confira com `git diff`. Se não gostar: `git checkout`.
 *
 * USO
 *   node scripts/fix-encoding.mjs --check      # mostra o que mudaria (não grava)
 *   node scripts/fix-encoding.mjs --write      # aplica
 *   node scripts/fix-encoding.mjs --selftest   # prova o algoritmo com casos fixos
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // .../web
const SCAN_DIR = join(ROOT, 'src');
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

/**
 * Bytes 0x80–0x9F que o CP1252 define. O resto dessa faixa não tem glifo e,
 * por não ter voltado no arquivo, não precisa de entrada aqui.
 */
const CP1252_HIGH = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š',
  0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
  0x9E: 'ž', 0x9F: 'Ÿ',
};
const CHAR_TO_HIGH_BYTE = new Map(
  Object.entries(CP1252_HIGH).map(([byte, ch]) => [ch, Number(byte)]),
);

/** Byte CP1252 do caractere, ou -1 se ele não existe nessa tabela. */
function cp1252Byte(ch) {
  const code = ch.codePointAt(0);
  if (code <= 0xff) return code;
  return CHAR_TO_HIGH_BYTE.get(ch) ?? -1;
}

/** Repara UMA linha. Linha que não é mojibake volta idêntica. */
function repairLine(line) {
  if (line === '') return line;

  const bytes = [];
  for (const ch of line) {
    const b = cp1252Byte(ch);
    if (b < 0) return line; // tem carácter de verdade → não é mojibake
    bytes.push(b);
  }

  const decoded = Buffer.from(bytes).toString('utf8');
  if (decoded.includes('�')) return line; // bytes não formam UTF-8 → texto real
  return decoded;
}

/** Marcador de mojibake: aparece só em linha corrompida. */
const MOJIBAKE_MARK = /[ÂÃâðï]/;
/** Régua decorativa (a original era ───/═══; a corrompida é sopa desses). */
const DECOR_RUN = /[─═━█▀▄│┃┌┐└┘├┤┬┴┼—–•·ÂÃâ”“‘’ï¸ðŸ]{8,}/g;

function normalizeDecoration(line) {
  return line.replace(DECOR_RUN, (run) =>
    MOJIBAKE_MARK.test(run) ? '-'.repeat(70) : run,
  );
}

function repairContent(text) {
  return text
    .split('\n')
    .map((line) => normalizeDecoration(repairLine(line)))
    .join('\n');
}

/** Varre src/ e devolve os arquivos que mudariam. */
function scan(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      scan(full, out);
      continue;
    }
    if (!EXTS.has(extname(entry))) continue;

    const original = readFileSync(full, 'utf8');
    const fixed = repairContent(original);
    if (fixed !== original) out.push({ file: full, original, fixed });
  }
  return out;
}

function selftest() {
  const cases = [
    ['O banner Ã© uma IMAGEM', 'O banner é uma IMAGEM'],
    ['VocÃª nÃ£o cadastrou', 'Você não cadastrou'],
    ['Os padrÃµes da plataforma', 'Os padrões da plataforma'],
    ['segmento â€” o lojista', 'segmento — o lojista'],
    ['marca Â· item', 'marca · item'],
    ['produto Ãºnico', 'produto único'],
    ['AÃ§Ãµes de uma linha', 'Ações de uma linha'],
    ['não é possível', 'não é possível'],
    ['  const x = 1;', '  const x = 1;'],
    ['Relatórios', 'Relatórios'],
  ];

  let failed = 0;
  for (const [input, expected] of cases) {
    const got = repairLine(input);
    const ok = got === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FALHA'} | ${JSON.stringify(input)} -> ${JSON.stringify(got)}`);
  }

  const deco = normalizeDecoration(' * â•â•â•â•â•â•â•â•â•');
  const decoOk = deco.startsWith(' * ---');
  if (!decoOk) failed += 1;
  console.log(`${decoOk ? 'ok  ' : 'FALHA'} | régua decorativa -> ${JSON.stringify(deco.slice(0, 12))}`);

  console.log(failed === 0 ? '\nselftest: tudo passou' : `\nselftest: ${failed} falha(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

function main() {
  const mode = process.argv[2] ?? '--check';

  if (mode === '--selftest') return selftest();

  if (mode !== '--check' && mode !== '--write') {
    console.error('uso: node scripts/fix-encoding.mjs [--check|--write|--selftest]');
    process.exit(2);
  }

  const changed = scan(SCAN_DIR);
  const total = changed.reduce((acc, c) => {
    const before = c.original.split('\n');
    const after = c.fixed.split('\n');
    let n = 0;
    for (let i = 0; i < before.length; i += 1) if (before[i] !== after[i]) n += 1;
    return acc + n;
  }, 0);

  if (changed.length === 0) {
    console.log('Nada a corrigir: nenhum arquivo com mojibake em src/.');
    return;
  }

  for (const { file } of changed) {
    console.log(`${mode === '--write' ? 'corrigido' : 'mudaria  '}  ${relative(ROOT, file)}`);
  }
  console.log(`\n${changed.length} arquivo(s), ${total} linha(s).`);

  if (mode === '--write') {
    for (const { file, fixed } of changed) writeFileSync(file, fixed, 'utf8');
    console.log('Gravado. Confira com `git diff`. Para desfazer: `git checkout -- src`.');
  } else {
    console.log('Nada foi gravado. Para aplicar: node scripts/fix-encoding.mjs --write');
  }
}

main();
