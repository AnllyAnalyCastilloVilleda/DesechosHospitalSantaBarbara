// src/routes/usuarios.js
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

module.exports = function usuariosRoutes(
  prisma,
  { auth, requirePerm, sendNewUserEmail, sendTempPasswordEmail }
) {
  const router = Router();

  /* ======= Políticas configurables ======= */
  const HISTORY_LIMIT = Number(process.env.PW_HISTORY_LIMIT || 5);         // últimas N contraseñas prohibidas
  const MIN_HOURS_BETWEEN_CHANGES = Number(process.env.PW_MIN_HOURS || 8); // ventana mínima (horas) entre cambios (usuario autenticado)
  const RECOVERY_MIN_HOURS = Number(process.env.PW_RECOVERY_MIN_HOURS || 8); // ventana mínima (horas) entre SOLICITUDES de recuperación
  const SALT_ROUNDS = Number(process.env.PW_SALT_ROUNDS || 12);
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

  // util temporal
  function randPass(len = 10) {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < len; i++) out += abc[Math.floor(Math.random() * abc.length)];
    return out;
  }

  function generarContrasenaTemporal(len = 12) {
    const bytes = crypto.randomBytes(32).toString('base64').replace(/[+=/]/g, '');
    return bytes.slice(0, len);
  }

  async function podarHistorialSiExcede(usuarioId) {
    const count = await prisma.contrasenaHistorial.count({ where: { usuarioId } });
    if (count > HISTORY_LIMIT) {
      const toDelete = await prisma.contrasenaHistorial.findMany({
        where: { usuarioId },
        orderBy: { creadoEn: 'desc' },
        skip: HISTORY_LIMIT
      });
      const ids = toDelete.map(x => x.id);
      if (ids.length) {
        await prisma.contrasenaHistorial.deleteMany({ where: { id: { in: ids } } });
      }
    }
  }

  function emitirToken(user) {
    // payload mínimo necesario (agrega lo que uses en el front)
    const payload = { id: user.id, usuario: user.usuario, rolId: user.rolId };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  function setRetryAfter(res, seconds) {
    if (Number.isFinite(seconds) && seconds > 0) {
      res.setHeader('Retry-After', String(Math.ceil(seconds)));
    }
  }

  function usuarioPublico(u) {
    return {
      id: u.id,
      nombre: u.nombre,
      usuario: u.usuario,
      correo: u.correo,
      rolId: u.rolId,
      rol: u.rol || null,
      estado: u.estado,
      debeCambiarPassword: !!u.debeCambiarPassword,
    };
  }

  /* =========================
   *  LOGIN (público) — SIN COOKIES
   * ========================= */
  router.post('/login', async (req, res) => {
    try {
      const { usuario, contrasena } = req.body || {};
      if (!usuario || !contrasena) {
        return res.status(400).json({ mensaje: 'Usuario y contraseña son requeridos.' });
      }

      const user = await prisma.usuario.findFirst({
        where: { usuario: String(usuario).trim(), estado: true },
        include: { rol: true },
      });

      if (!user || !user.contrasena) {
        return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
      }

      const ok = await bcrypt.compare(contrasena, user.contrasena);
      if (!ok) {
        return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
      }

      // Si debe cambiar password, no emitimos token normal
      if (user.debeCambiarPassword) {
        return res.status(403).json({
          code: 'FIRST_CHANGE_REQUIRED',
          mensaje: 'Debes cambiar tu contraseña antes de continuar.',
          usuario: usuarioPublico(user),
        });
      }

      const token = emitirToken(user);
      return res.json({ ok: true, token, usuario: usuarioPublico(user) });
    } catch (e) {
      console.error('POST /usuarios/login error:', e);
      return res.status(500).json({ mensaje: 'Error interno' });
    }
  });

  /* =========================
   *  ME (autenticado) — devuelve usuario actual
   * ========================= */
  router.get('/me', auth, async (req, res) => {
    try {
      const id = req.user?.id;
      const u = await prisma.usuario.findUnique({
        where: { id },
        include: { rol: true },
      });
      if (!u) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
      return res.json(usuarioPublico(u));
    } catch (e) {
      console.error('GET /usuarios/me error:', e);
      return res.status(500).json({ mensaje: 'Error interno' });
    }
  });

  // =========================
  // LISTAR (?q=&estado=activos|eliminados)
  // =========================
  router.get('/', auth, requirePerm('USUARIOS'), async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      const eliminados = (req.query.estado || 'activos') === 'eliminados';
      const where = {
        estado: eliminados ? false : true,
        ...(q && {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { usuario: { contains: q, mode: 'insensitive' } },
            { correo: { contains: q, mode: 'insensitive' } },
          ],
        }),
      };
      const usuarios = await prisma.usuario.findMany({
        where,
        include: { rol: true },
        orderBy: [{ rol: { nombre: 'asc' } }, { nombre: 'asc' }],
      });
      res.json(usuarios.map(usuarioPublico));
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // =========================
  // DISPONIBILIDAD (usuario/correo únicos)
  // =========================
  router.get('/existe', auth, requirePerm('USUARIOS'), async (req, res) => {
    try {
      const { usuario, correo, excludeId } = req.query || {};
      const exclude = excludeId ? Number(excludeId) : null;
      const u = usuario
        ? await prisma.usuario.findFirst({
            where: { usuario, ...(exclude ? { NOT: { id: exclude } } : {}) },
            select: { id: true },
          })
        : null;
      const c = correo
        ? await prisma.usuario.findFirst({
            where: { correo, ...(exclude ? { NOT: { id: exclude } } : {}) },
            select: { id: true },
          })
        : null;
      res.json({ usuarioOcupado: !!u, correoOcupado: !!c });
    } catch (e) {
      console.error(e);
      res.json({ usuarioOcupado: false, correoOcupado: false });
    }
  });

  // =========================
  // CREAR (temporal + correo)
  // =========================
  router.post('/', auth, requirePerm('USUARIOS'), async (req, res) => {
    const { nombre, usuario, correo, rolId } = req.body || {};
    if (!nombre || !usuario || !correo || !rolId)
      return res.status(400).json({ mensaje: 'Faltan campos' });

    const temp = randPass(10);
    const hash = await bcrypt.hash(temp, SALT_ROUNDS);
    try {
      const nuevo = await prisma.usuario.create({
        data: {
          nombre,
          usuario,
          correo,
          rolId: Number(rolId),
          contrasena: hash,
          debeCambiarPassword: true,
          estado: true,
          ultimoCambioContrasena: null,
          ultimoEnvioRecuperacion: null,
        },
        include: { rol: true },
      });

      await sendNewUserEmail({
        to: correo,
        nombre,
        usuario,
        tempPassword: temp,
        rolNombre: nuevo.rol?.nombre || 'Sin rol',
      });

      res.status(201).json(usuarioPublico(nuevo));
    } catch (e) {
      if (e?.code === 'P2002') {
        const field = e.meta?.target?.[0] || 'campo';
        return res.status(409).json({ mensaje: `El ${field} ya existe.` });
      }
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // =========================
  // EDITAR
  // =========================
  router.put('/:id', auth, requirePerm('USUARIOS'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { nombre, usuario, correo, rolId } = req.body || {};
      const upd = await prisma.usuario.update({
        where: { id },
        data: { nombre, usuario, correo, rolId: Number(rolId) },
        include: { rol: true },
      });
      res.json(usuarioPublico(upd));
    } catch (e) {
      if (e?.code === 'P2002') {
        const field = e.meta?.target?.[0] || 'campo';
        return res.status(409).json({ mensaje: `El ${field} ya existe.` });
      }
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // =========================
  // BAJA lógica o HARD (?hard=true)
  // =========================
  router.delete('/:id', auth, requirePerm('USUARIOS'), async (req, res) => {
    const id = Number(req.params.id);
    const hard = String(req.query.hard || '') === 'true';
    try {
      if (hard) {
        await prisma.usuario.delete({ where: { id } });
        return res.status(204).send();
      }
      const u = await prisma.usuario.update({
        where: { id },
        data: { estado: false },
        include: { rol: true },
      });
      res.json(usuarioPublico(u));
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // =========================
  // RESTAURAR
  // =========================
  router.post('/:id/restaurar', auth, requirePerm('USUARIOS'), async (req, res) => {
    try {
      const u = await prisma.usuario.update({
        where: { id: Number(req.params.id) },
        data: { estado: true },
        include: { rol: true },
      });
      res.json(usuarioPublico(u));
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // =========================
  // REENVIAR TEMPORAL
  // =========================
  router.post('/:id/reenviar-temporal', auth, requirePerm('USUARIOS'), async (req, res) => {
    const id = Number(req.params.id);
    try {
      const u = await prisma.usuario.findUnique({
        where: { id },
        include: { rol: true },
      });
      if (!u) return res.status(404).json({ mensaje: 'Usuario no existe' });

      const temp = randPass(10);
      const hash = await bcrypt.hash(temp, SALT_ROUNDS);

      await prisma.usuario.update({
        where: { id },
        data: {
          contrasena: hash,
          debeCambiarPassword: true,
          ultimoCambioContrasena: null,
        },
      });

      await sendTempPasswordEmail({
        to: u.correo,
        nombre: u.nombre,
        usuario: u.usuario,
        tempPassword: temp,
        rolNombre: u.rol?.nombre || 'Sin rol',
      });

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // =========================
  // RECUPERAR (usuario + correo, público)  **CON CÓDIGOS Y COOLDOWN**
  // =========================
  router.post('/recuperar', async (req, res) => {
    try {
      const { usuario, correo } = req.body || {};
      const u = String(usuario || '').trim();
      const m = String(correo || '').trim().toLowerCase();

      if (!u || !m) {
        return res.status(400).json({ code: 'BAD_REQUEST', mensaje: 'Faltan usuario y correo.' });
      }

      const user = await prisma.usuario.findFirst({
        where: { usuario: u, estado: true },
        include: { rol: true },
      });

      if (!user) {
        return res.status(404).json({ code: 'NO_USER', mensaje: 'Usuario no encontrado.' });
      }

      if ((user.correo || '').toLowerCase() !== m) {
        return res.status(409).json({ code: 'MISMATCH', mensaje: 'Usuario y correo no coinciden.' });
      }

      if (user.ultimoEnvioRecuperacion) {
        const lastMs = new Date(user.ultimoEnvioRecuperacion).getTime();
        const nowMs = Date.now();
        const cooldownMs = RECOVERY_MIN_HOURS * 60 * 60 * 1000;
        const elapsed = nowMs - lastMs;

        if (elapsed < cooldownMs) {
          const remainingMs = cooldownMs - elapsed;
          const nextAllowedAt = new Date(nowMs + remainingMs).toISOString();
          const retryAfterSec = Math.ceil(remainingMs / 1000);
          setRetryAfter(res, retryAfterSec);
          return res.status(429).json({
            code: 'COOLDOWN',
            mensaje: `Ya se solicitó un restablecimiento recientemente.`,
            retryAfterSec,
            nextAllowedAt,
          });
        }
      }

      const temp = generarContrasenaTemporal(12);
      const hash = await bcrypt.hash(temp, SALT_ROUNDS);

      await prisma.usuario.update({
        where: { id: user.id },
        data: {
          contrasena: hash,
          debeCambiarPassword: true,
          ultimoCambioContrasena: null,
          ultimoEnvioRecuperacion: new Date(),
        },
      });

      if (typeof sendTempPasswordEmail === 'function') {
        await sendTempPasswordEmail({
          to: user.correo,
          nombre: user.nombre,
          usuario: user.usuario,
          tempPassword: temp,
          rolNombre: user.rol?.nombre || 'Sin rol',
        });
      } else {
        console.log(`[RECUPERAR] Usuario=${user.usuario} Email=${user.correo} Temp=${temp}`);
      }

      return res.json({
        ok: true,
        code: 'OK_SENT',
        mensaje: `Te enviamos un correo a ${m} con instrucciones.`,
      });
    } catch (e) {
      console.error('POST /usuarios/recuperar error:', e);
      return res.status(500).json({ code: 'ERROR', mensaje: 'No se pudo procesar la solicitud.' });
    }
  });

  // =========================
  // VALIDAR NUEVA CONTRA VS HISTORIAL (público)
  // =========================
  router.post('/:id/validar-nueva', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { actual, nueva } = req.body || {};
      if (!id || !actual || !nueva) {
        return res.status(200).json({ reutilizada: false });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        include: {
          contrasenaHistoriales: {
            orderBy: { creadoEn: 'desc' },
            take: HISTORY_LIMIT,
          },
        },
      });
      if (!usuario || !usuario.estado || !usuario.contrasena) {
        return res.status(200).json({ reutilizada: false });
      }

      const okActual = await bcrypt.compare(actual, usuario.contrasena);
      if (!okActual) {
        return res.status(200).json({ reutilizada: false });
      }

      for (const h of usuario.contrasenaHistoriales) {
        const same = await bcrypt.compare(nueva, h.hash);
        if (same) return res.status(200).json({ reutilizada: true });
      }
      const sameCurrent = await bcrypt.compare(nueva, usuario.contrasena);
      if (sameCurrent) return res.status(200).json({ reutilizada: true });

      return res.status(200).json({ reutilizada: false });
    } catch (e) {
      console.error('POST /usuarios/:id/validar-nueva error:', e);
      return res.status(200).json({ reutilizada: false });
    }
  });

  // =========================
  // CAMBIAR PASSWORD PRIMERA VEZ (público)
  // =========================
  router.post('/:id/cambiar-password-primera-vez', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { actual, nueva } = (req.body || {});

      if (!id || !actual || !nueva) {
        return res.status(400).json({ mensaje: 'Faltan campos' });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        include: {
          rol: true,
          contrasenaHistoriales: {
            orderBy: { creadoEn: 'desc' },
            take: HISTORY_LIMIT,
          }
        }
      });
      if (!usuario || !usuario.estado || !usuario.contrasena) {
        return res.status(404).json({ mensaje: 'Usuario no encontrado' });
      }

      const okActual = await bcrypt.compare(actual, usuario.contrasena);
      if (!okActual) {
        return res.status(401).json({ mensaje: 'Contraseña temporal incorrecta' });
      }

      if (String(nueva).length < 8) {
        return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 8 caracteres.' });
      }

      for (const h of usuario.contrasenaHistoriales) {
        const same = await bcrypt.compare(nueva, h.hash);
        if (same) {
          return res.status(400).json({ mensaje: `No puedes reutilizar las últimas ${HISTORY_LIMIT} contraseñas.` });
        }
      }
      const sameCurrent = await bcrypt.compare(nueva, usuario.contrasena);
      if (sameCurrent) {
        return res.status(400).json({ mensaje: `No puedes reutilizar las últimas ${HISTORY_LIMIT} contraseñas.` });
      }

      const nuevoHash = await bcrypt.hash(nueva, SALT_ROUNDS);
      await prisma.$transaction([
        prisma.contrasenaHistorial.create({
          data: { usuarioId: usuario.id, hash: nuevoHash },
        }),
        prisma.usuario.update({
          where: { id: usuario.id },
          data: {
            contrasena: nuevoHash,
            ultimoCambioContrasena: new Date(),
            debeCambiarPassword: false,
          },
        }),
      ]);
      await podarHistorialSiExcede(usuario.id);

      const token = emitirToken(usuario);
      const usuarioPub = usuarioPublico(usuario);

      return res.json({ ok: true, token, usuario: usuarioPub });
    } catch (e) {
      console.error('POST /usuarios/:id/cambiar-password-primera-vez error:', e);
      return res.status(500).json({ mensaje: 'Error interno' });
    }
  });

  // =========================
  // CAMBIO DE CONTRASEÑA (propio, autenticado) - aplica cooldown
  // =========================
  router.post('/me/cambiar-contrasena', auth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const { contrasenaActual, contrasenaNueva } = req.body || {};

      if (!userId) return res.status(401).json({ error: 'No autenticado' });
      if (!contrasenaActual || !contrasenaNueva) {
        return res.status(400).json({ error: 'Faltan campos: contrasenaActual y contrasenaNueva' });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id: userId },
        include: {
          contrasenaHistoriales: {
            orderBy: { creadoEn: 'desc' },
            take: HISTORY_LIMIT,
          },
        },
      });

      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (!usuario.contrasena) {
        return res.status(400).json({ error: 'El usuario no tiene contraseña establecida.' });
      }

      const ok = await bcrypt.compare(contrasenaActual, usuario.contrasena);
      if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

      if (!usuario.debeCambiarPassword && usuario.ultimoCambioContrasena) {
        const lastMs = new Date(usuario.ultimoCambioContrasena).getTime();
        const nowMs = Date.now();
        const cooldownMs = MIN_HOURS_BETWEEN_CHANGES * 60 * 60 * 1000;
        const elapsed = nowMs - lastMs;

        if (elapsed < cooldownMs) {
          const remainingMs = cooldownMs - elapsed;
          const nextAllowedAt = new Date(nowMs + remainingMs).toISOString();
          const retryAfterSec = Math.ceil(remainingMs / 1000);
          setRetryAfter(res, retryAfterSec);
          return res.status(429).json({
            code: 'PASSWORD_COOLDOWN',
            error: `Debes esperar ${Math.ceil(remainingMs / (60 * 60 * 1000))} hora(s) para volver a cambiar la contraseña.`,
            remainingMs,
            nextAllowedAt,
          });
        }
      }

      for (const h of usuario.contrasenaHistoriales) {
        const same = await bcrypt.compare(contrasenaNueva, h.hash);
        if (same) {
          return res
            .status(400)
            .json({ error: `No puedes reutilizar las últimas ${HISTORY_LIMIT} contraseñas.` });
        }
      }
      const sameCurrent = await bcrypt.compare(contrasenaNueva, usuario.contrasena);
      if (sameCurrent) {
        return res
          .status(400)
          .json({ error: `No puedes reutilizar las últimas ${HISTORY_LIMIT} contraseñas.` });
      }

      if (String(contrasenaNueva).length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
      }

      const nuevoHash = await bcrypt.hash(contrasenaNueva, SALT_ROUNDS);
      await prisma.$transaction([
        prisma.contrasenaHistorial.create({
          data: { usuarioId: usuario.id, hash: nuevoHash },
        }),
        prisma.usuario.update({
          where: { id: usuario.id },
          data: {
            contrasena: nuevoHash,
            ultimoCambioContrasena: new Date(),
            debeCambiarPassword: false,
          },
        }),
      ]);
      await podarHistorialSiExcede(usuario.id);

      return res.json({ mensaje: 'Contraseña actualizada correctamente' });
    } catch (e) {
      console.error('POST /me/cambiar-contrasena error:', e);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  return router;
};
