-- Habilitar citext (tanto en la DB real como en la shadow DB)
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- AlterTable
ALTER TABLE "public"."Permiso"
  ALTER COLUMN "nombre" TYPE CITEXT USING "nombre"::citext;

-- AlterTable
ALTER TABLE "public"."Rol"
  ALTER COLUMN "nombre" TYPE CITEXT USING "nombre"::citext;

-- AlterTable
ALTER TABLE "public"."Usuario"
  ALTER COLUMN "usuario" TYPE CITEXT USING "usuario"::citext,
  ALTER COLUMN "correo"  TYPE CITEXT USING "correo"::citext;

-- CreateIndex
CREATE INDEX "Usuario_estado_idx" ON "public"."Usuario"("estado");
