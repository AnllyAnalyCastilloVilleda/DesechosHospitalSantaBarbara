-- AlterTable
ALTER TABLE "public"."Usuario" ALTER COLUMN "ultimoCambioContrasena" SET DATA TYPE TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "Usuario_debeCambiarPassword_idx" ON "public"."Usuario"("debeCambiarPassword");
