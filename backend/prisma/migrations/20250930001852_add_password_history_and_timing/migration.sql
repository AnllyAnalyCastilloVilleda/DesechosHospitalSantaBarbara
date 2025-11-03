-- AlterTable
ALTER TABLE "public"."Usuario" ADD COLUMN     "ultimoCambioContrasena" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."ContrasenaHistorial" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContrasenaHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContrasenaHistorial_usuarioId_creadoEn_idx" ON "public"."ContrasenaHistorial"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "Usuario_ultimoCambioContrasena_idx" ON "public"."Usuario"("ultimoCambioContrasena");

-- AddForeignKey
ALTER TABLE "public"."ContrasenaHistorial" ADD CONSTRAINT "ContrasenaHistorial_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "public"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
