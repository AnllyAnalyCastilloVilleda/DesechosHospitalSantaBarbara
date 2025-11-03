-- AlterTable
ALTER TABLE "public"."Usuario" ADD COLUMN     "ultimoEnvioRecuperacion" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "Usuario_ultimoEnvioRecuperacion_idx" ON "public"."Usuario"("ultimoEnvioRecuperacion");
