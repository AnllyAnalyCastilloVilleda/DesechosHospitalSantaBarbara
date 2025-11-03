-- CreateTable
CREATE TABLE "public"."Rol" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Permiso" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PermisoPorRol" (
    "id" SERIAL NOT NULL,
    "permisoId" INTEGER NOT NULL,
    "rolId" INTEGER NOT NULL,

    CONSTRAINT "PermisoPorRol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "contrasena" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false,
    "rolId" INTEGER NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_key" ON "public"."Rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Permiso_nombre_key" ON "public"."Permiso"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoPorRol_permisoId_rolId_key" ON "public"."PermisoPorRol"("permisoId", "rolId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "public"."Usuario"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "public"."Usuario"("correo");

-- AddForeignKey
ALTER TABLE "public"."PermisoPorRol" ADD CONSTRAINT "PermisoPorRol_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "public"."Permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PermisoPorRol" ADD CONSTRAINT "PermisoPorRol_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "public"."Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "public"."Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
