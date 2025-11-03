// backend/src/services/permisos.service.js
let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (_) {
  // si aún no tienes prisma configurado, seguimos con fallback
}

/**
 * Devuelve array de strings con permisos del usuario.
 * Si Prisma no está disponible o no hay datos, usa fallback.
 */
async function getPermisosDeUsuario(userId) {
  if (prisma) {
    try {
      const u = await prisma.usuario.findUnique({
        where: { id: userId },
        select: {
          rol: {
            select: {
              nombre: true,
              permisos: { select: { codigo: true } }, // ej. 'USUARIOS_VER'
            },
          },
        },
      });
      const list = u?.rol?.permisos?.map(p => p.codigo) || [];
      return Array.from(new Set(list));
    } catch {
      // cae a fallback
    }
  }
  // 🔰 Fallback temporal para que pruebes hoy:
  return ['USUARIOS_VER', 'ROLES_VER'];
}

module.exports = { getPermisosDeUsuario };
