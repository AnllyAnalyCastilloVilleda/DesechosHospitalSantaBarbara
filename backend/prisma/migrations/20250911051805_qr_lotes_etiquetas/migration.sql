-- CreateEnum
CREATE TYPE "public"."EstadoQR" AS ENUM ('ACTIVA', 'USADA', 'ANULADA');

-- CreateTable
CREATE TABLE "public"."LoteQR" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "bolsaId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "porHoja" INTEGER NOT NULL DEFAULT 4,
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoteQR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EtiquetaQR" (
    "id" SERIAL NOT NULL,
    "codigo" CITEXT NOT NULL,
    "loteId" INTEGER NOT NULL,
    "areaId" INTEGER NOT NULL,
    "bolsaId" INTEGER NOT NULL,
    "estado" "public"."EstadoQR" NOT NULL DEFAULT 'ACTIVA',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtiquetaQR_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoteQR_areaId_idx" ON "public"."LoteQR"("areaId");

-- CreateIndex
CREATE INDEX "LoteQR_bolsaId_idx" ON "public"."LoteQR"("bolsaId");

-- CreateIndex
CREATE UNIQUE INDEX "EtiquetaQR_codigo_key" ON "public"."EtiquetaQR"("codigo");

-- CreateIndex
CREATE INDEX "EtiquetaQR_loteId_idx" ON "public"."EtiquetaQR"("loteId");

-- CreateIndex
CREATE INDEX "EtiquetaQR_estado_idx" ON "public"."EtiquetaQR"("estado");

-- CreateIndex
CREATE INDEX "EtiquetaQR_areaId_bolsaId_idx" ON "public"."EtiquetaQR"("areaId", "bolsaId");

-- AddForeignKey
ALTER TABLE "public"."LoteQR" ADD CONSTRAINT "LoteQR_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoteQR" ADD CONSTRAINT "LoteQR_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "public"."Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoteQR" ADD CONSTRAINT "LoteQR_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "public"."Bolsa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EtiquetaQR" ADD CONSTRAINT "EtiquetaQR_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "public"."LoteQR"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EtiquetaQR" ADD CONSTRAINT "EtiquetaQR_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "public"."Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EtiquetaQR" ADD CONSTRAINT "EtiquetaQR_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "public"."Bolsa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
