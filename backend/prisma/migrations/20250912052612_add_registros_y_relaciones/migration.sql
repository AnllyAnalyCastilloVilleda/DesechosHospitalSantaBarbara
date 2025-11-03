-- AlterTable
ALTER TABLE "public"."Bolsa" ADD COLUMN     "tipoDesechoId" INTEGER;

-- AlterTable
ALTER TABLE "public"."EtiquetaQR" ADD COLUMN     "usadoPorId" INTEGER;

-- CreateTable
CREATE TABLE "public"."RegistroDiario" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsableId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroDiario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RegistroLinea" (
    "id" SERIAL NOT NULL,
    "registroId" INTEGER NOT NULL,
    "etiquetaId" INTEGER NOT NULL,
    "areaId" INTEGER NOT NULL,
    "bolsaId" INTEGER NOT NULL,
    "tipoDesechoId" INTEGER NOT NULL,
    "pesoKg" DECIMAL(8,3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroDiario_fecha_idx" ON "public"."RegistroDiario"("fecha");

-- CreateIndex
CREATE INDEX "RegistroDiario_responsableId_idx" ON "public"."RegistroDiario"("responsableId");

-- CreateIndex
CREATE INDEX "RegistroLinea_registroId_idx" ON "public"."RegistroLinea"("registroId");

-- CreateIndex
CREATE INDEX "RegistroLinea_etiquetaId_idx" ON "public"."RegistroLinea"("etiquetaId");

-- CreateIndex
CREATE INDEX "RegistroLinea_areaId_idx" ON "public"."RegistroLinea"("areaId");

-- CreateIndex
CREATE INDEX "RegistroLinea_bolsaId_idx" ON "public"."RegistroLinea"("bolsaId");

-- CreateIndex
CREATE INDEX "RegistroLinea_tipoDesechoId_idx" ON "public"."RegistroLinea"("tipoDesechoId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroLinea_registroId_etiquetaId_key" ON "public"."RegistroLinea"("registroId", "etiquetaId");

-- CreateIndex
CREATE INDEX "Bolsa_tipoDesechoId_idx" ON "public"."Bolsa"("tipoDesechoId");

-- CreateIndex
CREATE INDEX "EtiquetaQR_usadoPorId_idx" ON "public"."EtiquetaQR"("usadoPorId");

-- AddForeignKey
ALTER TABLE "public"."Bolsa" ADD CONSTRAINT "Bolsa_tipoDesechoId_fkey" FOREIGN KEY ("tipoDesechoId") REFERENCES "public"."TipoDesecho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EtiquetaQR" ADD CONSTRAINT "EtiquetaQR_usadoPorId_fkey" FOREIGN KEY ("usadoPorId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RegistroDiario" ADD CONSTRAINT "RegistroDiario_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RegistroLinea" ADD CONSTRAINT "RegistroLinea_registroId_fkey" FOREIGN KEY ("registroId") REFERENCES "public"."RegistroDiario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RegistroLinea" ADD CONSTRAINT "RegistroLinea_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "public"."EtiquetaQR"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RegistroLinea" ADD CONSTRAINT "RegistroLinea_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "public"."Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RegistroLinea" ADD CONSTRAINT "RegistroLinea_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "public"."Bolsa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RegistroLinea" ADD CONSTRAINT "RegistroLinea_tipoDesechoId_fkey" FOREIGN KEY ("tipoDesechoId") REFERENCES "public"."TipoDesecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
