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
 await db.exec(readFileSync(new URL('../prisma/migrations/20261021210000_driver_applications/migration.sql',import.meta.url),'utf8'));
 assert.equal((await db.query(`SELECT count(*)::int AS total FROM "Driver" WHERE id='legacy'`)).rows[0].total,1);
 await db.exec(`INSERT INTO "Driver" VALUES ('other-store','two','user');`);
 await assert.rejects(db.exec(`INSERT INTO "Driver" VALUES ('duplicate','one','user');`));
 const inserted=await db.query(`INSERT INTO "DriverRegistrationLink"(id,"organizationId",slug) VALUES ('link-one','one','same-name'),('link-two','two','same-name') RETURNING "number"`);
 assert.equal(new Set(inserted.rows.map(row=>row.number)).size,2);
 await assert.rejects(db.exec(`INSERT INTO "DriverRegistrationLink"(id,"organizationId",slug) VALUES ('duplicate-link','one','other-name');`));
 await assert.rejects(db.exec(`INSERT INTO "DriverApplication"(id,"organizationId","userId",status,"updatedAt") VALUES ('bad','one','user','OWNER',NOW());`));
 await db.exec(`INSERT INTO "DriverApplication"(id,"organizationId","userId","updatedAt") VALUES ('application','one','user',NOW());`);
 await assert.rejects(db.exec(`INSERT INTO "DriverApplication"(id,"organizationId","userId","updatedAt") VALUES ('duplicate','one','user',NOW());`));
 await db.exec(`INSERT INTO "DriverApplicationEvent"(id,"applicationId","actorId",status,reason) VALUES ('event','application','user','PENDING','Solicitação isolada');`);
 await assert.rejects(db.exec(`DELETE FROM "DriverApplication" WHERE id='application';`));
 console.log('Migração aprovada em PostgreSQL isolado: perfil legado preservado, identidade em duas lojas, unicidade por organização, sequência global, status e histórico protegidos. Nenhuma conexão externa utilizada.');
}finally{await db.close();}
