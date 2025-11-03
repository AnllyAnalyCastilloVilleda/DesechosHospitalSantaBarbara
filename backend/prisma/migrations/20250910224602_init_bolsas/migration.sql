-- CreateTable
CREATE TABLE "public"."Bolsa" (
    "id" SERIAL NOT NULL,
    "color" CITEXT NOT NULL,
    "tamano" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bolsa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bolsa_estado_idx" ON "public"."Bolsa"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Bolsa_color_tamano_key" ON "public"."Bolsa"("color", "tamano");

-- AddForeignKey
ALTER TABLE "public"."Bolsa" ADD CONSTRAINT "Bolsa_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
