// Isolated PostgreSQL in memory. Never receives a connection URL or reads .env.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const packagePath=process.argv[2];
if(!packagePath)throw Error('Informe apenas o caminho local do pacote PGlite de testes.');
const {PGlite}=createRequire(import.meta.url)(packagePath);
const db=new PGlite();
try{
 await db.exec(`CREATE TABLE "Organization"(id TEXT PRIMARY KEY);CREATE TABLE "User"(id TEXT PRIMARY KEY);
 CREATE TABLE "Driver"(id TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL REFERENCES "Organization"(id),"userId" TEXT REFERENCES "User"(id));
 CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");
 INSERT INTO "Organization" VALUES ('one'),('two');INSERT INTO "User" VALUES ('user');INSERT INTO "Driver" VALUES ('legacy','one','user');`);
 await db.exec(readFileSync(new URL('../prisma/migrations/20261023090000_driver_multistore/migration.sql',import.meta.url),'utf8'));
 assert.equal((await db.query(`SELECT count(*)::int AS total FROM "Driver" WHERE id='legacy'`)).rows[0].total,1);
 await db.exec(`INSERT INTO "Driver" VALUES ('other-store','two','user');`);
 await assert.rejects(db.exec(`INSERT INTO "Driver" VALUES ('duplicate','one','user');`));
 await db.exec(`INSERT INTO "Driver" VALUES ('unlinked-a','one',NULL),('unlinked-b','one',NULL);`);
 console.log('Migração aprovada em PostgreSQL isolado: perfil legado preservado, mesma conta em duas lojas, unicidade por loja e perfis sem conta preservados. Nenhuma conexão externa utilizada.');
}finally{await db.close();}
