-- CreateEnum
CREATE TYPE "public"."RegistroEstado" AS ENUM ('BORRADOR', 'CERRADO');

-- DropForeignKey
ALTER TABLE "public"."RegistroLinea" DROP CONSTRAINT "RegistroLinea_etiquetaId_fkey";

-- AlterTable
ALTER TABLE "public"."RegistroDiario" ADD COLUMN     "cerradoEn" TIMESTAMP(3),
ADD COLUMN     "estado" "public"."RegistroEstado" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN     "modoEntrada" TEXT;

-- AlterTable
ALTER TABLE "public"."RegistroLinea" ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "etiquetaId" DROP NOT NULL,
ALTER COLUMN "pesoLb" SET DATA TYPE DECIMAL(10,3);

-- CreateIndex
CREATE INDEX "RegistroDiario_estado_idx" ON "public"."RegistroDiario"("estado");

-- CreateIndex
CREATE INDEX "RegistroLinea_hora_idx" ON "public"."RegistroLinea"("hora");

-- AddForeignKey
ALTER TABLE "public"."RegistroLinea" ADD CONSTRAINT "RegistroLinea_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "public"."EtiquetaQR"("id") ON DELETE SET NULL ON UPDATE CASCADE;
