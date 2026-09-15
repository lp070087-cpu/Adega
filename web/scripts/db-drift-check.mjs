/**
 * ═══════════════════════════════════════════════════════════════════════
 * db-drift-check — o que o banco TEM × o que o schema EXIGE
 * -----------------------------------------------------------------------
 * Somente LEITURA. Não cria, não altera, não apaga nada.
 *
 * Existe porque `prisma migrate status` respondeu "Database schema is up
 * to date!" enquanto o banco não tinha User.username — ele só olha o
 * histórico de migrations (que está vazio), nunca a estrutura real.
 *
 * Este script olha a estrutura real: lê os modelos e campos de
 * prisma/schema.prisma, consulta information_schema no banco e imprime o
 * que está faltando, tabela por tabela.
 *
 * USO (Windows, dentro da pasta web/):
 *
 *   node scripts/db-drift-check.mjs
 *
 * Sai com código 1 se houver divergência, 0 se o banco estiver alinhado —
 * então dá para usar em CI depois.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'prisma', 'schema.prisma');

/**
 * Lê o schema e devolve { Modelo: { tabela, colunas: [...] } }.
 *
 * Parser deliberadamente simples: linha por linha, sem dependência nova.
 * Ele entende o subconjunto de Prisma que este projeto usa — não tenta ser
 * um parser completo da linguagem.
 *
 * A regra que evita o erro clássico deste tipo de script: em Prisma, a
 * coluna de chave estrangeira é SEMPRE declarada como campo próprio
 * (`organizationId String`), e o campo de relação
 * (`organization Organization @relation(fields: [organizationId])`) é o
 * lado VIRTUAL — que não existe no banco.
 *
 * Exemplo concreto do engano fácil: em Order existem os dois campos abaixo,
 * e só o primeiro é coluna:
 *
 *     organizationId String
 *     organization   Organization @relation(fields: [organizationId], ...)
 *
 * Então: campo cujo TIPO é o nome de outro modelo é sempre virtual e é
 * descartado — inclusive quando ele carrega `@relation(fields: [...])`.
 *
 * Por isso a leitura é em duas passadas: a primeira só coleta os nomes dos
 * modelos, para que a segunda saiba distinguir "tipo que é modelo" (virtual)
 * de "tipo que é enum" (enum também começa com maiúscula, mas É coluna).
 */
function parseSchema(text) {
  // ── Passada 1: nomes de todos os modelos ──────────────────────────────
  const nomesDeModelos = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const m = /^model\s+(\w+)\s*\{/.exec(rawLine.trim());
    if (m) nomesDeModelos.add(m[1]);
  }

  // ── Passada 2: campos de cada modelo ──────────────────────────────────
  const models = {};
  let current = null;
  let inBlock = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    const modelMatch = /^model\s+(\w+)\s*\{/.exec(line);
    if (modelMatch) {
      current = { tabela: modelMatch[1], colunas: [], campos: [] };
      models[modelMatch[1]] = current;
      inBlock = true;
      continue;
    }

    // `}` fecha. Ignora o fechamento de generator/datasource (current null).
    if (inBlock && line.startsWith('}')) {
      inBlock = false;
      current = null;
      continue;
    }

    if (!inBlock || !current) continue;

    // Comentário de linha inteira: fora.
    if (line.startsWith('//') || line.startsWith('///')) continue;

    // Bloco de atributos (@@id, @@index, @@unique, @@map): fora do escopo.
    if (line.startsWith('@@')) {
      // @@map renomeia a tabela — respeitar, senão o script procura o nome
      // errado em information_schema.
      const map = /^@@map\(\s*"([^"]+)"\s*\)/.exec(line);
      if (map) current.tabela = map[1];
      continue;
    }

    const fieldMatch = /^(\w+)\s+([\w\[\]?]+)/.exec(line);
    if (!fieldMatch) continue;

    const [, nome, tipoBruto] = fieldMatch;

    // Lista (`users OrganizationUser[]`) nunca é coluna.
    if (tipoBruto.endsWith('[]')) continue;

    const tipo = tipoBruto.replace(/\?$/, '');

    // Tipo que é um modelo = lado virtual da relação (mesmo carregando
    // `@relation(fields: [...])`). A coluna real é declarada à parte, com o
    // nome dela própria (`organizationId String`) e já entrou na lista
    // quando essa linha foi lida.
    if (nomesDeModelos.has(tipo)) continue;

    // Todo o resto é coluna: escalares (String, Int, DateTime, Json, Float,
    // Decimal, Boolean) e enums em maiúscula.
    current.colunas.push(nome);
    current.campos.push({ nome, tipo });
  }

  return models;
}

async function main() {
  const text = readFileSync(schemaPath, 'utf8');
  const models = parseSchema(text);
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;

    /** @type {Map<string, Set<string>>} */
    const db = new Map();
    for (const r of rows) {
      const t = String(r.table_name);
      if (!db.has(t)) db.set(t, new Set());
      db.get(t).add(String(r.column_name));
    }

    const tabelasFaltando = [];
    const colunasFaltando = [];

    for (const [nomeModelo, def] of Object.entries(models)) {
      const existentes = db.get(def.tabela);
      if (!existentes) {
        tabelasFaltando.push(`${nomeModelo} (tabela "${def.tabela}")`);
        continue;
      }
      for (const coluna of def.colunas) {
        if (!existentes.has(coluna)) {
          colunasFaltando.push(`${nomeModelo}.${coluna}  →  ${def.tabela}."${coluna}"`);
        }
      }
    }

    console.log('');
    console.log('══ DIVERGÊNCIA BANCO × SCHEMA.PRISMA ═════════════════════════');
    console.log(`Modelos no schema : ${Object.keys(models).length}`);
    console.log(`Tabelas no banco  : ${db.size}`);
    console.log('');

    if (tabelasFaltando.length === 0 && colunasFaltando.length === 0) {
      console.log('✔ Nenhuma divergência: toda tabela e toda coluna do schema existem no banco.');
      console.log('');
      process.exitCode = 0;
      return;
    }

    if (tabelasFaltando.length > 0) {
      console.log(`TABELAS AUSENTES (${tabelasFaltando.length}):`);
      for (const t of tabelasFaltando) console.log(`  · ${t}`);
      console.log('');
    }

    if (colunasFaltando.length > 0) {
      console.log(`COLUNAS AUSENTES (${colunasFaltando.length}):`);
      for (const c of colunasFaltando) console.log(`  · ${c}`);
      console.log('');
    }

    console.log('COMO CORRIGIR (aditivo, sem apagar dados):');
    console.log('  npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/phase3-align.sql');
    console.log('  npx prisma db push      # alternativa: aplica só o que falta');
    console.log('  npx prisma generate');
    console.log('');
    console.log('DEPOIS, confirme que zerou:');
    console.log('  node scripts/db-drift-check.mjs');
    console.log('');

    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('');
  console.error('Falha ao checar divergência:', error?.message ?? error);
  console.error('');
  process.exitCode = 1;
});
