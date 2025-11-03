// backend/index.js (ESM)
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';

// ===== Servicios =====
import * as emailSvc from './src/services/email.js'; // ESM
const { sendNewUserEmail, sendTempPasswordEmail } = emailSvc;

// ===== Routers en CommonJS (.cjs) =====
// (al importar CJS desde ESM, el "default" es module.exports)
import usuariosRoutes     from './src/routes/usuarios.routes.cjs';
import areasRoutes        from './src/routes/areas.routes.cjs';
import bolsasRoutes       from './src/routes/bolsas.routes.cjs';
import tiposDesechoRoutes from './src/routes/tiposDesecho.routes.cjs';
import qrRoutes           from './src/routes/qr.routes.cjs';
import reportesRoutes     from './src/routes/reportes.desechos.cjs';
import registroRoutes     from './src/routes/registro.routes.cjs';
// import dashboardRoutes  from './src/routes/dashboard.routes.cjs'; // si aplica

// ===== Rutas de balanza (CJS) =====
import scaleRoutesFactory from './src/scale/scale.routes.cjs'; // CJS

// __dirname / __filename en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// App/Server/DB
const app = express();
const server = createServer(app);
const prisma = new PrismaClient({
  log: [{ level: 'query', emit: 'event' }, 'warn', 'error'],
});
prisma.$on('query', (e) => {
  if (e.duration > 500) console.log('[SQL lenta]', e.duration + 'ms', e.query);
});

// ===== Keep-alive para Neon (evita cold start) =====
const KEEPALIVE_MS = 60_000; // 1 minuto
let keepAliveTimer = null;

async function keepAlive() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.warn('keepAlive fallo:', e?.message || e);
  }
}
keepAlive();
keepAliveTimer = setInterval(keepAlive, KEEPALIVE_MS);

/* ===== Config red / seguridad desde .env ===== */
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'secreto123';

/* ===== CORS =====
   Agregamos tu dominio de Netlify y autorizamos Authorization header.
*/
const defaults = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://gestion-desechos-hospital.netlify.app',
  'https://desechoshospitalsantabarbara-production.up.railway.app',
];
const origins = (process.env.CORS_ORIGINS || defaults.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // permitir tools sin Origin (curl/Postman)
    cb(null, origins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // no usamos cookies; el token va en Authorization
};

// CORS global + respuesta a preflights
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* ===== Middlewares base ===== */
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Servir archivos subidos (legacy)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Servir PDFs y otros archivos guardados por el backend
app.use('/files', express.static(path.join(process.cwd(), 'files'), {
  fallthrough: true,
  maxAge: '1y',
}));

/* ==============================
   Rutas públicas mínimas
   ============================== */
app.get('/', (_req, res) => res.send('OK')); // raíz para probar en Railway

app.get('/health', (_req, res) => res.json({ ok: true, status: 'healthy' }));

// Ping a la BD y mide latencia
app.get('/health/db', async (_req, res) => {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`; // ping
    const ms = Date.now() - t0;
    const usuarios = await prisma.usuario.count().catch(() => null);
    res.json({ ok: true, db: 'up', pingMs: ms, usuarios });
  } catch (e) {
    console.error('DB health error:', e);
    res.status(500).json({ ok: false, db: 'down' });
  }
});

/* ==============================
   Asegurar permisos base
   ============================== */
(async function ensureBasePerms() {
  const base = [
    { nombre: 'ROLES', descripcion: 'Gestionar roles y permisos' },
    { nombre: 'USUARIOS', descripcion: 'Gestionar usuarios' },
    { nombre: 'AREAS', descripcion: 'Gestionar áreas' },
    { nombre: 'BOLSAS', descripcion: 'Gestionar bolsas' },
    { nombre: 'TIPOS_DESECHO', descripcion: 'Gestionar tipos de desecho' },
    { nombre: 'CODIGOS_QR', descripcion: 'Generar e imprimir códigos QR' },
    { nombre: 'REGISTRO_DIARIO', descripcion: 'Registro de residuos (escáner/QR y peso)' },
    { nombre: 'BALANZA', descripcion: 'Acceso a lectura de balanza (simulador/serial)' },
  ];
  try {
    for (const p of base) {
      await prisma.permiso.upsert({
        where: { nombre: p.nombre },
        update: {},
        create: p,
      });
    }
  } catch (e) {
    console.error('No se pudieron asegurar permisos base:', e);
  }
})();

/* ==============================
   Middlewares de Auth & Permisos
   ============================== */
function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ mensaje: 'Token requerido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Token inválido/expirado' });
  }
}

function requirePerm(perm) {
  return (req, res, next) => {
    const perms = req.user?.permisos || [];
    const needed = Array.isArray(perm) ? perm : [perm];
    const ok = needed.some((p) => perms.includes(p));
    if (!ok) return res.status(403).json({ mensaje: 'Permiso denegado' });
    next();
  };
}

/* ==============================
   Handlers de Auth
   ============================== */
async function loginHandler(req, res) {
  const { usuario, contrasena } = req.body;
  try {
    const user = await prisma.usuario.findUnique({
      where: { usuario },
      include: { rol: { include: { permisos: { include: { permiso: true } } } } },
    });
    if (!user) return res.status(401).json({ mensaje: 'Usuario no encontrado', autenticado: false });
    if (!user.estado) {
      return res.status(403).json({ mensaje: 'Usuario desactivado. Contacta al administrador.', autenticado: false });
    }
    const valido = await bcrypt.compare(contrasena, user.contrasena || '');
    if (!valido) return res.status(401).json({ mensaje: 'Credenciales incorrectas', autenticado: false });

    if (user.debeCambiarPassword) {
      return res.status(403).json({
        code: 'FIRST_CHANGE_REQUIRED',
        mensaje: 'Debes cambiar tu contraseña para continuar.',
        usuario: { id: user.id, usuario: user.usuario }
      });
    }

    const permisos = user.rol.permisos.map((rp) => rp.permiso.nombre);
    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, rol: user.rol.nombre, rolId: user.rolId, permisos },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      mensaje: 'Login exitoso',
      autenticado: true,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        correo: user.correo,
        rol: user.rol.nombre,
        rolId: user.rolId,
        permisos,
      },
      token,
    });
  } catch (e) {
    console.error('Error en login:', e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
}

async function recuperarHandler(req, res) {
  try {
    const { usuario, correo } = req.body || {};
    const generic = { ok: true, mensaje: 'Si los datos son correctos, enviaremos instrucciones a tu correo.' };
    if (!usuario || !correo) return res.json(generic);

    const u = await prisma.usuario.findUnique({ where: { usuario } });
    if (!u || !u.estado) return res.json(generic);
    if ((u.correo || '').toLowerCase() !== String(correo).toLowerCase()) return res.json(generic);

    const temp = Math.random().toString(36).slice(-10);
    const hash = await bcrypt.hash(temp, 10);
    await prisma.usuario.update({
      where: { id: u.id },
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
    });

    res.json(generic);
  } catch (e) {
    console.error('Error en /auth/recuperar:', e);
    res.json({ ok: true, mensaje: 'Si los datos son correctos, enviaremos instrucciones a tu correo.' });
  }
}

app.post('/login', loginHandler);
app.post('/usuarios/login', loginHandler);
app.post('/auth/recuperar', recuperarHandler);
app.post('/usuarios/recuperar', recuperarHandler);

/* ==============================
   Soporte autenticado simple (/me) + alias
   ============================== */
async function meHandler(req, res) {
  try {
    const u = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      include: { rol: { include: { permisos: { include: { permiso: true } } } } },
    });
    if (!u) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    const permisos = u.rol.permisos.map((rp) => rp.permiso.nombre);
    res.json({
      id: u.id,
      nombre: u.nombre,
      usuario: u.usuario,
      correo: u.correo,
      rol: u.rol.nombre,
      rolId: u.rolId,
      permisos,
      estado: u.estado,
    });
  } catch {
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
}
app.get('/me', auth, meHandler);
app.get('/usuarios/me', auth, meHandler);

/* ==============================
   Rutas de ROLES/PERMISOS
   ============================== */
app.get('/permisos', auth, requirePerm('ROLES'), async (_req, res) => {
  try {
    const permisos = await prisma.permiso.findMany({ orderBy: { id: 'asc' } });
    res.json(permisos);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

app.get('/roles/full', auth, requirePerm('ROLES'), async (_req, res) => {
  try {
    const roles = await prisma.rol.findMany({
      orderBy: { id: 'asc' },
      include: { permisos: { include: { permiso: true } }, _count: { select: { usuarios: true } } },
    });
    const data = roles.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      activo: r.activo,
      sistema: r.sistema,
      asignados: r._count.usuarios,
      permisos: r.permisos.map((rp) => rp.permiso.nombre),
    }));
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

app.get('/roles', auth, requirePerm('ROLES'), async (req, res) => {
  try {
    const { activo } = req.query;
    const where = typeof activo === 'string' ? { activo: activo === 'true' } : {};
    const roles = await prisma.rol.findMany({ where, orderBy: { nombre: 'asc' } });
    res.json(roles);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

app.get('/roles/:id', auth, requirePerm('ROLES'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rol = await prisma.rol.findUnique({ where: { id } });
    if (!rol) return res.status(404).json({ mensaje: 'Rol no encontrado' });
    res.json(rol);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

app.post('/roles', auth, requirePerm('ROLES'), async (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ mensaje: 'Nombre requerido' });
    const rol = await prisma.rol.create({ data: { nombre } });
    res.status(201).json(rol);
  } catch (e) {
    if (e?.code === 'P2002') return res.status(409).json({ mensaje: 'Ya existe un rol con ese nombre' });
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

app.patch('/roles/:id', auth, requirePerm('ROLES'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ mensaje: 'Nombre requerido' });

    const actual = await prisma.rol.findUnique({ where: { id } });
    if (!actual) return res.status(404).json({ mensaje: 'Rol no encontrado' });
    if (actual.sistema) {
      return res.status(400).json({ mensaje: 'Rol de sistema no se puede renombrar' });
    }

    const rol = await prisma.rol.update({ where: { id }, data: { nombre } });
    res.json(rol);
  } catch (e) {
    if (e?.code === 'P2002') return res.status(409).json({ mensaje: 'Ya existe un rol con ese nombre' });
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

app.patch('/roles/:id/disable', auth, requirePerm('ROLES'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actual = await prisma.rol.findUnique({
      where: { id },
      include: { _count: { select: { usuarios: true } } },
    });
    if (!actual) return res.status(404).json({ mensaje: 'Rol no encontrado' });
    if (actual.sistema)
      return res.status(400).json({ mensaje: 'Rol de sistema no se puede deshabilitar' });
    if (actual._count.usuarios > 0) {
      return res
        .status(400)
        .json({ mensaje: 'No se puede deshabilitar: hay usuarios asignados a este rol' });
    }

    const rol = await prisma.rol.update({ where: { id }, data: { activo: false } });
    res.json(rol);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

app.patch('/roles/:id/enable', auth, requirePerm('ROLES'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actual = await prisma.rol.findUnique({ where: { id } });
    if (!actual) return res.status(404).json({ mensaje: 'Rol no encontrado' });

    const rol = await prisma.rol.update({ where: { id }, data: { activo: true } });
    res.json(rol);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

app.delete('/roles/:id', auth, requirePerm('ROLES'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actual = await prisma.rol.findUnique({
      where: { id },
      include: { _count: { select: { usuarios: true, permisos: true } } },
    });
    if (!actual) return res.status(404).json({ mensaje: 'Rol no encontrado' });
    if (actual.sistema) return res.status(400).json({ mensaje: 'Rol de sistema no se puede eliminar' });
    if (actual.activo) return res.status(400).json({ mensaje: 'Deshabilita el rol antes de eliminarlo' });
    if (actual._count.usuarios > 0) {
      return res.status(400).json({ mensaje: 'No se puede eliminar: hay usuarios asignados' });
    }

    await prisma.permisoPorRol.deleteMany({ where: { rolId: id } });
    await prisma.rol.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
});

/* ==============================
   KPIs Dashboard (UTC-6 Guatemala)
   ============================== */
const GT_OFFSET_MS = -6 * 60 * 60 * 1000; // -06:00
function toGT(d = new Date()) { return new Date(d.getTime() + GT_OFFSET_MS); }
function fromGT(dGT) { return new Date(dGT.getTime() - GT_OFFSET_MS); }
function startOfGtDayUtc(d = new Date())  { const g = toGT(d); g.setHours(0,0,0,0);  return fromGT(g); }
function endOfGtDayUtc(d = new Date())    { const g = toGT(d); g.setHours(24,0,0,0); return fromGT(g); }
function startOfGtWeekUtc(d = new Date()) {
  const g = toGT(d); const dow = g.getDay(); // 0=Dom, 1=Lun...
  const diff = (dow === 0 ? -6 : 1 - dow);   // llevar a Lunes
  g.setDate(g.getDate() + diff); g.setHours(0,0,0,0);
  return fromGT(g);
}
function endOfGtWeekUtc(d = new Date()) { const s = startOfGtWeekUtc(d); return new Date(s.getTime() + 7*24*60*60*1000); }

app.get('/api/dashboard/kpis', auth, async (_req, res) => {
  try {
    const dayStart  = startOfGtDayUtc();
    const dayEnd    = endOfGtDayUtc();
    const weekStart = startOfGtWeekUtc();
    const weekEnd   = endOfGtWeekUtc();

    const [bolsasHoy, sumSemana, areasActivas, bolsasRegistradas] = await Promise.all([
      prisma.registroLinea.count({
        where: { registro: { abiertoAt: { gte: dayStart, lt: dayEnd } } }
      }),
      prisma.registroLinea.aggregate({
        where: { registro: { abiertoAt: { gte: weekStart, lt: weekEnd } } },
        _sum: { pesoLb: true }
      }),
      prisma.area.count({ where: { estado: true } }),
      prisma.bolsa.count({ where: { estado: true } })
    ]);

    const lbSemana = sumSemana?._sum?.pesoLb
      ? Number(parseFloat(sumSemana._sum.pesoLb.toString()).toFixed(1))
      : 0;

    res.json({ bolsasHoy, bolsasRegistradas, lbSemana, areasActivas });
  } catch (e) {
    console.error('KPIs dashboard:', e);
    res.status(500).json({ mensaje: 'No se pudieron calcular los KPIs' });
  }
});

/* ==============================
   Socket.IO + Balanza (lazy import)
   ============================== */
const io = new SocketIOServer(server, {
  cors: { origin: origins, credentials: true, methods: ['GET', 'POST'] }
});

let scaleSvc = null;
if (SCALE_ENABLED) {
  try {
    const mod = await import('./src/scale/scale.service.js'); // ESM
    const ScaleService = mod.ScaleService || mod.default || mod;
    scaleSvc = new ScaleService({ io });
  } catch (e) {
    console.warn('ScaleService no disponible (omitido en este entorno):', e?.message || e);
  }
}

io.on('connection', (socket) => {
  try { socket.emit('scale:status', { connected: !!scaleSvc?.isConnected?.() }); } catch {}
});

/* ==============================
   Montaje de routers de negocio
   ============================== */
app.use('/usuarios',     usuariosRoutes(prisma, { auth, requirePerm, sendNewUserEmail, sendTempPasswordEmail }));
app.use('/areas',        areasRoutes(prisma, { auth, requirePerm }));
app.use('/bolsas',       bolsasRoutes(prisma, { auth, requirePerm }));
app.use('/tipos-desecho',tiposDesechoRoutes(prisma, { auth, requirePerm }));
app.use('/qr',           qrRoutes(prisma, { auth, requirePerm }));
app.use('/reportes',     reportesRoutes(prisma, { auth, requirePerm }));
// app.use('/dashboard', dashboardRoutes(prisma, { auth, requirePerm })); // si aplica
app.use('/api',          registroRoutes(prisma, { auth, requirePerm }));

if (scaleSvc) {
  app.use('/scale', auth, requirePerm('BALANZA'), scaleRoutesFactory(scaleSvc));
} else {
  app.use('/scale', auth, requirePerm('BALANZA'), (_req, res) => {
    res.status(503).json({ mensaje: 'Módulo de balanza no disponible en este entorno' });
  });
}

/* ==============================
   Server
   ============================== */
function getLocalIPv4() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of (ifaces[name] || [])) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168.')) {
        return iface.address;
      }
    }
  }
  // fallback a la primera no interna
  for (const name of Object.keys(ifaces)) {
    for (const iface of (ifaces[name] || [])) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '0.0.0.0';
}

server.listen(PORT, HOST, () => {
  const ip = getLocalIPv4();
  console.log('================= BACKEND =================');
  console.log(`Local:        http://localhost:${PORT}`);
  console.log(`En la red:    http://${ip}:${PORT}`);
  console.log('===========================================');
});

// ===== Apagado limpio =====
async function gracefulShutdown() {
  try {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
