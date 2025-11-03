/* =======================
   1) Ajuste índice Bolsa
   ======================= */
-- Si existía el único antiguo por (color, tamano), elimínalo
DROP INDEX IF EXISTS "public"."Bolsa_color_tamano_key";

/* ======================================
   2) slug en TipoDesecho (en 3 movimientos)
   ====================================== */
-- 2.1 Agregar slug como NULLABLE (para no romper filas existentes)
ALTER TABLE "public"."TipoDesecho" ADD COLUMN IF NOT EXISTS "slug" CITEXT;

-- 2.2 Poblar slug para filas ya existentes
UPDATE "public"."TipoDesecho"
SET "slug" = CASE lower(nombre)
  WHEN 'desecho común'            THEN 'COMUN'
  WHEN 'desechos comunes'         THEN 'COMUN'
  WHEN 'desechos especiales'      THEN 'ESPECIALES'
  WHEN 'desechos infecciosos'     THEN 'INFECCIOSOS'
  WHEN 'desechos patológicos'     THEN 'PATOLOGICOS'
  WHEN 'desechos punzocortantes'  THEN 'PUNZOCORTANTES'
  ELSE regexp_replace(upper(nombre), '[^A-Z0-9]+', '_', 'g')
END
WHERE "slug" IS NULL;

-- 2.3 Volver slug NOT NULL + UNIQUE
ALTER TABLE "public"."TipoDesecho" ALTER COLUMN "slug" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'TipoDesecho_slug_key'
  ) THEN
    CREATE UNIQUE INDEX "TipoDesecho_slug_key" ON "public"."TipoDesecho" ("slug");
  END IF;
END $$;

/* ===========================================
   3) Tabla puente AreaTipoDesecho (M:N control)
   =========================================== */
CREATE TABLE IF NOT EXISTS "public"."AreaTipoDesecho" (
  "areaId"        INTEGER NOT NULL,
  "tipoDesechoId" INTEGER NOT NULL,
  "activo"        BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AreaTipoDesecho_pkey" PRIMARY KEY ("areaId","tipoDesechoId")
);

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AreaTipoDesecho_areaId_fkey'
  ) THEN
    ALTER TABLE "public"."AreaTipoDesecho"
      ADD CONSTRAINT "AreaTipoDesecho_areaId_fkey"
      FOREIGN KEY ("areaId") REFERENCES "public"."Area"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AreaTipoDesecho_tipoDesechoId_fkey'
  ) THEN
    ALTER TABLE "public"."AreaTipoDesecho"
      ADD CONSTRAINT "AreaTipoDesecho_tipoDesechoId_fkey"
      FOREIGN KEY ("tipoDesechoId") REFERENCES "public"."TipoDesecho"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Índices útiles
CREATE INDEX IF NOT EXISTS "AreaTipoDesecho_tipoDesechoId_idx"
  ON "public"."AreaTipoDesecho"("tipoDesechoId");
CREATE INDEX IF NOT EXISTS "AreaTipoDesecho_areaId_activo_idx"
  ON "public"."AreaTipoDesecho"("areaId","activo");
CREATE INDEX IF NOT EXISTS "AreaTipoDesecho_tipoDesechoId_activo_idx"
  ON "public"."AreaTipoDesecho"("tipoDesechoId","activo");

/* =========================================================
   4) Nuevo UNIQUE de Bolsa por (tipoDesechoId, color, tamano)
   ========================================================= */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'Bolsa_tipoDesechoId_color_tamano_key'
  ) THEN
    CREATE UNIQUE INDEX "Bolsa_tipoDesechoId_color_tamano_key"
      ON "public"."Bolsa" ("tipoDesechoId","color","tamano");
  END IF;
END $$;

/* =====================================================
   5) (Opcional) Sembrar todas las combinaciones área–tipo
   ===================================================== */
INSERT INTO "public"."AreaTipoDesecho" ("areaId","tipoDesechoId","activo")
SELECT a.id, t.id, TRUE
FROM "public"."Area" a
CROSS JOIN "public"."TipoDesecho" t
WHERE a.estado = TRUE AND t.estado = TRUE
ON CONFLICT DO NOTHING;
