-- AlterTable
ALTER TABLE "public"."RegistroDiario" ADD COLUMN     "cerradoPorId" INTEGER;

-- CreateIndex
CREATE INDEX "RegistroDiario_cerradoPorId_idx" ON "public"."RegistroDiario"("cerradoPorId");

-- AddForeignKey
ALTER TABLE "public"."RegistroDiario" ADD CONSTRAINT "RegistroDiario_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
