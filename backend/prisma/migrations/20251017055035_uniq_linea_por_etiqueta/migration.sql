/*
  Warnings:

  - A unique constraint covering the columns `[etiquetaId]` on the table `RegistroLinea` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "RegistroLinea_etiquetaId_key" ON "public"."RegistroLinea"("etiquetaId");
