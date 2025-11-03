-- DropIndex
DROP INDEX "public"."RegistroDiario_fecha_idx";

-- AlterTable
ALTER TABLE "public"."RegistroDiario" ADD COLUMN     "nota" TEXT,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "titulo" TEXT,
ADD COLUMN     "totalPesoLb" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "RegistroDiario_creadoEn_idx" ON "public"."RegistroDiario"("creadoEn");
