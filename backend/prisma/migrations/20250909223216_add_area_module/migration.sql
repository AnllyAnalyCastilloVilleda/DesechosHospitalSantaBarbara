-- CreateTable
CREATE TABLE "public"."Area" (
    "id" SERIAL NOT NULL,
    "nombre" CITEXT NOT NULL,
    "descripcion" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Area_nombre_key" ON "public"."Area"("nombre");

-- CreateIndex
CREATE INDEX "Area_estado_idx" ON "public"."Area"("estado");

-- AddForeignKey
ALTER TABLE "public"."Area" ADD CONSTRAINT "Area_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
