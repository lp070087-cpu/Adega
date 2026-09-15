/* ═══════════════════════════════════════════════════════════════════════
 * ⚠️  APAGUE ESTE ARQUIVO — ELE É UMA DUPLICATA
 * -----------------------------------------------------------------------
 * O middleware de verdade está em `web/src/middleware.ts`.
 *
 * POR QUE: este projeto usa o diretório `src/`. Com `src/`, o Next procura
 * o middleware em `src/middleware.ts`. Um arquivo na raiz de `web/` é
 * ignorado — e, se os dois existirem ao mesmo tempo, o build acusa
 * "Both middleware file and src/middleware are detected".
 *
 * Ou seja: este arquivo aqui não protege nada. Ele só atrapalha.
 *
 * COMO RESOLVER (uma linha, na pasta `web/`):
 *
 *     Windows (PowerShell):  Remove-Item middleware.ts
 *     Linux/macOS:           rm middleware.ts
 *
 * Feito isso, `npm run build` segue normalmente. Nada mais depende dele.
 * ═══════════════════════════════════════════════════════════════════════ */

export {};
