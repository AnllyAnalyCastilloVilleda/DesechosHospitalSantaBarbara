// backend/src/routes/registro.routes.js
const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

module.exports = function registroRoutes(prisma, { auth, requirePerm }) {
  const router = Router();

  // =========================
  // Multer y utilidades de archivos
  // =========================
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  });

  function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  function unlinkSafe(absPath) {
    try {
      if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (_) { /* ignore */ }
  }

  function urlToAbsPath(url) {
    // PDFs se sirven desde /files/...
    if (!url) return null;
    if (!url.startsWith('/files/')) return null;
    return path.join(process.cwd(), url.replace(/^\//, ''));
  }

  // =========================
  // Constantes de reporte (orden e identificación)
  // =========================
  const LB_POR_KG = 2.20462262185;

  const COLUMN_ORDER = [
    'Desechos Infecciosos',
    'Desechos Patológicos',
    'Desechos Punzocortantes',
    'Desechos Especiales',
    'Desecho Común',
  ];

  const AREA_ORDER = [
    'Medicina, Cirugía y Trauma Hombres y Mujeres, Rayos X',
    'Pediatría y Maternidad',
    'Consulta Externa',
    'Emergencia, costurería, psicología, despacho de farmacia, laboratorio, fisioterapia, trabajo social, transporte',
    'Intensivo',
    'Quirófano',
    'Sala de Partos',
    'Central de Equipo',
    'Cocina',
    'Lavandería',
    'Mantenimiento',
    'Intendencia',
    'Administración',
    'Área Verde',
    'Bodegas',
    'Gerencia',
  ];

  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();

  const asBool = (v, def = false) => {
    if (v == null) return def;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'si';
  };

  const ymdUTC = (d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Conversión unidades -> devuelve KG numérico o transforma LB->KG
  function coerceKg(body, query) {
    let v = body?.pesoKg ?? body?.kg ?? body?.peso ?? query?.kg ?? query?.peso;
    let unidad = (body?.unidad || query?.unidad || '').toString().toUpperCase();

    if (v == null) {
      const lbv = body?.pesoLb ?? body?.lb ?? query?.pesoLb ?? query?.lb;
      if (lbv != null) { v = lbv; unidad = 'LB'; }
    }

    if (typeof v === 'string') v = v.replace(',', '.');
    let n = Number(v);
    if (!Number.isFinite(n)) n = 0;
    n = Math.max(0, Math.min(10000, n));
    if (unidad === 'LB') n = n / LB_POR_KG;
    return n; // KG numérico
  }

  function roundTo3(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0.000';
    const clamped = Math.max(0, Math.min(10000, n));
    return (Math.round(clamped * 1000) / 1000).toFixed(3);
  }

  function todayRange() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const next = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, next };
  }

  // =========================
  // Model keys (compat nombres)
  // =========================
  const keys = {
    etiqueta:
      prisma.etiquetaQR ? 'etiquetaQR'
      : prisma.etiquetaQr ? 'etiquetaQr'
      : prisma.etiquetaqr ? 'etiquetaqr'
      : null,
    bolsa: prisma.bolsa ? 'bolsa' : null,
    area: prisma.area ? 'area' : null,
    tipoDesecho:
      prisma.tipoDesecho ? 'tipoDesecho'
      : prisma.tipodesecho ? 'tipodesecho'
      : null,
    registro: prisma.registro ? 'registro' : null,
    registroLinea:
      prisma.registroLinea ? 'registroLinea'
      : prisma.registro_linea ? 'registro_linea'
      : null,
    usuario: prisma.usuario ? 'usuario' : null,
  };

  const M = {
    etiqueta: keys.etiqueta ? prisma[keys.etiqueta] : null,
    bolsa: keys.bolsa ? prisma[keys.bolsa] : null,
    area: keys.area ? prisma[keys.area] : null,
    tipoDesecho: keys.tipoDesecho ? prisma[keys.tipoDesecho] : null,
    registro: keys.registro ? prisma[keys.registro] : null,
    registroLinea: keys.registroLinea ? prisma[keys.registroLinea] : null,
    usuario: keys.usuario ? prisma[keys.usuario] : null,
  };

  function ensureModels(...needed) {
    const missing = needed.filter(k => !M[k] || !keys[k]);
    if (missing.length) {
      const available = Object.keys(prisma).filter(k => typeof prisma[k] === 'object' && !k.startsWith('$'));
      const err = new Error(`Modelos faltantes: ${missing.join(', ')}. Disponibles: ${available.join(', ')}`);
      err.code = 'MODELS_MISSING';
      throw err;
    }
  }

  // ===== REGISTRO ABIERTO GLOBAL =====
  async function getOrCreateRegistroAbierto(userId) {
    ensureModels('registro');

    let cab = await M.registro.findFirst({
      where: { estado: 'ABIERTO' },
      orderBy: { abiertoAt: 'desc' },
      select: { id: true }
    });

    if (!cab) {
      cab = await M.registro.create({
        data: { creadoPorId: Number(userId), estado: 'ABIERTO' },
        select: { id: true }
      });
    }
    return cab;
  }

  async function recalcTotalPeso(registroId) {
    ensureModels('registro', 'registroLinea');
    const agg = await M.registroLinea.aggregate({
      where: { registroId: Number(registroId) },
      _sum: { pesoLb: true }
    });
    await M.registro.update({
      where: { id: Number(registroId) },
      data: { totalPesoLb: agg._sum.pesoLb || 0 }
    });
  }

  // =========================
  // Resolver de Tipos (solo por nombre con sinónimos)
  // =========================
  const TIPO_SYNONYMS = {
    [norm('Desechos Infecciosos')]: [
      'infeccioso', 'infecciosos', 'residuos infecciosos', 'bioinfeccioso', 'bioinfecciosos', 'inf'
    ],
    [norm('Desechos Patológicos')]: [
      'patologico', 'patologicos', 'anatomopatologico', 'anatomopatologicos', 'anat', 'pat'
    ],
    [norm('Desechos Punzocortantes')]: [
      'punzocortante', 'punzocortantes', 'cortopunzante', 'cortopunzantes', 'corto-punzantes', 'punz', 'punzo'
    ],
    [norm('Desechos Especiales')]: [
      'especial', 'especiales', 'quimico', 'quimicos', 'farmaceutico', 'farmaceuticos', 'esp'
    ],
    [norm('Desecho Común')]: [
      'comun', 'ordinario', 'no peligroso', 'domiciliario', 'com'
    ],
  };

  function resolveTipoId(tiposDB, tituloEsperado) {
    const esperado = norm(tituloEsperado);
    const byName = new Map(tiposDB.map((t) => [norm(t.nombre), t]));
    if (byName.has(esperado)) return byName.get(esperado).id;

    const synonyms = TIPO_SYNONYMS[esperado] || [];
    for (const t of tiposDB) {
      const n = norm(t.nombre);
      if (synonyms.some((kw) => n.includes(norm(kw)))) return t.id;
    }
    return null;
  }

  // =========================
  // GET /api/registro/etiqueta-info
  // =========================
  function extractCodigoAreaBolsa(body) {
    const out = { codigo: null, areaId: null, bolsaId: null };

    if (body?.qr && typeof body.qr === 'string') {
      try {
        const payload = JSON.parse(body.qr);
        if (payload && payload.c) {
          out.codigo = String(payload.c);
          if (payload.a) out.areaId = Number(payload.a);
          if (payload.b) out.bolsaId = Number(payload.b);
          return out;
        }
      } catch (_) { /* ignore */ }
    }
    if (body?.codigo) out.codigo = String(body.codigo);
    return out;
  }

  router.get(
    '/registro/etiqueta-info',
    auth,
    requirePerm('REGISTRO_DIARIO'),
    async (req, res) => {
      try {
        ensureModels('etiqueta', 'bolsa', 'area', 'tipoDesecho');
        const codigo = String(req.query.codigo || '').trim();
        if (!codigo) return res.status(400).json({ mensaje: 'codigo requerido' });

        const etiqueta = await M.etiqueta.findUnique({ where: { codigo } });
        if (!etiqueta) return res.status(404).json({ mensaje: 'Etiqueta no encontrada' });

        const [area, bolsa] = await Promise.all([
          M.area.findUnique({ where: { id: etiqueta.areaId } }),
          M.bolsa.findUnique({ where: { id: etiqueta.bolsaId } }),
        ]);

        let tipoDesecho = null;
        if (bolsa?.tipoDesechoId) {
          tipoDesecho = await M.tipoDesecho.findUnique({ where: { id: bolsa.tipoDesechoId } });
        }

        res.json({ etiqueta, area, bolsa, tipoDesecho });
      } catch (e) {
        if (e?.code === 'MODELS_MISSING') {
          console.error(e.message);
          return res.status(500).json({ mensaje: e.message });
        }
        console.error('Error GET /registro/etiqueta-info:', e);
        res.status(500).json({ mensaje: 'Error consultando etiqueta' });
      }
    }
  );

  // =========================
  // POST /api/registro/lineas
  // =========================
  router.post(
    '/registro/lineas',
    auth,
    requirePerm('REGISTRO_DIARIO'),
    async (req, res) => {
      try {
        ensureModels('etiqueta', 'bolsa', 'registro', 'registroLinea');

        const { codigo, areaId: hintedArea, bolsaId: hintedBolsa } = extractCodigoAreaBolsa(req.body || {});

        const kgNum = coerceKg(req.body, req.query);
        const lbNum = kgNum * LB_POR_KG;
        const kgStr = roundTo3(kgNum);
        const lbStr = roundTo3(lbNum);

        if (!codigo) {
          return res.status(400).json({ mensaje: 'Falta el código/QR escaneado' });
        }

        const etiqueta = await M.etiqueta.findUnique({ where: { codigo } });
        if (!etiqueta) return res.status(404).json({ mensaje: 'Etiqueta no encontrada' });
        if (etiqueta.estado === 'USADA')  return res.status(409).json({ mensaje: 'La etiqueta ya fue usada' });
        if (etiqueta.estado === 'ANULADA') return res.status(409).json({ mensaje: 'La etiqueta está ANULADA' });

        if (hintedArea && hintedArea !== etiqueta.areaId) {
          return res.status(400).json({ mensaje: 'El QR no coincide con el área esperada' });
        }
        if (hintedBolsa && hintedBolsa !== etiqueta.bolsaId) {
          return res.status(400).json({ mensaje: 'El QR no coincide con la bolsa esperada' });
        }

        const bolsa = etiqueta.bolsaId ? await M.bolsa.findUnique({ where: { id: etiqueta.bolsaId } }) : null;
        if (!bolsa?.tipoDesechoId) {
          return res.status(400).json({ mensaje: 'La bolsa de esta etiqueta no tiene tipo de desecho asignado' });
        }

        const cabecera = await getOrCreateRegistroAbierto(req.user.id);

        const linea = await prisma.$transaction(async (tx) => {
          const Etiq = tx[keys.etiqueta];
          const RegLinea = tx[keys.registroLinea];

          const up = await Etiq.updateMany({
            where: { id: etiqueta.id, estado: 'ACTIVA' },
            data: { estado: 'USADA', usadoEn: new Date(), usadoPorId: req.user.id },
          });
          if (up.count === 0) {
            const err = new Error('Etiqueta ya no está ACTIVA');
            err.code = 'ETIQUETA_CONFLICT';
            throw err;
          }

          return RegLinea.create({
            data: {
              registroId: cabecera.id,
              etiquetaId: etiqueta.id,
              areaId: etiqueta.areaId,
              bolsaId: etiqueta.bolsaId,
              tipoDesechoId: bolsa.tipoDesechoId,
              pesoLb: lbStr, // Decimal(string)
            },
          });
        });

        await recalcTotalPeso(cabecera.id);

        const [area, bolsaRow, tipo, reg] = await Promise.all([
          M.area.findUnique({ where: { id: linea.areaId } }),
          M.bolsa.findUnique({ where: { id: linea.bolsaId } }),
          M.tipoDesecho.findUnique({ where: { id: linea.tipoDesechoId } }),
          M.registro.findUnique({
            where: { id: linea.registroId },
            select: { id: true, creadoPorId: true, abiertoAt: true, estado: true, totalPesoLb: true },
          }),
        ]);
        const responsable = reg?.creadoPorId
          ? await M.usuario.findUnique({
              where: { id: reg.creadoPorId },
              select: { id: true, nombre: true, usuario: true },
            })
          : null;

        return res.status(201).json({
          ok: true,
          item: {
            ...linea,
            pesoKg: kgStr,
            etiqueta,
            area,
            bolsa: bolsaRow,
            tipoDesecho: tipo,
            registro: reg,
            responsable,
          },
        });
      } catch (e) {
        if (e?.code === 'ETIQUETA_CONFLICT') {
          return res.status(409).json({ mensaje: 'La etiqueta ya fue usada por otro registro' });
        }
        if (e?.code === 'MODELS_MISSING') {
          console.error(e.message);
          return res.status(500).json({ mensaje: e.message });
        }
        console.error('Error POST /registro/lineas:', e);
        return res.status(500).json({ mensaje: 'Error creando registro' });
      }
    }
  );

  // =========================
  // GET /api/registro  (líneas)
  // =========================
  router.get(
    '/registro',
    auth,
    requirePerm('REGISTRO_DIARIO'),
    async (req, res) => {
      try {
        ensureModels('registroLinea', 'registro');

        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
        const skip = (page - 1) * pageSize;

        const where = {};

        const abierto = String(req.query.abierto ?? 'true') === 'true';
        const hoy = String(req.query.hoy ?? 'false') === 'true';

        if (abierto) {
          const cabs = await M.registro.findMany({
            where: { estado: 'ABIERTO' },
            select: { id: true },
          });
          const ids = cabs.map(c => c.id);
          if (ids.length === 0) {
            return res.json({ page, pageSize, total: 0, items: [] });
          }
          where.registroId = { in: ids };
        } else if (hoy) {
          const { start, next } = todayRange();
          const cabs = await M.registro.findMany({
            where: { abiertoAt: { gte: start, lt: next } },
            select: { id: true },
          });
          const ids = cabs.map(c => c.id);
          if (ids.length === 0) {
            return res.json({ page, pageSize, total: 0, items: [] });
          }
          where.registroId = { in: ids };
        }

        if (req.query.areaId) where.areaId = Number(req.query.areaId);
        if (req.query.bolsaId) where.bolsaId = Number(req.query.bolsaId);

        if (req.query.codigo) {
          ensureModels('etiqueta');
          const etis = await M.etiqueta.findMany({
            where: { codigo: String(req.query.codigo) },
            select: { id: true },
          });
          const eids = etis.map(e => e.id);
          if (eids.length === 0) {
            return res.json({ page, pageSize, total: 0, items: [] });
          }
          where.etiquetaId = { in: eids };
        }

        const [total, items] = await Promise.all([
          M.registroLinea.count({ where }),
          M.registroLinea.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { id: 'desc' },
          }),
        ]);

        const etiquetaIds = [...new Set(items.map(i => i.etiquetaId).filter(Boolean))];
        const areaIds = [...new Set(items.map(i => i.areaId).filter(Boolean))];
        const bolsaIds = [...new Set(items.map(i => i.bolsaId).filter(Boolean))];
        const tipoIds = [...new Set(items.map(i => i.tipoDesechoId).filter(Boolean))];
        const regIds = [...new Set(items.map(i => i.registroId).filter(Boolean))];

        const [etiquetas, areas, bolsas, tipos, registros] = await Promise.all([
          etiquetaIds.length ? M.etiqueta.findMany({ where: { id: { in: etiquetaIds } } }) : [],
          areaIds.length ? M.area.findMany({ where: { id: { in: areaIds } } }) : [],
          bolsaIds.length ? M.bolsa.findMany({ where: { id: { in: bolsaIds } } }) : [],
          tipoIds.length ? M.tipoDesecho.findMany({ where: { id: { in: tipoIds } } }) : [],
          regIds.length
            ? M.registro.findMany({
                where: { id: { in: regIds } },
                select: { id: true, creadoPorId: true, abiertoAt: true, estado: true, totalPesoLb: true },
              })
            : [],
        ]);

        const respIds = [...new Set(registros.map(r => r.creadoPorId).filter(Boolean))];
        const usuarios = respIds.length
          ? await M.usuario.findMany({
              where: { id: { in: respIds } },
              select: { id: true, nombre: true, usuario: true },
            })
          : [];

        const byId = (arr) => Object.fromEntries((arr || []).map(x => [x.id, x]));
        const mapEtiqueta = byId(etiquetas);
        const mapArea = byId(areas);
        const mapBolsa = byId(bolsas);
        const mapTipo = byId(tipos);
        const mapReg = byId(registros);
        const mapUsu = byId(usuarios);

        const enriched = items.map(i => {
          const reg = mapReg[i.registroId];
          const responsable = reg ? mapUsu[reg.creadoPorId] || null : null;
          const kgStr = roundTo3((Number(i.pesoLb) || 0) / LB_POR_KG);
          return {
            ...i,
            pesoKg: kgStr,
            etiqueta: mapEtiqueta[i.etiquetaId] || null,
            area: mapArea[i.areaId] || null,
            bolsa: mapBolsa[i.bolsaId] || null,
            tipoDesecho: mapTipo[i.tipoDesechoId] || null,
            registro: reg || null,
            responsable,
          };
        });

        res.json({ page, pageSize, total, items: enriched });
      } catch (e) {
        if (e?.code === 'MODELS_MISSING') {
          console.error(e.message);
          return res.status(500).json({ mensaje: e.message });
        }
        console.error('Error GET /registro:', e);
        res.status(500).json({ mensaje: 'Error listando registros' });
      }
    }
  );

  // =========================
  // GET /api/registro/historial  (cabeceras CERRADAS con PDF)
  // =========================
  router.get(
    '/registro/historial',
    auth,
    requirePerm('REGISTRO_DIARIO'),
    async (req, res) => {
      try {
        ensureModels('registro', 'usuario');

        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
        const skip = (page - 1) * pageSize;

        const where = { estado: 'CERRADO', pdfUrl: { not: null } };

        if (req.query.desde) {
          const d = new Date(String(req.query.desde));
          if (!isNaN(d)) where.cerradoAt = { ...(where.cerradoAt||{}), gte: d };
        }
        if (req.query.hasta) {
          const h = new Date(String(req.query.hasta));
          if (!isNaN(h)) where.cerradoAt = { ...(where.cerradoAt||{}), lte: h };
        }

        if (req.query.cerradoPorId) {
          where.cerradoPorId = Number(req.query.cerradoPorId);
        }

        if (req.query.encargado) {
          const term = String(req.query.encargado || '').trim();
          if (term) {
            const users = await M.usuario.findMany({
              where: {
                OR: [
                  { nombre: { contains: term, mode: 'insensitive' } },
                  { usuario: { contains: term, mode: 'insensitive' } },
                ]
              },
              select: { id: true }
            });
            const ids = users.map(u => u.id);
            if (ids.length === 0) {
              return res.json({ page, pageSize, total: 0, items: [] });
            }
            where.cerradoPorId = { in: ids };
          }
        }

        const [total, regs] = await Promise.all([
          M.registro.count({ where }),
          M.registro.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { cerradoAt: 'desc' },
            select: {
              id: true,
              cerradoAt: true,
              pdfUrl: true,
              creadoPorId: true,
              cerradoPorId: true,
              totalPesoLb: true,
            }
          })
        ]);

        const idsUsers = [
          ...new Set(regs.flatMap(r => [r.creadoPorId, r.cerradoPorId]).filter(Boolean))
        ];

        const users = idsUsers.length
          ? await M.usuario.findMany({
              where: { id: { in: idsUsers } },
              select: { id: true, nombre: true, usuario: true }
            })
          : [];

        const uMap = Object.fromEntries(users.map(u => [u.id, u]));

        const items = regs.map(r => ({
          id: r.id,
          cerradoAt: r.cerradoAt,
          pdfUrl: r.pdfUrl,
          totalPesoLb: r.totalPesoLb,
          creadoPor: uMap[r.creadoPorId] || null,
          cerradoPor: uMap[r.cerradoPorId] || null,
        }));

        res.json({ page, pageSize, total, items });
      } catch (e) {
        if (e?.code === 'MODELS_MISSING') {
          console.error(e.message);
          return res.status(500).json({ mensaje: e.message });
        }
        console.error('Error GET /registro/historial:', e);
        res.status(500).json({ mensaje: 'Error listando historial' });
      }
    }
  );

  // =========================
  // DELETE /api/registro/historial/:id
  // =========================
  router.delete(
    '/registro/historial/:id',
    auth,
    requirePerm('REGISTRO_DIARIO'),
    async (req, res) => {
      try {
        ensureModels('registro', 'registroLinea');

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ mensaje: 'ID inválido' });
        }

        const reg = await M.registro.findUnique({
          where: { id },
          select: { id: true, estado: true, pdfUrl: true }
        });

        if (!reg) return res.status(404).json({ mensaje: 'Registro no existe' });
        if (reg.estado !== 'CERRADO') {
          return res.status(409).json({ mensaje: 'Solo se pueden eliminar registros CERRADOS' });
        }

        const abs = urlToAbsPath(reg.pdfUrl);
        unlinkSafe(abs);

        await prisma.$transaction(async (tx) => {
          const RegLinea = tx[keys.registroLinea];
          const Reg = tx[keys.registro];

          await RegLinea.deleteMany({ where: { registroId: id } });
          await Reg.delete({ where: { id } });
        });

        return res.status(204).send();
      } catch (e) {
        if (e?.code === 'MODELS_MISSING') {
          console.error(e.message);
          return res.status(500).json({ mensaje: e.message });
        }
        console.error('Error DELETE /registro/historial/:id', e);
        return res.status(500).json({ mensaje: 'No se pudo eliminar' });
      }
    }
  );

  // =========================
  // DELETE /api/registro/lineas/:id
  // =========================
  router.delete(
    '/registro/lineas/:id',
    auth,
    requirePerm('REGISTRO_DIARIO'),
    async (req, res) => {
      try {
        ensureModels('registroLinea', 'etiqueta', 'registro');
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ mensaje: 'ID inválido' });
        }

        const linea = await M.registroLinea.findUnique({ where: { id } });
        if (!linea) return res.status(404).json({ mensaje: 'Registro no encontrado' });

        const etiqueta = linea.etiquetaId
          ? await M.etiqueta.findUnique({ where: { id: linea.etiquetaId } })
          : null;

        await prisma.$transaction(async (tx) => {
          const Etiq = tx[keys.etiqueta];
          const RegLinea = tx[keys.registroLinea];

          if (etiqueta?.estado === 'USADA') {
            await Etiq.update({
              where: { id: etiqueta.id },
              data: { estado: 'ACTIVA', usadoEn: null, usadoPorId: null },
            });
          }

          await RegLinea.delete({ where: { id } });
        });

        await recalcTotalPeso(linea.registroId);

        res.status(204).send();
      } catch (e) {
        if (e?.code === 'MODELS_MISSING') {
          console.error(e.message);
          return res.status(500).json({ mensaje: e.message });
        }
        console.error('Error DELETE /registro/lineas/:id:', e);
        res.status(500).json({ mensaje: 'Error eliminando registro' });
      }
    }
  );

  // =========================
  // POST /api/registro/:id/cerrar  (acepta multipart o base64)
  //     -> valida que haya líneas, recalcula total y
  //        devuelve RESUMEN por área/tipo (unidad lb|kg)
  // =========================
  router.post(
    '/registro/:id/cerrar',
    auth,
    requirePerm('REGISTRO_DIARIO'),
    upload.single('file'),
    async (req, res) => {
      try {
        ensureModels('registro', 'registroLinea', 'area', 'tipoDesecho');
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ mensaje: 'ID inválido' });
        }

        const reg0 = await M.registro.findUnique({ where: { id } });
        if (!reg0) return res.status(404).json({ mensaje: 'Registro no existe' });
        if (reg0.estado === 'CERRADO') {
          return res.status(409).json({ mensaje: 'El registro ya está cerrado' });
        }

        const lineCount = await M.registroLinea.count({ where: { registroId: id } });
        if (lineCount === 0) {
          return res.status(409).json({ mensaje: 'No puedes cerrar un registro vacío' });
        }

        await recalcTotalPeso(id);

        // PDF desde multipart o base64
        let pdfBuffer = null;
        let fileName = null;

        if (req.file && req.file.buffer) {
          pdfBuffer = req.file.buffer;
          fileName = req.file.originalname || `Hoja_oficial_${Date.now()}.pdf`;
        } else if (req.body && (req.body.pdfBase64 || req.body.pdf)) {
          const b64 = String(req.body.pdfBase64 || req.body.pdf)
            .replace(/^data:application\/pdf;base64,?/i, '');
          pdfBuffer = Buffer.from(b64, 'base64');
          fileName = req.body.filename || `Hoja_oficial_${Date.now()}.pdf`;
        } else {
          return res.status(400).json({ mensaje: 'No se recibió el PDF (archivo o base64).' });
        }

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const baseDir = path.join(process.cwd(), 'files', 'registros', `${y}`, `${m}`);
        ensureDir(baseDir);

        const safeName = String(fileName).replace(/[^\w\-.]+/g, '_');
        const finalName = `registro_${id}_${Date.now()}_${safeName}`;
        const absPath = path.join(baseDir, finalName);
        fs.writeFileSync(absPath, pdfBuffer);

        const pdfUrl = `/files/registros/${y}/${m}/${finalName}`;

        const reg = await M.registro.update({
          where: { id },
          data: {
            estado: 'CERRADO',
            cerradoAt: new Date(),
            cerradoPorId: req.user?.id || null,
            pdfUrl,
          },
          select: { id: true, estado: true, abiertoAt: true, cerradoAt: true, pdfUrl: true, cerradoPorId: true },
        });

        // ========= Resumen agregado (criterio por-registro) =========
        const unidad = String(req.query.unidad || req.body.unidad || 'lb').toLowerCase();
        const soloAreasConDatos = asBool(req.query.soloAreasConDatos ?? req.body?.soloAreasConDatos, false);
        if (!['lb', 'kg'].includes(unidad)) {
          return res.status(400).json({ mensaje: 'Parámetro unidad inválido (lb | kg)' });
        }

        // Catálogos (solo id/nombre)
        const [areasDB, tiposDB] = await Promise.all([
          M.area.findMany({ where: { estado: true }, select: { id: true, nombre: true } }),
          M.tipoDesecho.findMany({ where: { estado: true }, select: { id: true, nombre: true } }),
        ]);

        const areaByName = new Map(areasDB.map((a) => [norm(a.nombre), a]));
        const areas = AREA_ORDER.map((label) => {
          const found = areaByName.get(norm(label));
          return found ? { id: found.id, label } : { id: null, label };
        });

        const columnas = COLUMN_ORDER.map((titulo) => {
          const tipoId = resolveTipoId(tiposDB, titulo);
          return {
            id: tipoId,
            titulo,
            subtitulo: unidad === 'kg' ? 'Kilogramos' : 'Libras',
          };
        });

        const grupos = await M.registroLinea.groupBy({
          by: ['areaId', 'tipoDesechoId'],
          where: { registroId: id },
          _sum: { pesoLb: true },
        });

        const agg = new Map();
        for (const g of grupos) {
          if (!g.areaId || !g.tipoDesechoId) continue;
          const key = `${g.areaId}:${g.tipoDesechoId}`;
          const v = Number(g._sum.pesoLb || 0);
          if (!Number.isFinite(v)) continue;
          agg.set(key, (agg.get(key) || 0) + v);
        }

        const toUnidad = (lb) => {
          const n = Number(lb || 0);
          return Number(unidad === 'kg' ? (n / LB_POR_KG).toFixed(2) : n.toFixed(2));
        };

        const filas = [];
        for (const a of areas) {
          const valores = [];
          let tiene = false;
          for (const col of columnas) {
            let lb = 0;
            if (a.id && col.id) lb = agg.get(`${a.id}:${col.id}`) || 0;
            const val = toUnidad(lb);
            if (val > 0) tiene = true;
            valores.push({ tipoId: col.id, valor: val });
          }
          if (soloAreasConDatos && !tiene) continue;
          filas.push({
            areaId: a.id,
            area: a.label,
            valores,
            responsable: '',
          });
        }

        const totales = columnas.map((col) => {
          let sumLb = 0;
          if (col.id) {
            for (const a of areas) {
              if (!a.id) continue;
              sumLb += agg.get(`${a.id}:${col.id}`) || 0;
            }
          }
          return { tipoId: col.id, valor: toUnidad(sumLb) };
        });

        const resumen = {
          registroId: reg.id,
          estado: reg.estado,
          unidad,
          meta: {
            generadoEnUTC: new Date().toISOString(),
            factorLbPorKg: LB_POR_KG,
            rango: {
              desdeUTC: reg.abiertoAt ? reg.abiertoAt.toISOString?.() : null,
              hastaUTC: reg.cerradoAt ? reg.cerradoAt.toISOString?.() : null,
            },
            criterio: 'Suma únicamente las líneas del registro cerrado.',
          },
          encabezado: {
            linea1: 'Hospital Santa Bárbara',
            linea2: 'Colonia Santa Bárbara Morales, Izabal',
            linea3: 'Control Diario de los Desechos Hospitalarios',
            mostrarFecha: true,
            fecha: reg.abiertoAt ? ymdUTC(new Date(reg.abiertoAt)) : ymdUTC(new Date()),
          },
          columnas,
          filas,
          totales,
          firma: { nombre: '', cargo: '' },
        };

        return res.json({ ok: true, registro: reg, pdfUrl, resumen });
      } catch (e) {
        if (e?.code === 'MODELS_MISSING') {
          console.error(e.message);
          return res.status(500).json({ mensaje: e.message });
        }
        console.error('Error POST /registro/:id/cerrar:', e);
        return res.status(500).json({ mensaje: 'Error al cerrar el registro' });
      }
    }
  );

  // =========================
  // GET /api/balanza/sim
  // =========================
  let simState = { value: 0, ts: Date.now() };
  router.get(
    '/balanza/sim',
    auth,
    requirePerm('BALANZA'),
    async (req, res) => {
      try {
        const now = Date.now();

        if (req.query.force !== undefined) {
          const v = parseFloat(String(req.query.force).replace(',', '.'));
          simState.value = Number.isFinite(v) ? Math.max(0, Math.min(10000, v)) : 0;
          simState.ts = now;
          return res.json({ ok: true, kg: simState.value, stable: true, ts: now });
        }

        const jitter = (Math.random() - 0.5) * 0.1; // +/- 0.05
        let next = simState.value + jitter;
        if (Math.abs(next) < 0.02) next = 0;
        next = Math.max(0, Math.min(10000, next));
        simState.value = Math.round(next * 100) / 100;
        simState.ts = now;

        const stable = Math.abs(jitter) < 0.02;
        res.json({ ok: true, kg: simState.value, stable, ts: now });
      } catch (e) {
        console.error('Error GET /balanza/sim:', e);
        res.status(500).json({ mensaje: 'Error simulando lectura' });
      }
    }
  );

  return router;
};
