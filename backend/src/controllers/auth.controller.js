// backend/src/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || 'secreto123';

let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch {}

/**
 * Servicio que ya tienes para componer los permisos del usuario.
 * Debe devolver un array de strings.
 */
const { getPermisosDeUsuario } = require('../services/permisos.service');

async function login(req, res) {
  try {
    const { usuario, contrasena } = req.body;

    if (!prisma) return res.status(500).json({ mensaje: 'BD no disponible' });
    if (!usuario || !contrasena) {
      return res.status(400).json({ mensaje: 'Usuario y contraseña requeridos' });
    }

    // 1) Buscar usuario + rol
    const u = await prisma.usuario.findFirst({
      where: { usuario },
      include: { rol: true },
    });
    if (!u) return res.status(400).json({ mensaje: 'Usuario o contraseña inválidos' });

    // 2) Validar contraseña
    const ok = await bcrypt.compare(contrasena, u.passwordHash);
    if (!ok) return res.status(400).json({ mensaje: 'Usuario o contraseña inválidos' });

    // 3) Forzar cambio de contraseña (si aplica)
    if (u.debeCambiarPassword) {
      return res.status(403).json({
        code: 'FIRST_CHANGE_REQUIRED',
        mensaje: 'Debes cambiar tu contraseña',
        usuario: { id: u.id, usuario: u.usuario },
      });
    }

    // 4) Obtener permisos (por usuario/rol) en UNA llamada
    const permisos = await getPermisosDeUsuario(u.id); // => ['ver:dashboard', 'crear:residuos', ...]

    // 5) Firmar token con claims ÚTILES (incluye permisos)
    const token = jwt.sign(
      {
        id: u.id,
        usuario: u.usuario,
        rol: u.rol?.nombre || null,
        rolId: u.rolId || null,
        permisos, // <— clave para evitar la llamada extra al entrar
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // 6) Responder TODO lo necesario para entrar de inmediato
    return res.json({
      ok: true,
      token,
      usuario: {
        id: u.id,
        usuario: u.usuario,
        nombre: u.nombre || null,
        rol: u.rol?.nombre || null,
        rolId: u.rolId || null,
      },
      permisos, // <— el frontend puede usarlos al instante
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ mensaje: 'Error interno' });
  }
}

module.exports = { login };
