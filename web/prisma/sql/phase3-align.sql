-- ═══════════════════════════════════════════════════════════════════════════
-- ALINHAMENTO DO BANCO — FASE 3 (ADITIVO E NÃO DESTRUTIVO)
-- ---------------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO EXISTE
--
-- O banco do Neon foi criado com `prisma db push` e nunca teve histórico em
-- prisma/migrations. O schema.prisma andou para frente (Fase 3) e o banco
-- ficou para trás, porque o `db push` não foi rodado depois. Resultado real
-- observado no teste local:
--
--   • o código pede  User.username          → coluna não existe  (HTTP 500 em /cadastro)
--   • o código pede  Organization.deliveryFeeMode / latitude / longitude
--   • o código pede  a tabela DeliveryZone  (bairros + taxas)
--
-- Este arquivo adiciona APENAS o que falta. É ADITIVO por construção:
--
--   ✔ ADD COLUMN IF NOT EXISTS   → nunca derruba coluna nem apaga dado
--   ✔ CREATE TABLE IF NOT EXISTS → nunca recria tabela já existente
--   ✔ CREATE INDEX IF NOT EXISTS → nunca recria índice existente
--   ✔ CREATE TYPE dentro de DO   → só cria enum que ainda não existe
--   ✔ DROP NOT NULL              → só AFROUXA regra; nenhuma linha é tocada
--   ✔ ADD CONSTRAINT via pg_constraint → só cria FK que ainda não existe
--
-- O que este arquivo NÃO faz, em nenhuma hipótese:
--   DROP TABLE · DROP COLUMN · TRUNCATE · DELETE · UPDATE de dados
--   · migrate reset · db push --force-reset · criação de outro banco
--
-- COMO APLICAR — Windows, dentro da pasta web/
--
--   PASSO 1 (leitura, não altera nada) — ver o que falta:
--     npx prisma migrate diff ^
--       --from-url "%DATABASE_URL%" ^
--       --to-schema-datamodel prisma/schema.prisma ^
--       --script
--
--   PASSO 2 — aplicar somente o aditivo que falta:
--     npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/phase3-align.sql
--
--   PASSO 3 — conferir: a saída deve vir VAZIA (ou só com diferenças
--   cosméticas de nome de constraint). Vazio = banco idêntico ao schema.
--     npx prisma migrate diff ^
--       --from-url "%DATABASE_URL%" ^
--       --to-schema-datamodel prisma/schema.prisma ^
--       --script
--
--   PASSO 4 — cliente Prisma em dia:
--     npx prisma generate
--
-- Alternativa mais direta (o Prisma compara e aplica só o que falta, sem
-- apagar nada). Recusa qualquer operação destrutiva:
--
--     npx prisma db push
--
-- As duas rotas chegam ao mesmo lugar. O arquivo SQL existe porque ele é
-- explícito: dá para ler exatamente o que vai ser executado antes de rodar.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) User — login do entregador por nome de usuário (Fase 3, OPÇÃO B)
-- ───────────────────────────────────────────────────────────────────────────

-- A coluna que está causando o HTTP 500 em /cadastro.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;

-- Único GLOBALMENTE: é por ele que o login do entregador resolve o usuário
-- em /entregador sem e-mail. Criado só se faltar. Se já houver username
-- repetido gravado, a criação do índice FALHA DE PROPÓSITO — melhor falhar
-- aqui do que aceitar dois entregadores com o mesmo login.
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

-- E-mail passa a ser OPCIONAL: entregador criado com "login por usuário"
-- não tem e-mail, e a plataforma proíbe e-mail falso/inventado. Afrouxar
-- a regra não altera nenhuma linha existente.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) Organization — coordenadas do estabelecimento e modo de frete
-- ───────────────────────────────────────────────────────────────────────────

-- Coordenadas reais da loja. São ELAS (não o endereço em texto) que a
-- validação de área de entrega usa no servidor.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- Modo de cálculo do frete: FIXED | BY_NEIGHBORHOOD | BY_DISTANCE_BAND.
-- Texto (não enum), seguindo `theme`/`deliveryType`: acrescentar um modo
-- não deve exigir migração de enum. O DEFAULT 'FIXED' preenche as lojas
-- que já existem com o comportamento que elas já têm hoje.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "deliveryFeeMode" TEXT NOT NULL DEFAULT 'FIXED';


-- ───────────────────────────────────────────────────────────────────────────
-- 3) Enums da operação de entrega
--    CREATE TYPE não aceita IF NOT EXISTS, então cada um é guardado pela
--    consulta ao catálogo pg_type.
-- ───────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriverStatus') THEN
    CREATE TYPE "DriverStatus" AS ENUM ('OFFLINE', 'ONLINE', 'BUSY', 'RETURNING');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleType') THEN
    CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'CAR', 'BICYCLE', 'ON_FOOT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryStatus') THEN
    CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProofType') THEN
    CREATE TYPE "ProofType" AS ENUM ('NONE', 'PHOTO', 'SIGNATURE', 'CODE');
  END IF;
END $$;

-- Ordem dos pedidos (usada pelo filtro da expedição). Pode já existir.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'PREPARING', 'READY', 'WAITING_DRIVER', 'DISPATCHED', 'DELIVERED', 'CANCELLED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderSource') THEN
    CREATE TYPE "OrderSource" AS ENUM ('OWN_STORE', 'IFOOD', 'FOOD99', 'ZE_DELIVERY', 'WHATSAPP', 'COUNTER', 'MANUAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'ONLINE', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleType') THEN
    CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'CAR', 'BICYCLE', 'ON_FOOT');
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4) Driver — cadastro do entregador
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Driver" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT,
  "name"           TEXT NOT NULL,
  "phone"          TEXT NOT NULL,
  "vehicleType"    "VehicleType" NOT NULL DEFAULT 'MOTORCYCLE',
  "vehiclePlate"   TEXT,
  "status"         "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- Um usuário tem no máximo UM cadastro de entregador.
CREATE UNIQUE INDEX IF NOT EXISTS "Driver_userId_key" ON "Driver"("userId");
CREATE INDEX IF NOT EXISTS "Driver_organizationId_status_idx" ON "Driver"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Driver_organizationId_active_idx" ON "Driver"("organizationId", "active");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Driver_organizationId_fkey') THEN
    ALTER TABLE "Driver" ADD CONSTRAINT "Driver_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Driver_userId_fkey') THEN
    ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5) Order — vínculo com o entregador e coordenadas do destino
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "driverId"          TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryLatitude"  DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryLongitude" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "Order_organizationId_driverId_idx"
  ON "Order"("organizationId", "driverId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_driverId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6) DeliveryZone — bairros com taxa própria (modo BY_NEIGHBORHOOD)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DeliveryZone" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "fee"            DECIMAL(10,2) NOT NULL DEFAULT 0,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "distanceKm"     DOUBLE PRECISION,
  "latitude"       DOUBLE PRECISION,
  "longitude"      DOUBLE PRECISION,
  "position"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryZone_organizationId_name_key"
  ON "DeliveryZone"("organizationId", "name");

CREATE INDEX IF NOT EXISTS "DeliveryZone_organizationId_active_position_idx"
  ON "DeliveryZone"("organizationId", "active", "position");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryZone_organizationId_fkey') THEN
    ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 7) Delivery + DriverLocation — execução da entrega e rastro de posição
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Delivery" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "orderId"        TEXT NOT NULL,
  "driverId"       TEXT,
  "status"         "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "assignedAt"     TIMESTAMP(3),
  "pickedUpAt"     TIMESTAMP(3),
  "startedAt"      TIMESTAMP(3),
  "arrivedAt"      TIMESTAMP(3),
  "deliveredAt"    TIMESTAMP(3),
  "proofType"      "ProofType" NOT NULL DEFAULT 'NONE',
  "proofValue"     TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- Um pedido tem no máximo UMA entrega.
CREATE UNIQUE INDEX IF NOT EXISTS "Delivery_orderId_key" ON "Delivery"("orderId");
CREATE INDEX IF NOT EXISTS "Delivery_organizationId_status_idx" ON "Delivery"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Delivery_driverId_status_idx" ON "Delivery"("driverId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Delivery_organizationId_fkey') THEN
    ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Delivery_orderId_fkey') THEN
    ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Delivery_driverId_fkey') THEN
    ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Histórico de posições: a última linha é a posição atual do entregador.
CREATE TABLE IF NOT EXISTS "DriverLocation" (
  "id"        TEXT NOT NULL,
  "driverId"  TEXT NOT NULL,
  "latitude"  DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracy"  DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverLocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DriverLocation_driverId_createdAt_idx"
  ON "DriverLocation"("driverId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DriverLocation_driverId_fkey') THEN
    ALTER TABLE "DriverLocation" ADD CONSTRAINT "DriverLocation_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 8) BIBLIOTECA GLOBAL DE PRODUTOS — guarda de integridade
-- ---------------------------------------------------------------------------
-- Estes modelos são da PLATAFORMA e não têm organizationId (uma Coca-Cola
-- 350ml é a mesma em qualquer loja). Eles NÃO podem desaparecer: são a base
-- do catálogo global e da importação idempotente.
--
-- Diferente dos blocos acima, aqui NÃO há CREATE TABLE. Motivo: as colunas
-- incluem listas (`aliases`, `businessTypes`), e reescrevê-las à mão é
-- justamente onde um erro de digitação passaria silencioso. Em vez disso o
-- bloco abaixo CONFERE e ABORTA se a biblioteca não estiver no banco — o
-- que transforma uma falha confusa em runtime ("coluna não existe" no meio
-- de uma importação) numa mensagem clara e imediata.
--
-- Se o bloco abortar, a correção é uma só, e ela cria exatamente o que
-- falta sem apagar nada:
--
--     npx prisma db push
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  faltando TEXT[] := ARRAY[]::TEXT[];
  t        TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'GlobalCategory',
    'GlobalProduct',
    'GlobalProductBusinessType',
    'StoreBanner'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      faltando := array_append(faltando, t);
    END IF;
  END LOOP;

  IF array_length(faltando, 1) > 0 THEN
    RAISE EXCEPTION
      'BIBLIOTECA GLOBAL DE PRODUTOS incompleta no banco. Tabelas ausentes: %. Rode "npx prisma db push" (aplicação aditiva, sem apagar dados) e reaplique este arquivo.',
      array_to_string(faltando, ', ');
  END IF;

  RAISE NOTICE 'Biblioteca global de produtos: OK (GlobalCategory, GlobalProduct, GlobalProductBusinessType, StoreBanner presentes).';
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- FIM. Nenhuma linha existente foi alterada ou removida.
-- ───────────────────────────────────────────────────────────────────────────
