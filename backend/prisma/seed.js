// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function hash(p) {
  return bcrypt.hash(p, 12);
}

/**
 * Catálogo de permisos (sin BALANZA).
 * El orden ayuda a mostrarlos “bonitos” en el front.
 */
const PERMISOS = [
  { nombre: 'USUARIOS',        descripcion: 'Gestionar usuarios' },
  { nombre: 'ROLES',           descripcion: 'Gestionar roles y permisos' },
  { nombre: 'AREAS',           descripcion: 'Ver y gestionar áreas' },
  { nombre: 'BOLSAS',          descripcion: 'Ver y gestionar bolsas' },
  { nombre: 'TIPOS_DESECHO',   descripcion: 'Gestionar tipos de desecho' },
  { nombre: 'REGISTRO_DIARIO', descripcion: 'Acceso al registro diario' },
  { nombre: 'CODIGOS_QR',      descripcion: 'Generar y leer códigos QR' },
  { nombre: 'ESTADISTICAS',    descripcion: 'Visualizar estadísticas' }, // al final
];

/** Utilidad: asignar permisos por nombre a un rol */
async function asignarPermisosPorNombre(rolId, nombres, mapPerm) {
  for (const nombre of nombres) {
    const permisoId = mapPerm[nombre];
    if (!permisoId) {
      console.warn(`⚠️  Permiso "${nombre}" no existe, se omite.`);
      continue;
    }
    await prisma.permisoPorRol.upsert({
      where: { permisoId_rolId: { permisoId, rolId } },
      update: {},
      create: { permisoId, rolId },
    });
  }
}

async function main() {
  // ---- Crear/actualizar permisos
  for (const p of PERMISOS) {
    await prisma.permiso.upsert({
      where:  { nombre: p.nombre },
      update: { descripcion: p.descripcion },
      create: { nombre: p.nombre, descripcion: p.descripcion },
    });
  }

  // ---- Roles base
  const superadmin = await prisma.rol.upsert({
    where: { nombre: 'Superadmin' },
    update: { activo: true, sistema: true }, // “blindado”
    create: { nombre: 'Superadmin', activo: true, sistema: true },
  });

  const admin = await prisma.rol.upsert({
    where: { nombre: 'Administrador' },
    update: { activo: true },
    create: { nombre: 'Administrador', activo: true },
  });

  const recolector = await prisma.rol.upsert({
    where: { nombre: 'Recolector' },
    update: { activo: true },
    create: { nombre: 'Recolector', activo: true },
  });

  const estadistico = await prisma.rol.upsert({
    where: { nombre: 'Estadístico' },
    update: { activo: true },
    create: { nombre: 'Estadístico', activo: true },
  });

  // ---- Vincular permisos
  const todosPermisos = await prisma.permiso.findMany();
  const mapPerm = Object.fromEntries(todosPermisos.map(p => [p.nombre, p.id]));

  // Superadmin -> TODOS
  await asignarPermisosPorNombre(superadmin.id, Object.keys(mapPerm), mapPerm);

  // Administrador -> TODOS (ajústalo si lo deseas)
  await asignarPermisosPorNombre(admin.id, Object.keys(mapPerm), mapPerm);

  // Recolector -> 5 por defecto
  await asignarPermisosPorNombre(
    recolector.id,
    ['AREAS', 'BOLSAS', 'TIPOS_DESECHO', 'REGISTRO_DIARIO', 'CODIGOS_QR'],
    mapPerm
  );

  // Estadístico -> solo ESTADISTICAS
  await asignarPermisosPorNombre(estadistico.id, ['ESTADISTICAS'], mapPerm);

  // ---- Usuario Superadmin (cambia la contraseña después)
  await prisma.usuario.upsert({
    where:  { usuario: 'superadmin' },
    update: {},
    create: {
      nombre: 'Super Usuario',
      usuario: 'superadmin',
      correo: 'superadmin@demo.com',
      contrasena: await hash('super123'),
      rolId: superadmin.id,
      estado: true,
      debeCambiarPassword: false,
    },
  });

  // ---- Usuario Admin por defecto
  await prisma.usuario.upsert({
    where:  { usuario: 'admin' },
    update: { estado: true, rolId: admin.id },
    create: {
      nombre: 'Administrador',
      usuario: 'admin',
      correo: 'admin@demo.com',
      contrasena: await hash('admin123'),
      rolId: admin.id,
      estado: true,
      debeCambiarPassword: false,
    },
  });

  console.log('✅ Seed ejecutado: Superadmin, Admin, Recolector (5 permisos) y Estadístico listos.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
