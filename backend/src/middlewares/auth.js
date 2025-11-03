// backend/src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secreto123';

function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ mensaje: 'Token requerido' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // payload: { id, usuario, rol, rolId, permisos: [...] }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Token inválido o expirado' });
  }
}

function requirePermisos(...necesarios) {
  return (req, res, next) => {
    const permisos = req.user?.permisos || [];
    const ok = necesarios.every(p => permisos.includes(p));
    if (!ok) return res.status(403).json({ mensaje: 'Permisos insuficientes' });
    next();
  };
}

module.exports = { auth, requirePermisos };
