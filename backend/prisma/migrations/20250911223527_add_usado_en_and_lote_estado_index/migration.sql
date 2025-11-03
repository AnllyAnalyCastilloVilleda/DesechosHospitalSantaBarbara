-- AlterTable
ALTER TABLE "public"."EtiquetaQR" ADD COLUMN     "usadoEn" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EtiquetaQR_loteId_estado_idx" ON "public"."EtiquetaQR"("loteId", "estado");
