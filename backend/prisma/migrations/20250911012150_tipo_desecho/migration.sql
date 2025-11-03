-- CreateTable
CREATE TABLE "public"."TipoDesecho" (
    "id" SERIAL NOT NULL,
    "nombre" CITEXT NOT NULL,
    "descripcion" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoDesecho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoDesecho_nombre_key" ON "public"."TipoDesecho"("nombre");

-- CreateIndex
CREATE INDEX "TipoDesecho_estado_idx" ON "public"."TipoDesecho"("estado");

-- AddForeignKey
ALTER TABLE "public"."TipoDesecho" ADD CONSTRAINT "TipoDesecho_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
